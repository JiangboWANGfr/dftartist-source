// "添加到当前原理图"：显示一个实例后，右键兄弟实例追加进同一张图（多实例组合图）。
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("schematic: 添加到当前原理图 把第二个实例追加进同一张图", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator('#hier-tree [data-node]').first().waitFor();
  await page.locator('#hier-tree [data-arrow="soc"]').click();
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').waitFor();
  await page.locator('#hier-tree [data-node="soc.u_mem"]').waitFor();

  // 先显示 u_cpu 的原理图（复用 tab，种子 soc.u_cpu）。
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click({ button: "right" });
  await page.locator('[data-menu="schematic"]').click();
  await page.locator('#hier-center canvas').first().waitFor({ timeout: 10_000 });

  // 右键兄弟实例 u_mem → 「添加到当前原理图」（该菜单项仅在有原理图时出现）。
  await page.locator('#hier-tree [data-node="soc.u_mem"]').click({ button: "right" });
  await page.locator('[data-menu="schematic-add"]').click();

  // 同一张图（seed=soc.u_cpu）现在有两个节点。
  await expect
    .poll(() => page.evaluate(() => {
      const g = (window as any).__hierStore.getState().schematics["soc.u_cpu"];
      return g ? Object.keys(g.nodes).length : 0;
    }), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);

  await app.close();
});
