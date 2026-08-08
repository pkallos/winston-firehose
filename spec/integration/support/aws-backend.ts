import { randomUUID } from "node:crypto";
import {
  DescribeDeliveryStreamCommand,
  FirehoseClient,
  type FirehoseClientConfig,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { S3Client } from "@aws-sdk/client-s3";
import type { DeliveredObjectReader, FirehoseBackend, FirehoseTarget } from "./backend.js";
import { createS3DeliveryReader } from "./s3.js";

const RUN_HINT =
  "run this suite with `pnpm test:aws`, which deploys the SST stack and passes " +
  "WF_AWS_BUCKET/STREAM/REGION/PREFIX, rather than invoking vitest directly";

async function assertStreamIsActive(
  client: FirehoseClient,
  streamName: string,
  region: string,
): Promise<void> {
  const described = await client
    .send(new DescribeDeliveryStreamCommand({ DeliveryStreamName: streamName }))
    .catch((cause: unknown) => {
      throw new Error(
        `could not describe delivery stream "${streamName}" in ${region}: ${RUN_HINT}`,
        { cause },
      );
    });

  const status = described.DeliveryStreamDescription?.DeliveryStreamStatus;
  if (status !== "ACTIVE") {
    throw new Error(
      `delivery stream "${streamName}" in ${region} is ${status ?? "in an unknown state"}, ` +
        `not ACTIVE: ${RUN_HINT}`,
    );
  }
}

/**
 * Firehose's delivery workers assume the destination role independently of
 * `CreateDeliveryStream`, so the very first delivery after a fresh deploy can queue
 * behind IAM propagation on its own (observed once at ~100s vs ~5s for every delivery
 * after). Absorbing that cost here keeps every real test's timeout tight.
 */
async function warmUpDelivery(
  client: FirehoseClient,
  reader: DeliveredObjectReader,
  streamName: string,
): Promise<void> {
  const marker = `warmup-${randomUUID()}`;
  await client.send(
    new PutRecordCommand({
      DeliveryStreamName: streamName,
      Record: { Data: Buffer.from(marker) },
    }),
  );
  await reader.waitForObjectContaining(marker, { timeoutMs: 150_000 });
}

/**
 * A `FirehoseBackend` backed by an already-deployed AWS stack (see `infra/sst.config.ts`
 * and `scripts/aws-integration.mjs`). `env` is read when this is called, which happens as
 * a top-level statement in `aws.spec.ts`, still before collection continues, so `enabled`
 * is as static as `describe.skipIf` needs.
 */
export function createAwsBackend(env: NodeJS.ProcessEnv = process.env): FirehoseBackend {
  const bucket = env.WF_AWS_BUCKET ?? "";
  const streamName = env.WF_AWS_STREAM ?? "";
  const region = env.WF_AWS_REGION ?? "";
  const prefix = env.WF_AWS_PREFIX ?? "";

  let firehoseClient: FirehoseClient | undefined;
  let s3Client: S3Client | undefined;

  return {
    name: "aws",
    enabled: Boolean(bucket && streamName && region && prefix),
    deliversToS3: true,
    missingStreamErrorName: "ResourceNotFoundException",

    async setUp(): Promise<FirehoseTarget> {
      // Plain config rather than a prebuilt client, so this exercises the path the README documents.
      const firehoseOptions: FirehoseClientConfig = { region };
      firehoseClient = new FirehoseClient(firehoseOptions);

      await assertStreamIsActive(firehoseClient, streamName, region);

      s3Client = new S3Client({ region });
      const delivered = createS3DeliveryReader({
        client: s3Client,
        bucket,
        prefix,
        since: new Date(),
      });

      await warmUpDelivery(firehoseClient, delivered, streamName);

      return {
        firehoseOptions,
        streamName,
        badStreamName: () => `wf-does-not-exist-${randomUUID()}`,
        delivered,
      };
    },

    // Delivered objects are left alone: the stack's 1-day lifecycle rule reclaims them, and
    // deleting here would race other test files reading the same bucket.
    async tearDown(): Promise<void> {
      firehoseClient?.destroy();
      firehoseClient = undefined;
      s3Client?.destroy();
      s3Client = undefined;
    },
  };
}
