import { defineConfig } from "vitest/config";

// Smoke check suite (`npm run test:smoke`): drives a real headless browser, so it is slower
// than the fast suite and runs on its own.
export default defineConfig({
  test: {
    include: ["src/**/*.smoke.test.ts"],
    testTimeout: 30_000,
  },
});
