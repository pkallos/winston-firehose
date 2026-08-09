---
"winston-firehose": minor
---

Add an optional `buffering` option that concatenates log messages into a single Firehose record, so a run of small lines is billed as one record instead of one each, flushed by message count, buffered size, a timeout, `logger.close()`, or `transport.flush()`.
