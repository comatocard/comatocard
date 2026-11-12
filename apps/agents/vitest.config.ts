import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/status.ts", "src/pay.ts", "src/submit.ts", "src/treasury-cli.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
