import type winston from "winston";
import { makeLogger } from "./support/harness.js";

/** winston writes one entry per turn of the loop, so each log needs a tick to land. */
async function logAll(logger: winston.Logger, messages: readonly string[]): Promise<void> {
  for (const message of messages) {
    logger.info(message);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const MESSAGES = ["one", "two", "three"] as const;

describe("firehose logger transport buffering", () => {
  it("sends each message as its own record when buffering isn't configured", async () => {
    const { logger, sent } = makeLogger();

    await logAll(logger, MESSAGES);

    expect(sent).toHaveLength(MESSAGES.length);
  });

  it("aggregates several log lines into one record", async () => {
    const { logger, sent, transport } = makeLogger({
      buffering: { bufferSize: MESSAGES.length },
      eol: "\n",
    });

    await logAll(logger, MESSAGES);
    await transport.flush();

    expect(sent).toHaveLength(1);
    const lines = sent[0].split("\n").filter(Boolean);
    expect(lines.map((line) => JSON.parse(line).message)).toEqual([...MESSAGES]);
  });

  it("sends the record once the formatted lines reach bufferSizeKb", async () => {
    const { logger, sent } = makeLogger({ buffering: { bufferSizeKb: 1 }, eol: "\n" });
    // Two lines of this go past 1 KiB, so the second one sends the first on its own.
    const wide = "x".repeat(600);

    await logAll(logger, [wide, wide]);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("sends a partial record when the flush timeout elapses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { logger, transport, sent } = makeLogger({ buffering: { flushTimeout: 1_000 } });
      const logged = new Promise((resolve) => transport.once("logged", resolve));

      await logAll(logger, ["one"]);
      expect(sent).toEqual([]);

      vi.advanceTimersByTime(1_000);
      await logged;

      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]).message).toBe("one");
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits "logged" per message with that message alone, not the record', async () => {
    const { logger, transport } = makeLogger({ buffering: { bufferSize: 2 } });

    const logged: string[] = [];
    transport.on("logged", (message: string) => logged.push(message));

    await logAll(logger, ["one", "two"]);

    await vi.waitFor(() =>
      expect(logged.map((line) => JSON.parse(line).message)).toEqual(["one", "two"]),
    );
  });

  it('emits "error" for every message in a record that fails', async () => {
    const { logger, sender } = makeLogger({ buffering: { bufferSize: 2 } });
    sender.failNext(new Error("send failure"));

    // On the logger, not the transport: winston re-emits transport errors there, and
    // its own listener runs first.
    const errors: Error[] = [];
    logger.on("error", (err: Error) => errors.push(err));

    await logAll(logger, ["one", "two"]);

    await vi.waitFor(() =>
      expect(errors).toEqual([new Error("send failure"), new Error("send failure")]),
    );
  });

  it("flushes buffered messages when the logger closes", async () => {
    const { logger, sent } = makeLogger({ buffering: { bufferSize: 100 } });

    await logAll(logger, MESSAGES);
    expect(sent).toEqual([]);

    // No explicit flush: closing the logger is the only thing sending what's buffered.
    logger.close();

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toContain("three");
  });

  it("flushes nothing when buffering isn't configured", async () => {
    const { logger, transport, sent } = makeLogger();

    await logAll(logger, ["one"]);
    await expect(transport.flush()).resolves.toBeUndefined();

    expect(sent).toHaveLength(1);
  });
});
