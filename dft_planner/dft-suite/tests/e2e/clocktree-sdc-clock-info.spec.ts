// Clock Tree x SDC clock definitions: the real processor_core design's clock module
// (omsp_clock_module) really does mux dco_clk/lfxt_clk into mclk/smclk and divide them --
// processor_core_design.sdc now declares those as create_generated_clock, and this asserts an
// engineer can see the resolved period/master-clock/generated info both in the page-level SDC
// clocks banner AND right on the schematic (the clock-root pin's object-name bar), not just a
// bare clock name.
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

test("Clock Tree: real design's generated clocks show resolved period/master, not just a name", async () => {
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

  // mclk_from_dco's own net (PROCESSOR_1/clock_module_0/mclk) is INTERNAL to clock_module_0, so
  // its clock-root box must be nested there too (crSchematic.ts places a clock root at its real
  // definition-point scope) — not floating at the harden top like a real primary port such as
  // dco_clk, which would force a dashed "crossed a boundary with no port" edge into every sync
  // cell inside clock_module_0 that it directly clocks. Expand PROCESSOR_1, then clock_module_0,
  // via real double-clicks on each box's body (the established convention: offset from a known
  // pin so the click lands on the box, not the pin stub).
  const findPin = (nodeSuffix: string, port?: string) => page.evaluate(
    ({ nodeSuffix, port }) => ((window as any).__schPinProbe() as
      Array<{ node: string; port: string; x: number; y: number }>)
      .find((p) => p.node.endsWith(nodeSuffix) && (!port || p.port === port)),
    { nodeSuffix, port },
  );
  const procPin = await findPin("PROCESSOR_1", "dco_clk");
  expect(procPin, "PROCESSOR_1 must have a dco_clk boundary pin").toBeTruthy();
  await page.mouse.dblclick(procPin!.x + 150, procPin!.y);
  await page.waitForTimeout(500);

  const cmPin = await findPin("clock_module_0", "dco_clk");
  expect(cmPin, "clock_module_0 must have a dco_clk boundary pin once PROCESSOR_1 is open").toBeTruthy();
  await page.mouse.dblclick(cmPin!.x + 60, cmPin!.y);
  await page.waitForTimeout(500);

  // The generated clock's own root box on the schematic (crSchematic.ts's "clk:<name>" node),
  // now visible inside clock_module_0 — find its single output pin via the real-pixel probe.
  const pin = await findPin("clk:mclk_from_dco");
  expect(pin, "mclk_from_dco clock-root box must be nested inside clock_module_0").toBeTruthy();

  // Confirm the fix directly: the root node's parentId is clock_module_0's own id, not undefined
  // (top level) — this is exactly what stops the dashed miswired-boundary edge.
  const parentId = await page.evaluate(() =>
    (window as any).__hierStore.getState().schematics["crsch:clock"]?.nodes["clk:mclk_from_dco"]?.parentId);
  expect(parentId, "clk:mclk_from_dco must be parented inside clock_module_0").toContain("clock_module_0");

  await page.mouse.click(pin!.x, pin!.y);
  const bar = page.locator('[data-status="objname"]');
  await expect(bar).toBeVisible();
  const clk = page.locator('[data-status="sdcclock"]');
  await expect(clk).toBeVisible();
  // mclk is a real `-add` mux target (mclk_from_dco AND mclk_from_lfxt both target it) — the
  // bar names every clock sharing that target, not just the one the walk happened to pick.
  await expect(clk).toContainText("SDC clocks (mux-shared): mclk_from_dco");
  await expect(clk).toContainText("20ns");
  await expect(clk).toContainText("generated");
  await expect(clk).toContainText("master dco_clk");
  // "where is this defined" — the actual SDC file:line, not just the resolved values.
  await expect(clk).toContainText("defined at processor_core_design.sdc:");

  await app.close();
});
