import { randomUUID } from "node:crypto";
import { DescribeDeliveryStreamCommand, FirehoseClient } from "@aws-sdk/client-firehose";
import winston from "winston";
import { BufferedSender } from "@/buffered-sender.js";
import { FirehoseSender } from "@/firehose-sender.js";
import { FirehoseTransport } from "@/firehose-transport.js";
import type { DeliveredObjectReader, FirehoseBackend, FirehoseTarget } from "./support/backend.js";

// Awaited one at a time: the `logged` event fires on promise resolution, so concurrent
// sends could resolve out of order. Sequential PutRecords still land in one delivered
// object, well inside Firehose's ~5s zero-buffering window.
async function logSerially(
  transport: FirehoseTransport,
  logger: winston.Logger,
  messages: readonly string[],
): Promise<string[]> {
  const sent: string[] = [];
  for (const message of messages) {
    const logged = new Promise<string>((resolve, reject) => {
      const onLogged = (line: string) => {
        transport.off("error", onError);
        resolve(line);
      };
      const onError = (err: unknown) => {
        transport.off("logged", onLogged);
        reject(err);
      };
      transport.once("logged", onLogged);
      transport.once("error", onError);
    });
    logger.info(message);
    sent.push(await logged);
  }
  return sent;
}

/**
 * Logs every message through a buffering transport and returns the lines it sent. They
 * can't be awaited one at a time the way `logSerially` does it: a buffered message only
 * reports `logged` once the whole record carrying it lands.
 */
async function logBuffered(
  transport: FirehoseTransport,
  logger: winston.Logger,
  messages: readonly string[],
): Promise<string[]> {
  const logged: string[] = [];
  transport.on("logged", (line: string) => logged.push(line));

  for (const message of messages) {
    logger.info(message);
    // winston writes one entry per turn of the loop.
    await new Promise((resolve) => setImmediate(resolve));
  }
  await transport.flush();
  await vi.waitFor(() => expect(logged).toHaveLength(messages.length));

  return logged;
}

const EOL_TEST_MESSAGES = ["one", "two", "three"] as const;

/**
 * Runs the same assertions against any `FirehoseBackend`, LocalStack or real AWS.
 * S3-delivery checks gate on `backend.deliversToS3` (see backend.ts) rather than
 * anything resolved inside `setUp`, since `skipIf` evaluates during collection,
 * before `beforeAll` runs.
 */
