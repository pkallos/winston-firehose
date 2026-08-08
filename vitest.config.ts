import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig.json has no `baseUrl` and excludes `spec/`, so the `@` the specs import
// through has to be resolved here explicitly rather than from tsconfig `paths`.
const resolve = { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } };

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "unit",
          globals: true,
          include: ["spec/**/*.spec.ts"],
          exclude: ["**/node_modules/**", "spec/integration/**"],
        },
      },
      {
        resolve,
        test: {
          name: "integration",
          globals: true,
          include: ["spec/integration/**/*.spec.ts"],
          // `aws.spec.ts` runs against real, externally-provisioned AWS infrastructure
          // via `pnpm test:aws`, never as part of the LocalStack-backed CI gate.
          exclude: ["**/node_modules/**", "spec/integration/aws.spec.ts"],
          // LocalstackContainer hardcodes a 120s startup timeout; give the setup hook
          // and the tests themselves headroom above that.
          hookTimeout: 180_000,
          testTimeout: 60_000,
        },
      },
      {
        resolve,
        test: {
          name: "aws",
          globals: true,
          include: ["spec/integration/aws.spec.ts"],
          // setUp does one DescribeDeliveryStream call, then sends and waits on a
          // warm-up record: the first delivery after a fresh deploy has been observed
          // taking up to ~100s versus ~5s for every one after (see aws-backend.ts).
          hookTimeout: 180_000,
          // Each S3 assertion polls for delivery on top of a few serialized PutRecords.
          testTimeout: 120_000,
        },
      },
    ],
  },
});
