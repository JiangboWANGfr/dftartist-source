// "点击occ定义点可以找到sdc相应的clock定义" — an OCC definition point recorded with `-clock`
// must be clickable in the drawer's "OCC Points" tab: single click previews that clock's actual
// SDC source on the right (the SAME persistent right column the Clocks/Generated-Files tabs use),
// double-click jumps to it on the schematic. Uses the real processor_core design/SDC (same as
// clocktree-jump-to-clock.spec.ts) — soc_clockgen's flat fixture never populates schPinProbe.
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

test("Clock Tree: clicking an OCC point in the drawer finds its SDC clock definition", async () => {
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

  // Record an OCC point tied to dco_clk, the same way the schematic's right-click menu would.
  const rec = await page.evaluate(async () =>
    (window as any).dft.design.query("dp-shell", { script: "add_occ_point dco_clk -clock dco_clk", file: "" }));
  expect(rec.ok, JSON.stringify(rec)).toBe(true);

  await page.locator('[data-btn="toggle-generated-files"]').click();
  const drawer = page.locator('[data-drawer="generated-files"]');
  // The tab's own badge must reflect the point recorded via dp_shell BEFORE this drawer was ever
  // opened, not just the table underneath it — `loadOccText` used to refresh only the table's
  // state, leaving the badge's separate (legacy) counter stuck at 0.
  const occTabBtn = drawer.getByRole("button", { name: /^OCC Points/ });
  await expect(occTabBtn).toHaveText("OCC Points1");
  await occTabBtn.click();

  const row = drawer.locator("tr").filter({ has: page.getByRole("cell", { name: "dco_clk", exact: true }) });
  await row.waitFor({ timeout: 10_000 });

  // Single click previews the real SDC source on the right.
  await row.click();
  await expect(drawer).toContainText("create_clock");
  await expect(drawer).toContainText("processor_core_design.sdc:");

  // Double-click jumps to the schematic.
  await row.dblclick();
  await expect(page.locator('[data-status="objname"]')).toBeVisible({ timeout: 10_000 });
  const highlight = await page.evaluate(() => (window as any).__hierStore.getState().highlightedClock);
  expect(highlight).toEqual({ seedId: "crsch:clock", clockName: "dco_clk" });

  await app.close();
});
