import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api-integration/**/*.test.ts"],
    setupFiles: ["../../tests/api-integration/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // Every test truncates the whole schema in beforeEach against a real
    // Postgres, which costs several seconds. Vitest's 5s default left tests
    // passing only because the work happened inside the 10s hook budget, so
    // they failed intermittently once a run drifted slightly slower.
    testTimeout: 30000,
    hookTimeout: 120000,
    coverage: {
      enabled: false,
    },
  },
  esbuild: {
    target: "node18",
  },
  resolve: {
    alias: {
      "@kaneo/email": resolve(
        __dirname,
        "../../tests/api-integration/mocks/email.ts",
      ),
    },
  },
});
