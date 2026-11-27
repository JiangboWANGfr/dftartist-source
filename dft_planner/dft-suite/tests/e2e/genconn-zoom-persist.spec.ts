// genconn 画布缩放跨 tab 切换保留（回归）：切到 SpecGen 再切回 连接生成 后，
// 用户的缩放不应被自动 fit 重置成"铺满视口"（曾经的 bug：工作区卸载/重挂 → 本地 scale 丢 → 自动放大）。
// 修复：scale/pos + fittedDefId 存进 store，自动 fit 只在 openDef 真变时触发。
// 稳定性：缩放读自 #gc-canvas 的 data-canvas-scale 属性；用滚轮改缩放（比 Konva 拖拽稳）。

import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";

// top 层放一个实例 → defOutline 有内容、自动 fit 有意义。
const SEED = {
  schemaVersion: 1,
  library: {
    defs: [
      { id: "top", designName: "top", designLevel: "chip", designType: "hierarchical", interfaces: [], connections: [],
        childInstances: [{ id: "iA", instanceName: "A_i1", hardenId: "defA", position: { x: 120, y: 120 } }] },
      { id: "defA", designName: "A", designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [] },
    ],
  },
  ui: { openDefId: "top", rootDefId: "top" },
  ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
};

const readScale = (page: import("@playwright/test").Page) =>
  page.locator("#gc-canvas").getAttribute("data-canvas-scale").then((v) => parseFloat(v ?? "NaN"));

test("genconn 画布缩放跨 tab 切换保留（切到 SpecGen 再回来不自动放大）", async () => {
  test.setTimeout(60_000);
  const { app, page } = await launchApp();
  try {
    await page.evaluate((d) => { (window as any).__gcStore.getState().openText(d); }, JSON.stringify(SEED));
    await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
    await page.click('[data-tab="genconn"]');
    await expect(page.locator("#ws-genconn")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300); // 让首帧自动 fit 落定
    const s1 = await readScale(page);
    expect(Number.isFinite(s1)).toBe(true);

    // 用户滚轮放大
    const box = await page.locator("#gc-canvas").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(100);
    const s2 = await readScale(page);
    expect(s2).not.toBeCloseTo(s1, 3); // 确认缩放确实变了，否则"保留"无从验证

    // 切到 SpecGen 再切回 GenConnection → 工作区卸载/重挂
    await page.click('[data-tab="specgen"]');
    await expect(page.locator("#ws-specgen")).toBeVisible({ timeout: 10_000 });
    await page.click('[data-tab="genconn"]');
    await expect(page.locator("#ws-genconn")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);
    const s3 = await readScale(page);

    expect(s3).toBeCloseTo(s2, 3); // 保留：不再被自动 fit 重置（修复前会回到 s1）
  } finally {
    await app.close();
  }
});
