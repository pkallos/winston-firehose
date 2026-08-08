import { randomUUID } from "node:crypto";
import {
  CreateDeliveryStreamCommand,
  DeleteDeliveryStreamCommand,
  FirehoseClient,
  type FirehoseClientConfig,
} from "@aws-sdk/client-firehose";
import { LocalstackContainer, type StartedLocalStackContainer } from "@testcontainers/localstack";
import type { FirehoseBackend, FirehoseTarget } from "./backend.js";

// The last semver-tagged LocalStack image that runs with no LOCALSTACK_AUTH_TOKEN.
// LocalStack moved to a single authenticated image on 2026-03-23; `latest` requires a token.
const LOCALSTACK_IMAGE = process.env.LOCALSTACK_IMAGE ?? "localstack/localstack:4.14.0";

/**
 * A `FirehoseBackend` backed by a real LocalStack container. The delivery stream it
 * creates has no destination configured, so `deliversToS3` is false. DirectPut streams
 * with no destination come back `ACTIVE` synchronously (LocalStack only defers to
 * `CREATING` for `KinesisStreamAsSource` streams), which keeps this backend fast
 * enough to run in CI.
 */
export function createLocalstackBackend(): FirehoseBackend {
  let container: StartedLocalStackContainer;
  let client: FirehoseClient;
  let streamName: string;

  return {
    name: "localstack",
    enabled: true,
    deliversToS3: false,
    missingStreamErrorName: "ResourceNotFoundException",

    async setUp(): Promise<FirehoseTarget> {
      container = await new LocalstackContainer(LOCALSTACK_IMAGE).start();

      const firehoseOptions: FirehoseClientConfig = {
        region: "us-east-1",
        endpoint: container.getConnectionUri(),
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      };
      client = new FirehoseClient(firehoseOptions);

      streamName = `winston-firehose-test-${randomUUID()}`;
      await client.send(new CreateDeliveryStreamCommand({ DeliveryStreamName: streamName }));

      return {
        firehoseOptions,
        streamName,
        badStreamName: () => `does-not-exist-${randomUUID()}`,
      };
    },

    async tearDown(): Promise<void> {
      await client?.send(new DeleteDeliveryStreamCommand({ DeliveryStreamName: streamName }));
      client?.destroy();
      await container?.stop();
    },
  };
}
