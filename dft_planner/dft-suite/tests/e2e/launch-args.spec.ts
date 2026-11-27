// CLI 启动参数三链路(spec 2026-07-21 §7)：带 filelist 自动建工程 /
// 无 filelist 的 pendingLaunchDir 模式 / 二次启动 CLI filelist 覆盖工程记录。
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { launchApp } from "../helpers/electron.ts";

const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");
const FILELIST2 = path.resolve(process.cwd(), "tests/fixtures/soc2.f");

async function waitForFile(p: string, timeout = 15000): Promise<void> {
  const t0 = Date.now();
  while (!fs.existsSync(p)) {
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${p}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** 非原子写下的安全读：撕裂/半写状态返回 undefined，让调用方重试。 */
function readJsonSafe(p: string): any | undefined {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return undefined; }
}

test("带 --filelist 启动：自动建工程并激活", async () => {
  const proj = mkdtempSync(path.join(tmpdir(), "dft-launch-"));
  const { app, page } = await launchApp({}, ["--projectpath", proj, "--harden", "h1", "--filelist", FILELIST]);
  const dftproj = path.join(proj, "h1", "soc.planner.dftproj");
  await waitForFile(dftproj);
  await expect.poll(() => readJsonSafe(dftproj)?.filelist).toBe(FILELIST);
  await expect.poll(() => readJsonSafe(dftproj)?.outputDir).toBe(path.join(proj, "h1"));
  await expect(page.locator("[data-welcome]")).toHaveCount(0); // 设计已开 → 离开欢迎页
  await app.close();
});

test("无 --filelist 启动：欢迎页提示 + load 后自动建工程", async () => {
  const proj = mkdtempSync(path.join(tmpdir(), "dft-launch-"));
  const { app, page } = await launchApp({}, ["--projectpath", proj, "--harden", "h1"]);
  await expect(page.locator('[data-wl="launch-dir"]')).toBeVisible();
  await page.evaluate((fl) => (window as any).__projStore.getState().openFilelist(fl), FILELIST);
  await waitForFile(path.join(proj, "h1", "soc.planner.dftproj"));
  await expect(page.locator('[data-wl="launch-dir"]')).toHaveCount(0); // pending 已消费
  await app.close();
});

test("二次启动 + 不同 --filelist：命令行覆盖工程记录", async () => {
  const proj = mkdtempSync(path.join(tmpdir(), "dft-launch-"));
  const dftproj = path.join(proj, "h1", "soc.planner.dftproj");
  const first = await launchApp({}, ["--projectpath", proj, "--harden", "h1", "--filelist", FILELIST]);
  await waitForFile(dftproj);
  await first.app.close();
  const second = await launchApp({}, ["--projectpath", proj, "--harden", "h1", "--filelist", FILELIST2]);
  await expect
    .poll(() => readJsonSafe(dftproj)?.filelist, { timeout: 15000 })
    .toBe(FILELIST2);
  await second.app.close();
});
