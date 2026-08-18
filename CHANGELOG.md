# winston-firehose

## 4.0.1

### Patch Changes

- e199d63: `dist` is byte-identical to 4.0.0; the only change is the `@changesets/cli` dev dependency moving to v3.

## 4.0.0

### Major Changes

- 8c4cb46: Modernize the build and test toolchain:

  - Switch from npm to pnpm.
  - Replace eslint with biome for linting and formatting.
  - Replace jest/ts-jest with vitest.
  - Replace the plain `tsc` build with `tsdown`, shipping dual CJS+ESM output with a generated
    `exports` map, verified by `publint` and `@arethetypeswrong/cli` on every build.
  - Raise the `engines.node` floor to `>=22` (18 and 20 are both EOL).
  - Upgrade `@aws-sdk/client-firehose`, `winston`, `winston-transport`, `triple-beam`, and TypeScript
    (now on the TypeScript 7 native compiler) to current major versions.

  No runtime behavior changes to `FirehoseTransport`.

### Minor Changes

- 062e898: Add an optional `buffering` option that concatenates log messages into a single Firehose record, so a run of small lines is billed as one record instead of one each, flushed by message count, buffered size, a timeout, `logger.close()`, or `transport.flush()`.

### Patch Changes

- c5af460: Add a real-AWS integration suite (`pnpm test:aws`, local/on-demand only) alongside the LocalStack one, verifying S3 delivery, `eol` framing, and a `firehoseClient` end-to-end path with no runtime behavior changes to `FirehoseTransport`.
- 412f569: Add a LocalStack-backed integration suite (`pnpm run test:integration`) that exercises
  `FirehoseSender` and `FirehoseTransport` against a real Firehose API, gated in CI alongside the
  existing build matrix.

  Add an optional `firehoseClient` option, for consumers who need a `FirehoseClient` with custom
  credentials, middleware, or retry behavior. `firehoseOptions` remains the default, config-only path.

  No other runtime behavior changes to `FirehoseTransport`.

## 4.0.0-next.1

### Major Changes

- 8c4cb46: Modernize the build and test toolchain:

  - Switch from npm to pnpm.
  - Replace eslint with biome for linting and formatting.
  - Replace jest/ts-jest with vitest.
  - Replace the plain `tsc` build with `tsdown`, shipping dual CJS+ESM output with a generated
    `exports` map, verified by `publint` and `@arethetypeswrong/cli` on every build.
  - Raise the `engines.node` floor to `>=22` (18 and 20 are both EOL).
  - Upgrade `@aws-sdk/client-firehose`, `winston`, `winston-transport`, `triple-beam`, and TypeScript
    (now on the TypeScript 7 native compiler) to current major versions.

  No runtime behavior changes to `FirehoseTransport`.

### Patch Changes

- c5af460: Add a real-AWS integration suite (`pnpm test:aws`, local/on-demand only) alongside the LocalStack one, verifying S3 delivery, `eol` framing, and a `firehoseClient` end-to-end path with no runtime behavior changes to `FirehoseTransport`.
- 412f569: Add a LocalStack-backed integration suite (`pnpm run test:integration`) that exercises
  `FirehoseSender` and `FirehoseTransport` against a real Firehose API, gated in CI alongside the
  existing build matrix.

  Add an optional `firehoseClient` option, for consumers who need a `FirehoseClient` with custom
  credentials, middleware, or retry behavior. `firehoseOptions` remains the default, config-only path.

  No other runtime behavior changes to `FirehoseTransport`.
