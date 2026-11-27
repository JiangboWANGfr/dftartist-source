// e2e:层次原理图"往里 trace"——seed=soc,traceInside(clk) 嵌套展开 u_cpu/u_mem,
// 再 collapseInside 还原黑盒。走真 daemon(trace-into 协议)+ 真 ELK + Konva。
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR ?? path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("schematic trace-into: 下钻 soc 内部一步,再收起还原", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator('#hier-tree [data-node]').first().waitFor();

  // 右键根节点 soc → Show in Hierarchy Schematic
  await page.locator('#hier-tree [data-node="soc"]').click({ button: "right" });
  await page.locator('[data-menu="schematic"]').waitFor();
  await page.locator('[data-menu="schematic"]').click();
  await page.locator('#hier-center canvas').first().waitFor({ timeout: 10_000 });

  // 往里 trace:soc.clk → 内部 u_cpu.clk / u_mem.clk(store 驱动,同内侧菱形点击路径)
  const after = await page.evaluate(async () => {
    const store = (window as any).__hierStore;
    await store.getState().traceInside("soc", "soc", "clk");
    const g = store.getState().schematics["soc"];
    return {
      cpuParent: g.nodes["soc.u_cpu"]?.parentId,
      memParent: g.nodes["soc.u_mem"]?.parentId,
      inExpanded: g.inExpanded["soc"],
      edges: g.edges.length,
    };
  });
  expect(after.cpuParent).toBe("soc");
  expect(after.memParent).toBe("soc");
  expect(after.inExpanded).toEqual(["clk"]);
  expect(after.edges).toBe(2);
  await page.waitForTimeout(600);  // ELK+Konva 落定
  await page.screenshot({ path: "test-results/trace-into-expanded.png" });
  await expect(page.locator('#hier-center canvas').first()).toBeVisible();

  // 收起:内容移除、容器恢复黑盒
  const collapsed = await page.evaluate(() => {
    const store = (window as any).__hierStore;
    store.getState().collapseInside("soc", "soc");
    const g = store.getState().schematics["soc"];
    return { nodeIds: Object.keys(g.nodes), edges: g.edges.length, inExpanded: g.inExpanded["soc"] };
  });
  expect(collapsed.nodeIds).toEqual(["soc"]);
  expect(collapsed.edges).toBe(0);
  expect(collapsed.inExpanded).toBeUndefined();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/trace-into-collapsed.png" });
  await expect(page.locator('#hier-center canvas').first()).toBeVisible();

  await app.close();
});
