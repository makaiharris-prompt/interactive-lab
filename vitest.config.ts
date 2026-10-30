import { defineConfig } from "vitest/config";

// Fast suite (`npm test`): the lab core and anything else that needs no browser.
// Slower suites (e.g. the Smoke check) get their own config and npm script.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
