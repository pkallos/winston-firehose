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
        },
      },
    ],
  },
});
