import { randomUUID } from "node:crypto";
import {
  CreateDeliveryStreamCommand,
  DeleteDeliveryStreamCommand,
  FirehoseClient,
  type FirehoseClientConfig,
} from "@aws-sdk/client-firehose";
import { LocalstackContainer, type StartedLocalStackContainer } from "@testcontainers/localstack";
import winston from "winston";
import { FirehoseSender } from "@/firehose-sender.js";
import { FirehoseTransport } from "@/firehose-transport.js";

// The last semver-tagged LocalStack image that runs with no LOCALSTACK_AUTH_TOKEN.
// LocalStack moved to a single authenticated image on 2026-03-23; `latest` requires a token.
const LOCALSTACK_IMAGE = process.env.LOCALSTACK_IMAGE ?? "localstack/localstack:4.14.0";

describe("firehose integration", () => {
  let container: StartedLocalStackContainer;
  let client: FirehoseClient;
  let firehoseOptions: FirehoseClientConfig;
  let streamName: string;

  beforeAll(async () => {
    container = await new LocalstackContainer(LOCALSTACK_IMAGE).start();

    firehoseOptions = {
      region: "us-east-1",
      endpoint: container.getConnectionUri(),
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    };
    client = new FirehoseClient(firehoseOptions);

    streamName = `winston-firehose-test-${randomUUID()}`;

    // DirectPut streams with no destination configured come back ACTIVE synchronously
    // (LocalStack only defers to CREATING for KinesisStreamAsSource streams), so there's
    // nothing to poll for before PutRecord.
    await client.send(new CreateDeliveryStreamCommand({ DeliveryStreamName: streamName }));
  }, 180_000);

  afterAll(async () => {
    await client?.send(new DeleteDeliveryStreamCommand({ DeliveryStreamName: streamName }));
    await container?.stop();
  }, 60_000);

  it("sends a record to a real firehose delivery stream", async () => {
    const sender = new FirehoseSender(streamName, firehoseOptions);

    const result = await sender.send("hello from a real firehose api call");

    expect(typeof result.RecordId).toBe("string");
    expect(result.RecordId?.length).toBeGreaterThan(0);
    expect(result.$metadata.httpStatusCode).toBe(200);
  });

  it("delivers a real winston log line end to end", async () => {
    const transport = new FirehoseTransport({ streamName, firehoseOptions });
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

  it("emits an error for a delivery stream that doesn't exist", async () => {
    const transport = new FirehoseTransport({
      streamName: `does-not-exist-${randomUUID()}`,
      firehoseOptions,
    });
    const logger = winston.createLogger({ transports: [transport] });

    const errored = new Promise<Error & { name: string; $metadata?: { httpStatusCode?: number } }>(
      (resolve) => {
        logger.on("error", resolve);
      },
    );

    logger.info("this will never arrive");

    const err = await errored;
    expect(err.name).toBe("ResourceNotFoundException");
    expect(err.$metadata?.httpStatusCode).toBe(400);
  });
});
