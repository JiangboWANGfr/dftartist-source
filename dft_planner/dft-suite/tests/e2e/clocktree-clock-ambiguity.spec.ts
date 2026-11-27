// Clock Tree "互动性太差" follow-up: two concrete gaps a screenshot review found in the real
// processor_core design.
//
//   1) mclk is a REAL mux target: processor_core_design.sdc declares BOTH mclk_from_dco and
//      mclk_from_lfxt as `-add` generated clocks on the same net (PROCESSOR_1/clock_module_0/
//      mclk). The walk only ever attributes a flop group's clockName to ONE of them (its
//      SdcIndex is single-valued), so the clock-root box used to carry only its own walk-chosen
//      alternative. crSchematic.ts now cross-references the FULL resolved clock list by target
//      object (clocksByTarget) and tags the root node with every name sharing that target
//      (clockAliases) — the object-name bar re-resolves each one's own period/master instead of
//      only ever showing the one the walk happened to pick.
//   2) The 5 generated clocks (mclk_from_dco/mclk_from_lfxt/smclk_from_dco/smclk_from_lfxt/aclk)
//      are all defined inside clock_module_0, but the collapsed top-level view gave no hint they
//      existed — an engineer had to already know to double-click twice to find them. Collapsed
//      containers now bubble up a `definesClocks` list from every clock-root node in the closed
//      subtree, so PROCESSOR_1 says what is inside it before it is ever opened.
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

test("Clock Tree: a collapsed box says what it defines, and a mux-shared pin names every clock", async () => {
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

  // ---- gap 2: the STILL-COLLAPSED top-level PROCESSOR_1 box already says what's defined inside.
  const definesClocks: string[] | undefined = await page.evaluate(() => {
    const g = (window as any).__hierStore.getState().schematics["crsch:clock"];
    const id = Object.keys(g?.nodes ?? {}).find((k) => k.endsWith("PROCESSOR_1"));
    return id ? g.nodes[id]?.definesClocks : undefined;
  });
  expect(definesClocks, "PROCESSOR_1 (still collapsed) must list the generated clocks defined inside it").toBeTruthy();
  expect(definesClocks).toEqual(expect.arrayContaining(["mclk_from_dco", "mclk_from_lfxt"]));

  // ---- gap 1: the clock-root box itself must say it is a mux-shared target — expand down to it
  // (PROCESSOR_1 -> clock_module_0), same navigation as clocktree-sdc-clock-info.spec.ts.
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

  // Stability-poll the root box's own pin (async post-layout auto-fit can still shift it).
  const findRootPin = () => findPin("clk:mclk_from_dco");
  let pin = await findRootPin();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = await findRootPin();
    if (pin && next && pin.x === next.x && pin.y === next.y) break;
    pin = next;
  }
  expect(pin, "mclk_from_dco clock-root box must be nested inside clock_module_0").toBeTruthy();

  const clockAliases: string[] | undefined = await page.evaluate(() =>
    (window as any).__hierStore.getState().schematics["crsch:clock"]?.nodes["clk:mclk_from_dco"]?.clockAliases);
  expect(clockAliases, "clk:mclk_from_dco must know it shares its target with mclk_from_lfxt").toBeTruthy();
  expect(clockAliases).toEqual(expect.arrayContaining(["mclk_from_dco", "mclk_from_lfxt"]));

  await page.mouse.click(pin!.x, pin!.y);
  const clk = page.locator('[data-status="sdcclock"]');
  await expect(clk).toBeVisible();
  await expect(clk).toContainText("SDC clocks (mux-shared):");
  await expect(clk).toContainText("mclk_from_dco");
  await expect(clk).toContainText("mclk_from_lfxt");

  await app.close();
});
