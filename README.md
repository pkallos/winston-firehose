# Winston Firehose

NodeJS module, winston logging transport which writes to AWS Firehose.

## Installation

[![NPM](https://nodei.co/npm/winston-firehose.png?compact=true)](https://nodei.co/npm/winston-firehose/)

```bash
pnpm add winston-firehose
```

## Usage

You can add this logger transport with the following code:

```javascript
import winston from "winston";
import { FirehoseTransport } from "winston-firehose";

// register the transport
const logger = winston.createLogger({
  transports: [
    new FirehoseTransport({
      streamName: "firehose_stream_name",
      firehoseOptions: {
        region: "us-east-1",
      },
    }),
  ],
});

// log away!!
// with just a string
logger.info("This is the log message!");

// or with meta info
logger.info("This is the log message!", { snakes: "delicious" });
```

This will write messages as strings (using JSON.stringify) into Firehose in the following format:

```
{
  timestamp: "2016-05-20T22:48:01.106Z",
  level: "info",
  message: "This is the log message!",
  snakes: "delicious"
};
```

## Options

`streamName (string) - required` The name of the Firehose stream to write to.

`firehoseOptions (object) - optional/suggested` The Firehose options that are passed directly to the constructor,
[documented by AWS here](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Firehose.html#constructor-property).
Ignored if `firehoseClient` is given.

`firehoseClient (FirehoseClient) - optional` A preconfigured `FirehoseClient` to send records with, for
consumers who need custom credentials, middleware, or retry behavior. Takes precedence over `firehoseOptions`.

`useLoggerLevel (boolean) - optional` Use winston logger level if set to true. Transport level will default to `info` if undefined.

`useLoggerFormat (boolean) - optional` Use winston logger format if set to true. Transport format will default to `JSON.stringify` if undefined. Takes precedence over `formatter` when both are set.

`formatter ((info) => string) - optional` Custom formatter for the log line sent to Firehose. Ignored when `useLoggerFormat` is set.

`eol (string) - optional` End of line delimiter appended to each message before it's sent to Firehose. Defaults to `""` (no delimiter).

`buffering (object) - optional` Concatenates messages into a single Firehose record instead of sending
a record per message. Omit it to send each message on its own. See [Buffering](#buffering).

## Buffering

Firehose bills [per record, in 5KB increments](https://aws.amazon.com/kinesis/data-firehose/pricing/),
so a 200-byte log line costs the same as a 5KB one. Buffering packs a run of small lines into one
record, which is where the saving comes from:

```javascript
new FirehoseTransport({
  streamName: "firehose_stream_name",
  eol: "\n",
  buffering: {
    bufferSize: 500, // messages to hold before sending a record
    bufferSizeKb: 5, // buffered KiB to hold before sending a record
    flushTimeout: 30000, // ms a partial record waits before being sent anyway
  },
});
```

Every field is optional, and the values above are the defaults. `bufferSizeKb` defaults to Firehose's
5KB billing increment because there's no further per-byte saving above it, only more messages to lose
if the process dies; Firehose caps a record at `1000` KiB. `bufferSize` defaults to the 500 records
Firehose will
[de-aggregate from one blob](https://docs.aws.amazon.com/firehose/latest/APIReference/API_PutRecord.html).

A record is its messages concatenated, byte for byte the same as what separate records deliver, so
`eol` is what a downstream consumer needs to split them apart, with or without buffering.

Whatever is still buffered is sent when the logger is closed (`logger.close()`). For a short-lived
process that doesn't close its logger (a Lambda handler, say), `await transport.flush()` sends it on
demand.

## Details

At the moment this logger sends (unacknowledged!) log messages into firehose. The behavior if the log
message fails to write to Firehose is to emit an 'error' event.

## Development

`pnpm test` runs the unit suite against an injected mock sender. `pnpm run test:integration` runs a
separate suite against a real Firehose API emulated by [LocalStack](https://www.localstack.cloud/)
in a Docker container (via `testcontainers`), and requires Docker to be running locally.

`pnpm test:aws` runs the same contract again against **real AWS**, plus S3-delivery assertions
LocalStack can't provide (the `eol` framing, byte fidelity, buffered-record delivery, and the
zero-buffering configuration). It
deploys a throwaway stack with [SST](https://sst.dev/) — an S3 bucket, an IAM role, and a Firehose
delivery stream with zero buffering — runs the suite against it, and tears it down again, including
on Ctrl-C. It's local/on-demand only, never run in CI. Needs AWS credentials in the environment;
Docker is not required.

Budget 3–8 minutes the first time on a machine (SST fetches its Pulumi toolchain). After that, a
full `pnpm test:aws` cycle (deploy → test → teardown) takes 3–4 minutes — the deploy and the first
delivery to a freshly created stream are the slow parts. To iterate on an assertion without paying
that twice, `pnpm test:aws:up` deploys and leaves the stack running, `pnpm test:aws:only` re-runs
just the suite against it (well under a minute once the stream's already warm), and
`pnpm test:aws:clean` tears it down when you're done. Costs are trivial — an empty S3 bucket, an
IAM role, and a handful of PutRecord/GetObject calls — but nonzero.

If a run is interrupted uncleanly (a crash, a killed process), `pnpm test:aws:clean` tears down the
stack, and `pnpm test:aws:orphans` lists any AWS resources still tagged `winston-firehose:test`.

The first deploy in a fresh AWS account/region also creates SST's own account-level bootstrap (an
`sst-asset-*`/`sst-state-*` bucket pair and an `sst-asset` ECR repo, all empty for this stack).
`sst remove` doesn't touch these by design, since other SST apps in the account may reuse them —
they won't show up in the `winston-firehose:test` tag sweep above.

### Releasing

Releases are automated by changesets (`.github/workflows/release.yml`): pushing changesets to
`master` makes it open a "Version Packages" PR bumping the version and CHANGELOG; merging that PR
publishes to npm and cuts a GitHub release.
