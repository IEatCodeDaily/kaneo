import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api/**/*.test.ts"],
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      // Regression floor, not a target. Set just under the current baseline
      // (~42% stmts / 35% branch). Ratchet UP as coverage grows; never down.
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 30,
        lines: 40,
      },
    },
  },
  esbuild: {
    target: "node18",
  },
});
