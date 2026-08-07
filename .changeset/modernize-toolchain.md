---
"winston-firehose": major
---

Modernize the build and test toolchain:

- Switch from npm to pnpm.
- Replace eslint with biome for linting and formatting.
- Replace jest/ts-jest with vitest.
- Replace the plain `tsc` build with `tsdown`, shipping dual CJS+ESM output with a generated
  `exports` map, verified by `publint` and `@arethetypeswrong/cli` on every build.
- Raise the `engines.node` floor to `>=22` (18 and 20 are both EOL).
- Upgrade `@aws-sdk/client-firehose`, `winston`, `winston-transport`, `triple-beam`, and TypeScript
  (now on the TypeScript 7 native compiler) to current major versions.

No runtime behavior changes to `FirehoseTransport`.
