import { defineConfig } from "vitest/config";

// Fast suite (`npm test`): the lab core and anything else that needs no browser.
// Slower suites get their own config and npm script: the Smoke check's `*.smoke.test.ts`
// run with `npm run test:smoke` (vitest.smoke.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.smoke.test.ts"],
  },
});
