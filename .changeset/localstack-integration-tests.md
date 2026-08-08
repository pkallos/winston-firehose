---
"winston-firehose": patch
---

Add a LocalStack-backed integration suite (`pnpm run test:integration`) that exercises
`FirehoseSender` and `FirehoseTransport` against a real Firehose API, gated in CI alongside the
existing build matrix.

Add an optional `firehoseClient` option, for consumers who need a `FirehoseClient` with custom
credentials, middleware, or retry behavior. `firehoseOptions` remains the default, config-only path.

No other runtime behavior changes to `FirehoseTransport`.
