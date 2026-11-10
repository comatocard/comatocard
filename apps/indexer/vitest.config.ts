import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["test/unit/**/*.test.ts", "test/regression/**/*.test.ts"] },
      },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
