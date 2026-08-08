/// <reference path="./.sst/platform/config.d.ts" />

// Deployed on demand via `pnpm test:aws`, torn down immediately after, never touched by CI.
//
// Lives in `infra/` rather than the repo root: SST writes `sst-env.d.ts` into every directory
// with a `package.json` beneath the config, and both `smoke-test/cjs` and `smoke-test/esm`
// have one. `infra/` has none.
//
// Not covered by either tsconfig (`src/**` / `spec/**` only): validated by `sst deploy`'s own
// esbuild pass instead, since including it would make `pnpm typecheck` depend on
// `.sst/platform/config.d.ts`, which only exists after `sst install` has run.

const region = process.env.WF_AWS_REGION ?? "us-east-1";

export default $config({
  app(input) {
    return {
      name: "winston-firehose-test",
      // Keeps this app's state on disk instead of an S3 state bucket. Doesn't avoid SST's
      // separate, unconditional per-account/region provider bootstrap (an sst-asset-*/sst-state-*
      // bucket pair plus an ECR repo). `sst remove` never touches that, by design.
      home: "local",
      // Defaults to "retain", which preserves S3 buckets, and this stack's whole point is
      // leaving nothing behind.
      removal: "remove",
      protect: false,
      // Drop the local state directory once every resource is confirmed gone.
      state: { purge: true },
      providers: {
        aws: {
          region,
          // Pulumi auto-names the bucket and the stream, so these tags are the only reliable
          // way to find an orphan later.
          defaultTags: {
            tags: {
              "winston-firehose:test": "true",
              "winston-firehose:app": "winston-firehose-test",
              "winston-firehose:stage": input.stage,
            },
          },
        },
      },
    };
  },

  async run() {
    const prefix = "records/";

    // `sst.aws.Bucket` already forces delete-with-objects on teardown; this lifecycle rule is
    // just a cost backstop if a SIGKILL strands the bucket mid-run.
    const bucket = new sst.aws.Bucket("Delivery", {
      lifecycle: [{ id: "expire-delivered-records", expiresIn: "1 day" }],
    });

    const role = new aws.iam.Role("DeliveryRole", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "firehose.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    });

    // Inline, not a managed-policy attachment, so it's deleted along with the role. Grants
    // exactly what the Firehose S3 destination needs, no `logs:PutLogEvents` since CloudWatch
    // logging is off below.
    const policy = new aws.iam.RolePolicy("DeliveryRolePolicy", {
      role: role.id,
      policy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "s3:AbortMultipartUpload",
              "s3:GetBucketLocation",
              "s3:GetObject",
              "s3:ListBucket",
              "s3:ListBucketMultipartUploads",
              "s3:PutObject",
            ],
            Resource: [bucket.arn, $interpolate`${bucket.arn}/*`],
          },
        ],
      }),
    });

    // SST has no Firehose component (`sst.aws.KinesisStream` is Kinesis Data Streams, a
    // different service), so this is a raw Pulumi resource.
    const stream = new aws.kinesis.FirehoseDeliveryStream(
      "DeliveryStream",
      {
        destination: "extended_s3",
        extendedS3Configuration: {
          roleArn: role.arn,
          bucketArn: bucket.arn,
          prefix,
          // Zero buffering (vs. the 300s default) is what makes the suite practical; it does
          // survive the Pulumi/Terraform bridge rather than being read back as "unset". The
          // AWS suite's first test verifies this via `DescribeDeliveryStream`. Both hints must
          // be set together, so size is pinned to its 1 MB minimum.
          bufferingInterval: 0,
          bufferingSize: 1,
          // Explicit even though it is the default: every byte-level assertion in the suite
          // breaks confusingly if this ever changes.
          compressionFormat: "UNCOMPRESSED",
          cloudwatchLoggingOptions: { enabled: false },
        },
      },
      // Skips a wasted retry cycle: the provider already retries "unable to assume role"
      // through IAM's propagation window when creating the stream. The first *delivery*
      // after creation assumes the role independently; see the warm-up in aws-backend.ts.
      { dependsOn: [policy] },
    );

    // Written to `infra/.sst/outputs.json`, which `scripts/aws-integration.mjs` reads and
    // forwards to the specs as `WF_AWS_*` environment variables.
    return {
      stage: $app.stage,
      region,
      prefix,
      bucket: bucket.name,
      streamName: stream.name,
    };
  },
});
