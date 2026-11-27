import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";

test("SpecGen 空态：显示三步引导卡 + 置灰 IP 库（不可点）", async () => {
  const { app, page } = await launchApp();
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="specgen"]');
  await expect(page.locator('[data-guide="card"]')).toBeVisible();
  await expect(page.getByText("SpecGen — Generate DftSpecification")).toBeVisible();
  const palette = page.locator("#ws-specgen .dft-palette--disabled");
  await expect(palette).toBeVisible();
  await expect(palette.locator(".dft-item").first()).toHaveCSS("pointer-events", "none");
  await app.close();
});

test("GenConnection 工具条：文件 ▾ 下拉展开出文件命令", async () => {
  const { app, page } = await launchApp();
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  await page.getByRole("button", { name: "File ▾" }).click();
  await expect(page.getByText("Save As…")).toBeVisible();
  await expect(page.locator(".tb-menu").getByText("Save", { exact: true })).toBeVisible();
  await app.close();
});

test("菜单动作 toggle-theme 经 IPC 切换主题 class", async () => {
  const { app, page } = await launchApp();
  const before = await page.evaluate(() => document.documentElement.classList.contains("light"));
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("dft:menu:action", "toggle-theme");
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("light")))
    .toBe(!before);
  await app.close();
});

test("重开残留修复:冷启动不恢复 localStorage 里的上次画布", async () => {
  const { app, page } = await launchApp();
  await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
  await page.click('[data-tab="genconn"]');
  // 构造一份含独特根名的残留写入 localStorage(旧行为会在重启时恢复它)。
  await page.evaluate(() => {
    const gc = (window as any).__gcStore.getState();
    gc.newDoc("residuechip");
    localStorage.setItem("genconn:lastdoc", gc.toText());
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  // 重载后:genconn 文档不应是残留(不含 residuechip),而是空 chip 文档。
  const text = await page.evaluate(() => (window as any).__gcStore.getState().toText());
  expect(text.includes("residuechip")).toBe(false);
  await app.close();
});
