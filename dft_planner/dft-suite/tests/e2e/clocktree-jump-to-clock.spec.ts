// "双击对应点跳转只是clock schematic，schematic中相应的时钟path高亮" — double-clicking a clock
// row in the Clock Tree's "Generated files" drawer (single click just previews the SDC source
// on the right) must reveal that clock's definition point on the schematic: expand every real
// container down to it, select + center + highlight its WHOLE path (not just the root box), so
// the engineer does not have to already know which containers to open to find it.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))
  ?? path.resolve(process.cwd(), "../dft-core/build");
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const SDC = "/home/wongw/nx9000/design/processor_core/processor_core_design.sdc";

test("Clock Tree: clicking a clock-table row reveals its definition point on the schematic", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL) || !existsSync(SDC), "real design/SDC not present");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("clocktree"));
  await page.locator('input[placeholder^="func SDC"]').fill(SDC);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.waitForFunction(
    () => ((window as any).__schPinProbe?.() ?? []).length > 0,
    undefined, { timeout: 60_000 },
  );

  // Open the drawer and click the mclk_from_dco row — nested two levels deep
  // (PROCESSOR_1 -> clock_module_0), never manually expanded by this test.
  await page.locator('[data-btn="toggle-generated-files"]').click();
  const drawer = page.locator('[data-drawer="generated-files"]');
  await expect(drawer).toBeVisible();
  const row = drawer.locator("tr").filter({ has: page.getByRole("cell", { name: "mclk_from_dco", exact: true }) });
  await row.getByRole("cell", { name: "20", exact: true }).waitFor({ timeout: 10_000 });

  // Single click = preview only (selects the row, shows the SDC source on the right) — no jump.
  await row.click();
  await expect(page.locator('[data-status="objname"]')).toHaveCount(0);

  await row.dblclick();

  // The schematic auto-expanded PROCESSOR_1 and clock_module_0 and selected the clock-root box —
  // the object-name bar shows its SDC clock info without any manual double-click navigation.
  const clk = page.locator('[data-status="sdcclock"]');
  await expect(clk).toBeVisible({ timeout: 10_000 });
  await expect(clk).toContainText("mclk_from_dco");
  await expect(clk).toContainText("20ns");

  const parentId = await page.evaluate(() =>
    (window as any).__hierStore.getState().schematics["crsch:clock"]?.nodes["clk:mclk_from_dco"]?.parentId);
  expect(parentId, "clk:mclk_from_dco must have been auto-expanded into clock_module_0").toContain("clock_module_0");

  // "highlighted and centered on screen" — the box itself carries the blue selection outline
  // (not just its pin), and its on-screen position lands near the middle of the canvas viewport,
  // not wherever ELK happened to place it in the wider layout.
  await page.waitForTimeout(300);   // let the pan/zoom settle before reading pixels
  const centered = await page.evaluate(() => {
    const probe = (window as any).__schPinProbe() as Array<{ node: string; port: string; x: number; y: number }>;
    const pin = probe.find((p) => p.node === "clk:mclk_from_dco");
    const wrap = document.querySelector(".schwrap")?.getBoundingClientRect();
    if (!pin || !wrap) return null;
    return {
      pin,
      viewportCenter: { x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height / 2 },
    };
  });
  expect(centered, "clk:mclk_from_dco pin and .schwrap must both be resolvable").toBeTruthy();
  expect(Math.abs(centered!.pin.x - centered!.viewportCenter.x)).toBeLessThan(250);
  expect(Math.abs(centered!.pin.y - centered!.viewportCenter.y)).toBeLessThan(250);

  const selectedNode = await page.evaluate(() => document.querySelector('[data-status="objname"]')?.textContent);
  expect(selectedNode).toContain("mclk_from_dco");

  // "schematic 中相应的时钟 path 高亮" — the store's sticky highlight request is set, and the
  // path it names spans more than just the root box (root + boundary crossings + flop sink).
  const highlight = await page.evaluate(() => (window as any).__hierStore.getState().highlightedClock);
  expect(highlight).toEqual({ seedId: "crsch:clock", clockName: "mclk_from_dco" });
  const pathNodeCount = await page.evaluate(() =>
    (window as any).__hierStore.getState().schematics["crsch:clock"]?.clockPaths?.["mclk_from_dco"]?.length ?? 0);
  expect(pathNodeCount).toBeGreaterThan(1);

  await app.close();
});
