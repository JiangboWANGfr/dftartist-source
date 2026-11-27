import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverlap, assertNoOverflow } from "../helpers/layout.ts";

test("shell regions never 穿模, in both themes", async () => {
  const { app, page } = await launchApp();
  const regions = ["#topbar", "#ws-body", "#statusbar"];
  await assertNoOverlap(page, regions);
  await assertNoOverflow(page, "#app-root");
  await expect(page).toHaveScreenshot("shell-dark.png");
  await page.click("#theme-toggle");
  await assertNoOverlap(page, regions);
  await expect(page).toHaveScreenshot("shell-light.png");
  await app.close();
});

test("tab switch changes workspace", async () => {
  const { app, page } = await launchApp();
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  await expect(page.locator("#ws-genconn")).toBeVisible();
  await app.close();
});

test("welcome: 冷启动显示欢迎页 + 三动作 + 打开后消失", async () => {
  const { app, page } = await launchApp();
  // 冷启动 idle → 欢迎页可见,三个动作在,顶栏工作区 tab 隐藏
  await expect(page.locator("[data-welcome]")).toBeVisible();
  await expect(page.locator('[data-wl="new"]')).toBeVisible();
  await expect(page.locator('[data-wl="open"]')).toBeVisible();
  await expect(page.locator('[data-wl="quick"]')).toBeVisible();
  await expect(page.locator('[data-tab="genconn"]')).toHaveCount(0);
  // 离开 idle → 欢迎页消失,工作区回来,tab 出现
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await expect(page.locator("[data-welcome]")).toHaveCount(0);
  await expect(page.locator('[data-tab="genconn"]')).toBeVisible();
  await app.close();
});
