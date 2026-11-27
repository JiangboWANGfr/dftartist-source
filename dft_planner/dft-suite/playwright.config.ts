import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  snapshotPathTemplate: "tests/e2e/__screenshots__/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { trace: "on-first-retry" }, workers: 1, retries: 0,
});