export function describeFirehoseContract(backend: FirehoseBackend): void {
  describe.skipIf(!backend.enabled)(`firehose contract (${backend.name})`, () => {
    let target: FirehoseTarget;
    let client: FirehoseClient;

    beforeAll(async () => {
      target = await backend.setUp();
      client = new FirehoseClient(target.firehoseOptions);
    });

    afterAll(async () => {
      client?.destroy();
      await backend.tearDown();
    });

    /** Narrows `target.delivered`, which only exists when `backend.deliversToS3` is true. */
    function delivered(): DeliveredObjectReader {
      if (!target.delivered) {
        throw new Error(`backend "${backend.name}" claims deliversToS3 but provided no reader`);
      }
      return target.delivered;
    }

    it("sends a record to a real firehose delivery stream", async () => {
      const sender = new FirehoseSender(target.streamName, client);

      const result = await sender.send("hello from a real firehose api call");

      expect(typeof result.RecordId).toBe("string");
      expect(result.RecordId?.length).toBeGreaterThan(0);
      expect(result.$metadata.httpStatusCode).toBe(200);
    });

    it("delivers a real winston log line end to end via firehoseOptions", async () => {
      const transport = new FirehoseTransport({
        streamName: target.streamName,
        firehoseOptions: target.firehoseOptions,
      });
      const logger = winston.createLogger({ transports: [transport] });

      const logged = new Promise<string>((resolve) => {
        transport.on("logged", resolve);
      });

      logger.info("real end to end message", { snakes: "delicious" });

      const message = await logged;
      const parsed = JSON.parse(message);
      expect(parsed.message).toBe("real end to end message");
      expect(parsed.snakes).toBe("delicious");
      expect(parsed.level).toBe("info");
    });

    it("delivers a real winston log line end to end via a preconstructed firehoseClient", async () => {
      // `firehoseOptions` is the only path the unit specs exercise, since their injected
      // `firehoseSender` short-circuits both it and `firehoseClient`. This is the one
      // place `options.firehoseClient ?? new FirehoseClient(...)` actually runs.
      const transport = new FirehoseTransport({
        streamName: target.streamName,
        firehoseClient: client,
      });
      const logger = winston.createLogger({ transports: [transport] });

      const logged = new Promise<string>((resolve) => {
        transport.on("logged", resolve);
      });

      logger.info("sent through a caller-supplied client");

      const message = await logged;
      expect(JSON.parse(message).message).toBe("sent through a caller-supplied client");
    });

    it("buffers several messages into a single firehose record", async () => {
      const sender = new BufferedSender(new FirehoseSender(target.streamName, client), {
        bufferSize: EOL_TEST_MESSAGES.length,
      });

      const results = await Promise.all(
        EOL_TEST_MESSAGES.map((message) => sender.send(`${message}\n`)),
      );

      // One `PutRecord` result shared by all three: the real API took a single billable
      // record, which no assertion against the delivered bytes could tell apart.
      expect(new Set(results).size).toBe(1);
    });

    it("sends a partial record once the flush timeout elapses", async () => {
      const sender = new BufferedSender(new FirehoseSender(target.streamName, client), {
        bufferSize: 100,
        flushTimeout: 500,
      });

      // Nothing flushes this by hand, so the timer is the only thing that can send it.
      const result = await sender.send("sent by the flush timeout\n");

      expect(result).toHaveProperty("RecordId");
    });

    it("fills a record to the default buffer size and the api takes it", async () => {
      const sender = new BufferedSender(new FirehoseSender(target.streamName, client), {
        bufferSize: 50,
      });
      // 50 of these is 5,050 bytes, just under the 5 KiB `bufferSizeKb` default, so the
      // record goes out full: the shape the default config actually produces.
      const line = `${"x".repeat(100)}\n`;

      const results = await Promise.all(Array.from({ length: 50 }, () => sender.send(line)));

      expect(new Set(results).size).toBe(1);
    });

    it("emits an error for a delivery stream that doesn't exist", async () => {
      const transport = new FirehoseTransport({
        streamName: target.badStreamName(),
        firehoseOptions: target.firehoseOptions,
      });
      const logger = winston.createLogger({ transports: [transport] });

      const errored = new Promise<
        Error & { name: string; $metadata?: { httpStatusCode?: number } }
      >((resolve) => {
        logger.on("error", resolve);
      });

      logger.info("this will never arrive");

      const err = await errored;
      expect(err.name).toBe(backend.missingStreamErrorName);
      expect(err.$metadata?.httpStatusCode).toBe(400);
    });

    // The rest only run where delivery can be verified, and this one runs first: if
    // `bufferingInterval: 0` didn't survive the Pulumi/Terraform bridge, every test
    // below would sit through a 300s buffer and time out for an unrelated reason.
    it.skipIf(!backend.deliversToS3)("is configured for zero buffering", async () => {
      const described = await client.send(
        new DescribeDeliveryStreamCommand({ DeliveryStreamName: target.streamName }),
      );
      const description = described.DeliveryStreamDescription;
      expect(description?.DeliveryStreamStatus).toBe("ACTIVE");

      const hints =
        description?.Destinations?.[0]?.ExtendedS3DestinationDescription?.BufferingHints;
      expect(hints?.IntervalInSeconds).toBe(0);
    });

    it.skipIf(!backend.deliversToS3)(
      "eol makes the delivered object newline-delimited",
      async () => {
        const marker = randomUUID();
        const transport = new FirehoseTransport({
          streamName: target.streamName,
          firehoseOptions: target.firehoseOptions,
          eol: "\n",
        });
        const logger = winston.createLogger({ transports: [transport] });

        const sent = await logSerially(
          transport,
          logger,
          EOL_TEST_MESSAGES.map((message) => `${marker} ${message}`),
        );
        const run = sent.join("");

        // The wait IS the assertion: this only resolves once one object contains all three
        // records back to back, in order, exactly as sent.
        const object = await delivered().waitForObjectContaining(run);

        const start = object.body.indexOf(run);
        const lines = object.body
          .slice(start, start + run.length)
          .split("\n")
          .filter(Boolean);
        expect(lines).toHaveLength(EOL_TEST_MESSAGES.length);
        expect(lines.map((line) => JSON.parse(line).message)).toEqual(
          EOL_TEST_MESSAGES.map((message) => `${marker} ${message}`),
        );
      },
    );

    it.skipIf(!backend.deliversToS3)(
      "without eol, records are delivered jammed together",
      async () => {
        // The negative case: without it, a bug where Firehose (or a future SDK version)
        // inserted its own separator would let the positive test above pass regardless.
        const marker = randomUUID();
        const transport = new FirehoseTransport({
          streamName: target.streamName,
          firehoseOptions: target.firehoseOptions,
        });
        const logger = winston.createLogger({ transports: [transport] });

        const sent = await logSerially(
          transport,
          logger,
          EOL_TEST_MESSAGES.map((message) => `${marker} ${message}`),
        );
        const run = sent.join("");

        // The wait IS the assertion here too: once it resolves, `jammed` is just `run`
        // sliced back out, so the checks below re-verify a local string, not S3 content.
        const object = await delivered().waitForObjectContaining(run);

        const start = object.body.indexOf(run);
        const jammed = object.body.slice(start, start + run.length);
        expect(jammed).toMatch(/\}\{/);
        expect(jammed).not.toContain("\n");
        expect(() => JSON.parse(jammed)).toThrow();
      },
    );

    it.skipIf(!backend.deliversToS3)(
      "delivers a buffered record as the same newline-delimited lines",
      async () => {
        const marker = randomUUID();
        const transport = new FirehoseTransport({
          streamName: target.streamName,
          firehoseOptions: target.firehoseOptions,
          eol: "\n",
          buffering: { bufferSize: EOL_TEST_MESSAGES.length },
        });
        const logger = winston.createLogger({ transports: [transport] });

        const logged = await logBuffered(
          transport,
          logger,
          EOL_TEST_MESSAGES.map((message) => `${marker} ${message}`),
        );

        const run = logged.join("");
        const object = await delivered().waitForObjectContaining(run);

        const start = object.body.indexOf(run);
        const lines = object.body
          .slice(start, start + run.length)
          .split("\n")
          .filter(Boolean);
        expect(lines.map((line) => JSON.parse(line).message)).toEqual(
          EOL_TEST_MESSAGES.map((message) => `${marker} ${message}`),
        );
      },
    );

    it.skipIf(!backend.deliversToS3)(
      "without eol, a buffered record is jammed together like separate records",
      async () => {
        // The equivalence the whole design rests on: aggregating changes what a record
        // costs, never what reaches the destination. Only the delivered bytes can show
        // that buffering neither adds a separator of its own nor drops one.
        const marker = randomUUID();
        const transport = new FirehoseTransport({
          streamName: target.streamName,
          firehoseOptions: target.firehoseOptions,
          buffering: { bufferSize: EOL_TEST_MESSAGES.length },
        });
        const logger = winston.createLogger({ transports: [transport] });

        const logged = await logBuffered(
          transport,
          logger,
          EOL_TEST_MESSAGES.map((message) => `${marker} ${message}`),
        );

        const run = logged.join("");
        const object = await delivered().waitForObjectContaining(run);

        const start = object.body.indexOf(run);
        const jammed = object.body.slice(start, start + run.length);
        expect(jammed).toMatch(/\}\{/);
        expect(jammed).not.toContain("\n");
        expect(() => JSON.parse(jammed)).toThrow();
      },
    );

    it.skipIf(!backend.deliversToS3)("delivers a record filled to the cap intact", async () => {
      // A near-full record of multi-byte lines, which is where a sizing or encoding bug
      // would show up: the buffer is measured in bytes but the blob is built from a string,
      // and Firehose de-aggregates blobs of its own accord.
      const marker = randomUUID();
      const lineCount = 50;
      const transport = new FirehoseTransport({
        streamName: target.streamName,
        firehoseOptions: target.firehoseOptions,
        formatter: (info) => `${marker} ${info.message} 日本語 🔥`,
        eol: "\n",
        buffering: { bufferSize: lineCount },
      });
      const logger = winston.createLogger({ transports: [transport] });

      const logged = await logBuffered(
        transport,
        logger,
        Array.from({ length: lineCount }, (_, index) => `${index}`.padStart(4, "0").repeat(11)),
      );

      const run = logged.join("");
      // 97 bytes a line, so the record sits just under the 5 KiB `bufferSizeKb` default.
      const bytes = Buffer.byteLength(run);
      expect(bytes).toBeGreaterThan(4 * 1024);
      expect(bytes).toBeLessThanOrEqual(5 * 1024);

      const object = await delivered().waitForObjectContaining(run);

      const start = object.body.indexOf(run);
      const lines = object.body
        .slice(start, start + run.length)
        .split("\n")
        .filter(Boolean);
      expect(lines).toHaveLength(lineCount);
    });

    it.skipIf(!backend.deliversToS3)("delivers consecutive records in the order sent", async () => {
      // The chaining invariant end to end: two records, and the wait below only resolves
      // once one object holds the second directly behind the first.
      const marker = randomUUID();
      const messages = ["one", "two", "three", "four"].map((message) => `${marker} ${message}`);
      const transport = new FirehoseTransport({
        streamName: target.streamName,
        firehoseOptions: target.firehoseOptions,
        eol: "\n",
        buffering: { bufferSize: 2 },
      });
      const logger = winston.createLogger({ transports: [transport] });

      const logged = await logBuffered(transport, logger, messages);

      const run = logged.join("");
      const object = await delivered().waitForObjectContaining(run);

      const start = object.body.indexOf(run);
      const lines = object.body
        .slice(start, start + run.length)
        .split("\n")
        .filter(Boolean);
      expect(lines.map((line) => JSON.parse(line).message)).toEqual(messages);
    });

    it.skipIf(!backend.deliversToS3)("delivers the formatted bytes verbatim", async () => {
      const marker = randomUUID();
      const transport = new FirehoseTransport({
        streamName: target.streamName,
        firehoseOptions: target.firehoseOptions,
        formatter: (info) =>
          `${marker} | ${info.level} | ${info.message} | ${info.snakes} | 日本語 🔥`,
        eol: "\n",
      });
      const logger = winston.createLogger({ transports: [transport] });

      const logged = new Promise<string>((resolve) => {
        transport.once("logged", resolve);
      });
      logger.info("not json at all", { snakes: "delicious" });
      const sent = await logged;

      expect(sent).toBe(`${marker} | info | not json at all | delicious | 日本語 🔥\n`);

      // The wait IS the assertion: it already proves `sent` landed verbatim, so this
      // last check is just documentation, not additional verification.
      const object = await delivered().waitForObjectContaining(sent);
      expect(object.body).toContain(sent);
    });
  });
}
