import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createS3DeliveryReader } from "./integration/support/s3.js";

const BUCKET = "wf-delivery-bucket";
const PREFIX = "records/";

interface StubObject {
  readonly key: string;
  readonly body: string;
  /** Omitted to simulate a listing that carries no `LastModified`. */
  readonly lastModified?: Date | null;
}

interface Stub {
  readonly client: S3Client;
  /** Every key `GetObject` was called for, in order, including repeats. */
  readonly fetched: string[];
  readonly listCount: () => number;
}

/**
 * An `S3Client` whose `send` serves one canned listing per poll, repeating the last
 * one once the script runs out. Real instance because `paginateListObjectsV2` rejects
 * anything that isn't `instanceof S3Client`.
 */
function stubS3(polls: StubObject[][]): Stub {
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "stub", secretAccessKey: "stub" },
  });
  const fetched: string[] = [];
  let listed = 0;

  vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const objects = polls[Math.min(listed, polls.length - 1)] ?? [];
      listed += 1;
      return {
        Contents: objects.map((object) => ({
          Key: object.key,
          LastModified: object.lastModified ?? undefined,
        })),
      };
    }

    if (command instanceof GetObjectCommand) {
      const key = command.input.Key ?? "";
      fetched.push(key);
      const object = polls.flat().find((candidate) => candidate.key === key);
      if (!object) throw new Error(`stub has no object for key ${key}`);
      return { Body: { transformToString: async () => object.body } };
    }

    throw new Error(`unexpected command: ${String(command)}`);
  });

  return { client, fetched, listCount: () => listed };
}

function makeReader(stub: Stub, since = new Date()) {
  return createS3DeliveryReader({ client: stub.client, bucket: BUCKET, prefix: PREFIX, since });
}

describe("s3 delivery reader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves with an object that only shows up on a later poll", async () => {
    const stub = stubS3([[], [], [{ key: "records/obj-1", body: '{"marker":"abc"}\n' }]]);

    const pending = makeReader(stub).waitForObjectContaining('{"marker":"abc"}');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toEqual({ key: "records/obj-1", body: '{"marker":"abc"}\n' });
    expect(stub.listCount()).toBeGreaterThan(1);
  });

  it("passes the bucket and prefix to every list", async () => {
    const stub = stubS3([[{ key: "records/obj-1", body: "needle" }]]);

    const pending = makeReader(stub).waitForObjectContaining("needle");
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;

    const listed = vi
      .mocked(stub.client.send)
      .mock.calls.map(([command]) => command)
      .filter((command) => command instanceof ListObjectsV2Command);
    expect(listed.length).toBeGreaterThan(0);
    for (const command of listed) {
      expect(command.input).toMatchObject({ Bucket: BUCKET, Prefix: PREFIX });
    }
  });

  it("fetches each key at most once across polls", async () => {
    const stub = stubS3([
      [{ key: "records/obj-1", body: "nothing useful" }],
      [
        { key: "records/obj-1", body: "nothing useful" },
        { key: "records/obj-2", body: "the needle" },
      ],
    ]);

    const pending = makeReader(stub).waitForObjectContaining("the needle");
    await vi.advanceTimersByTimeAsync(10_000);

    expect((await pending).key).toBe("records/obj-2");
    expect(stub.fetched).toEqual(["records/obj-1", "records/obj-2"]);
  });

  it("ignores objects delivered before the run started", async () => {
    const since = new Date();
    const stub = stubS3([
      [
        {
          key: "records/leftover",
          body: "the needle",
          lastModified: new Date(since.getTime() - 10 * 60_000),
        },
        { key: "records/undated", body: "the needle" },
      ],
    ]);

    const pending = makeReader(stub, since).waitForObjectContaining("the needle");
    await vi.advanceTimersByTimeAsync(10_000);

    expect((await pending).key).toBe("records/undated");
    expect(stub.fetched).toEqual(["records/undated"]);
  });

  it("rejects after the timeout with everything it saw", async () => {
    const stub = stubS3([[{ key: "records/obj-1", body: "delivered but not what we wanted" }]]);

    const pending = makeReader(stub)
      .waitForObjectContaining("never-delivered-marker")
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120_000);

    const error = await pending;
    if (!(error instanceof Error)) throw new Error(`expected a rejection, got ${String(error)}`);
    expect(error.message).toContain("never-delivered-marker");
    expect(error.message).toContain(BUCKET);
    expect(error.message).toContain(PREFIX);
    expect(error.message).toContain("records/obj-1");
    expect(error.message).toContain("delivered but not what we wanted");
    expect(error.message).toContain(String("delivered but not what we wanted".length));
  });

  it("waits out the initial delay before listing at all", async () => {
    const stub = stubS3([[{ key: "records/obj-1", body: "needle" }]]);

    const pending = makeReader(stub).waitForObjectContaining("needle", { initialDelayMs: 3_000 });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(stub.listCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(2);
    expect((await pending).key).toBe("records/obj-1");
  });

  it("polls at a flat interval until the deadline, then rejects", async () => {
    const stub = stubS3([[]]);

    const pending = makeReader(stub)
      .waitForObjectContaining("never", { timeoutMs: 500, initialDelayMs: 100, intervalMs: 50 })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await pending).toBeInstanceOf(Error);
    // Flat interval, not backoff: polls at 100ms, then every 50ms through the 500ms deadline.
    expect(stub.listCount()).toBe(9);
  });
});

describe("s3 delivery reader pagination", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads every page of a truncated listing", async () => {
    const client = new S3Client({
      region: "us-east-1",
      credentials: { accessKeyId: "stub", secretAccessKey: "stub" },
    });
    vi.spyOn(client, "send").mockImplementation(async (command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: "records/page-2", LastModified: new Date() }] }
          : {
              Contents: [{ Key: "records/page-1", LastModified: new Date() }],
              NextContinuationToken: "token",
            };
      }
      if (command instanceof GetObjectCommand) {
        const key = command.input.Key ?? "";
        return { Body: { transformToString: async () => `body of ${key}` } };
      }
      throw new Error(`unexpected command: ${String(command)}`);
    });

    const reader = createS3DeliveryReader({
      client,
      bucket: BUCKET,
      prefix: PREFIX,
      since: new Date(),
    });
    const found = await reader.waitForObjectContaining("body of records/page-2", {
      initialDelayMs: 0,
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    expect(found.key).toBe("records/page-2");
  });
});
