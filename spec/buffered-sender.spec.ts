import { BufferedSender } from "@/buffered-sender.js";
import type { MessageSender } from "@/firehose-sender.js";
import { RecordingSender } from "./support/harness.js";

/** A sender whose sends only settle when the test says so, for ordering assertions. */
class BlockingSender implements MessageSender {
  readonly sent: string[] = [];
  private readonly settle: Array<() => void> = [];

  send(message: string): Promise<unknown> {
    this.sent.push(message);
    return new Promise<void>((resolve) => this.settle.push(resolve));
  }

  /** Settles the nth send, oldest first. */
  release(index: number): void {
    this.settle[index]?.();
  }
}

describe("buffered sender", () => {
  it("holds messages until the record is full", async () => {
    const inner = new RecordingSender();
    const sender = new BufferedSender(inner, { bufferSize: 3 });

    const first = sender.send("a");
    const second = sender.send("b");
    expect(inner.sent).toEqual([]);

    const third = sender.send("c");
    await Promise.all([first, second, third]);

    expect(inner.sent).toEqual(["abc"]);
  });

  it("flushes before a message that would overflow the record", async () => {
    const inner = new RecordingSender();
    // 1 KiB of room and 400-byte messages: the third one doesn't fit.
    const sender = new BufferedSender(inner, { bufferSizeKb: 1 });
    const message = "x".repeat(400);

    const first = sender.send(message);
    const second = sender.send(message);
    const third = sender.send(message);
    await Promise.all([first, second]);

    expect(inner.sent).toEqual([message.repeat(2)]);

    await sender.flush();
    await third;
    expect(inner.sent).toEqual([message.repeat(2), message]);
  });

  it("fills a record to exactly the byte cap without spilling into the next one", async () => {
    const inner = new RecordingSender();
    const sender = new BufferedSender(inner, { bufferSizeKb: 1 });
    const half = "x".repeat(512);

    await Promise.all([sender.send(half), sender.send(half)]);

    expect(inner.sent).toEqual([half + half]);
  });

  it("measures the record in bytes, not characters", async () => {
    const inner = new RecordingSender();
    const sender = new BufferedSender(inner, { bufferSizeKb: 1 });
    // 512 four-byte emoji is 2 KiB, so this alone overflows a 1 KiB record.
    const message = "🔥".repeat(512);

    await sender.send(message);

    expect(inner.sent).toEqual([message]);
  });

  it("sends a message larger than the record cap on its own", async () => {
    const inner = new RecordingSender();
    const sender = new BufferedSender(inner, { bufferSizeKb: 1 });
    const big = "x".repeat(2048);

    await sender.send(big);

    expect(inner.sent).toEqual([big]);
  });

  it("resolves every message in a record with the sender's result", async () => {
    const result = { RecordId: "one-record" };
    const inner: MessageSender = { send: () => Promise.resolve(result) };
    const sender = new BufferedSender(inner, { bufferSize: 2 });

    const [first, second] = await Promise.all([sender.send("a"), sender.send("b")]);

    expect(first).toBe(result);
    expect(second).toBe(result);
  });

  it("buffers messages that arrive while a record is in flight into the next one", async () => {
    const inner = new BlockingSender();
    const sender = new BufferedSender(inner, { bufferSize: 2 });

    void sender.send("a");
    void sender.send("b");
    await Promise.resolve();
    expect(inner.sent).toEqual(["ab"]);

    void sender.send("c");
    void sender.send("d");
    await Promise.resolve();
    expect(inner.sent).toEqual(["ab"]);

    inner.release(0);
    await vi.waitFor(() => expect(inner.sent).toEqual(["ab", "cd"]));
  });

  it("preserves message order within a record", async () => {
    const inner = new RecordingSender();
    const sender = new BufferedSender(inner, { bufferSize: 3 });

    await Promise.all([sender.send("one\n"), sender.send("two\n"), sender.send("three\n")]);

    expect(inner.sent).toEqual(["one\ntwo\nthree\n"]);
  });

  describe("flush timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("flushes a partial record once the timeout elapses", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, { flushTimeout: 5_000 });

      const pending = sender.send("a");
      vi.advanceTimersByTime(4_999);
      expect(inner.sent).toEqual([]);

      vi.advanceTimersByTime(1);
      await pending;
      expect(inner.sent).toEqual(["a"]);
    });

    it("defaults to a 30 second timeout", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, {});

      const pending = sender.send("a");
      vi.advanceTimersByTime(29_999);
      expect(inner.sent).toEqual([]);

      vi.advanceTimersByTime(1);
      await pending;
      expect(inner.sent).toEqual(["a"]);
    });

    it("times out from the first message of a record, not the last", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, { flushTimeout: 5_000 });

      const first = sender.send("a");
      vi.advanceTimersByTime(4_000);
      const second = sender.send("b");
      vi.advanceTimersByTime(1_000);

      await Promise.all([first, second]);
      expect(inner.sent).toEqual(["ab"]);
    });

    it("doesn't send an empty record when the buffer is already drained", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, { bufferSize: 1, flushTimeout: 5_000 });

      await sender.send("a");
      vi.advanceTimersByTime(60_000);

      expect(inner.sent).toEqual(["a"]);
    });

    it("starts a fresh window for the record after one is sent", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, { bufferSize: 2, flushTimeout: 5_000 });

      await Promise.all([sender.send("a"), sender.send("b")]);

      const third = sender.send("c");
      vi.advanceTimersByTime(5_000);
      await third;

      expect(inner.sent).toEqual(["ab", "c"]);
    });

    it("drops the pending timeout once the record has been flushed by hand", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, { bufferSize: 100, flushTimeout: 5_000 });

      await Promise.all([sender.send("a"), sender.flush()]);
      vi.advanceTimersByTime(60_000);

      expect(inner.sent).toEqual(["a"]);
    });
  });

  it("leaves the flush timer unreferenced, so it can't hold the process open", async () => {
    const handles: NodeJS.Timeout[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const handle = realSetTimeout(...args);
      handles.push(handle);
      return handle;
    }) as typeof setTimeout);

    const sender = new BufferedSender(new RecordingSender(), { bufferSize: 100 });
    void sender.send("a");

    expect(handles).toHaveLength(1);
    expect(handles[0].hasRef()).toBe(false);

    vi.restoreAllMocks();
    await sender.flush();
  });

  describe("flush", () => {
    it("sends whatever is buffered", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, { bufferSize: 100 });

      const pending = sender.send("a");
      await sender.flush();

      expect(inner.sent).toEqual(["a"]);
      await pending;
    });

    it("does nothing when there's nothing buffered", async () => {
      const inner = new RecordingSender();
      const sender = new BufferedSender(inner, {});

      await sender.flush();

      expect(inner.sent).toEqual([]);
    });

    it("waits for a record already in flight", async () => {
      const inner = new BlockingSender();
      const sender = new BufferedSender(inner, { bufferSize: 1 });

      void sender.send("a");
      await Promise.resolve();
      let settled = false;
      const flushed = sender.flush().then(() => {
        settled = true;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      inner.release(0);
      await flushed;
      expect(settled).toBe(true);
    });
  });

  it("rejects every message in a record that fails to send", async () => {
    const inner = new RecordingSender();
    inner.failNext(new Error("send failure"));
    const sender = new BufferedSender(inner, { bufferSize: 2 });

    const first = sender.send("a");
    const second = sender.send("b");

    await expect(first).rejects.toThrow("send failure");
    await expect(second).rejects.toThrow("send failure");
  });

  it("keeps sending records after one fails", async () => {
    const inner = new RecordingSender();
    const sender = new BufferedSender(inner, { bufferSize: 1 });

    inner.failNext(new Error("send failure"));
    await expect(sender.send("a")).rejects.toThrow("send failure");

    inner.recover();
    await sender.send("b");
    expect(inner.sent).toEqual(["b"]);
  });

  it("sends records in the order they were buffered", async () => {
    const inner = new BlockingSender();
    const sender = new BufferedSender(inner, { bufferSize: 1 });

    void sender.send("first");
    await Promise.resolve();
    void sender.send("second");
    await Promise.resolve();

    // One record in flight at a time, so a slow send can't be overtaken by a later one.
    expect(inner.sent).toEqual(["first"]);

    inner.release(0);
    await vi.waitFor(() => expect(inner.sent).toEqual(["first", "second"]));
  });

  it.each([
    ["bufferSize", { bufferSize: 0 }],
    ["bufferSizeKb", { bufferSizeKb: 0 }],
    ["bufferSizeKb above the firehose record limit", { bufferSizeKb: 1_001 }],
    ["flushTimeout", { flushTimeout: 0 }],
    ["bufferSize that isn't a number", { bufferSize: Number.NaN }],
    ["unbounded bufferSize", { bufferSize: Number.POSITIVE_INFINITY }],
  ])("rejects an out of range %s", (_label, options) => {
    expect(() => new BufferedSender(new RecordingSender(), options)).toThrow(RangeError);
  });
});
