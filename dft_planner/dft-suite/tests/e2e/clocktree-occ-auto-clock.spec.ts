// "点击occ定义点可以找到sdc相应的clock定义" needs a clock name RECORDED on the point in the
// first place. The real, most-used way to create one is right-click a pin/node on the schematic
// -> "add_occ_point" (SchematicTab.tsx) — and that path never passed `-clock`, so every point
// created this way came back with an EMPTY clock field: nothing to look up, and the drawer's
// "OCC Points" badge count (fixed separately — see clocktree-occ-jump-to-sdc.spec.ts) had nothing
// meaningful to show either. Fixed by auto-filling `-clock` from the same clock/reset analysis
// that already colors the schematic (SchPort.clocks per pin, clockPaths per node, falling back
// across the pin's own wire) whenever it is unambiguous — never guessed when a node is shared by
// more than one clock's path. Drives two real right-click scenarios against processor_core:
// the clock-root symbol itself, and an ordinary instance pin one hop downstream of it.
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

test("Clock Tree: right-click add_occ_point auto-fills -clock from the schematic's own analysis", async () => {
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

  const report = () => page.evaluate(() =>
    (window as any).dft.design.query("dp-shell", { script: "report_occ_def_points", file: "" }));
  // Poll until the same pin reports the same screen coordinates twice in a row — the stage's
  // post-layout auto-fit can still shift pins a moment after __schPinProbe first reports them.
  const findStablePin = async (node: string, port: string) => {
    const read = () => page.evaluate(({ node, port }) =>
      ((window as any).__schPinProbe() as Array<{ node: string; port: string; x: number; y: number }>)
        .find((p) => p.node === node && p.port === port), { node, port });
    let pin = await read();
    for (let i = 0; i < 20 && pin; i++) {
      await page.waitForTimeout(100);
      const next = await read();
      if (next && pin && next.x === pin.x && next.y === pin.y) { pin = next; break; }
      pin = next;
    }
    return pin;
  };

  // ---- Scenario 1: right-click the clock-root SYMBOL itself (the most obvious place to define
  // an OCC point on) — its "o" output pin has no direct SchPort.clocks tag, only node-level
  // clockPaths membership as a singleton.
  const rootPin = await findStablePin("clk:dco_clk", "o");
  expect(rootPin, "dco_clk root symbol pin must be on the canvas").toBeTruthy();
  await page.mouse.click(rootPin!.x, rootPin!.y, { button: "right" });
  await page.locator('[data-menu="add-occ"], [data-menu="add-occ-node"]').first().click();
  await page.waitForTimeout(300);
  let rep = await report();
  let pt = rep.occPoints.find((p: any) => /dco_clk$/.test(p.pin) && !p.pin.includes("PROCESSOR_1"));
  expect(pt, JSON.stringify(rep.occPoints)).toBeTruthy();
  expect(pt.clock, "clock-root symbol: -clock must be auto-filled").toBe("dco_clk");

  // ---- Scenario 2: an ordinary INSTANCE PIN one hop downstream of the root (PROCESSOR_1's own
  // dco_clk input) — SchPort.clocks isn't set on either end of that specific wire; only the
  // neighbor node's clockPaths membership resolves it.
  const instPin = await findStablePin("processor_core.PROCESSOR_1", "dco_clk");
  expect(instPin, "PROCESSOR_1.dco_clk pin must be on the canvas").toBeTruthy();
  await page.mouse.click(instPin!.x, instPin!.y, { button: "right" });
  await page.locator('[data-menu="add-occ"], [data-menu="add-occ-node"]').first().click();
  await page.waitForTimeout(300);
  rep = await report();
  pt = rep.occPoints.find((p: any) => p.pin.endsWith("PROCESSOR_1.dco_clk"));
  expect(pt, JSON.stringify(rep.occPoints)).toBeTruthy();
  expect(pt.clock, "one-hop instance pin: -clock must still resolve via the neighbor node").toBe("dco_clk");

  await app.close();
});
