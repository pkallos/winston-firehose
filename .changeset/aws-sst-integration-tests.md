---
"winston-firehose": patch
---

Add a real-AWS integration suite (`pnpm test:aws`, local/on-demand only) alongside the LocalStack one, verifying S3 delivery, `eol` framing, and a `firehoseClient` end-to-end path with no runtime behavior changes to `FirehoseTransport`.
