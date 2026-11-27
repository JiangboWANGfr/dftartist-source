import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverflow } from "../helpers/layout.ts";
test("app launches and root fills viewport without overflow", async () => {
  const { app, page } = await launchApp();
  await expect(page.locator("#app-root")).toBeVisible();
  await assertNoOverflow(page, "#app-root");
  await app.close();
});
