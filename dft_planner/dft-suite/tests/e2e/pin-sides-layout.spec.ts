// INVARIANT on the REAL laid-out canvas: every input pin sits left of its box centre, every
// output pin right of it ("左边是输入，右边是输出"). The unit test pins the ELK port SIDE the
// builder emits; this one measures the pixels ELK actually produced, on two scenes that use
// different node factories:
//   1. free schematic on an SRAM — RTL boxes, traced neighbours, load boxes
//   2. DRC debug canvas — SYNTHETIC nodes (planned muxes, expanded IP internals, walked
//      clock/reset boxes) whose pin directions are code-made, not read from the RTL
// The one legal exception is a MUX select, which enters from the top by design.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const IPDIR = "/home/wongw/nx9000/user_material/dfx_ip/gate";
const SEED = "processor_core.PROG_MEM_2";

/** In-page checker: returns the pins whose x sits on the wrong side of their box centre. */
const CHECK = (seedKey: string) => {
  const laid = (window as unknown as { __laidForTest?: Record<string, any> }).__laidForTest?.[seedKey];
  const graphs = (window as unknown as { __graphForTest?: Record<string, any> }).__graphForTest ?? {};
  const store = (window as unknown as { __hierStore: any }).__hierStore.getState();
  const g = graphs[seedKey] ?? store.schematics[seedKey];
  if (!laid || !g) return { boxes: 0, bad: [{ node: "(no layout)", pin: "", dir: "", side: "" }] };
  const bad: Array<{ node: string; pin: string; dir: string; side: string }> = [];
  for (const b of laid.boxes) {
    const node = g.nodes[b.node.id] ?? b.node;
    const cx = b.x + b.w / 2;
    for (const p of node.ports) {
      // a MUX select legitimately enters from the NORTH
      if (node.prim === "mux" && p.name === "s") continue;
      const key = Object.keys(b.ports).find((k: string) =>
        k.startsWith(node.id) && k.endsWith(p.name) &&
        k.length === node.id.length + 1 + p.name.length);
      if (!key) continue;
      const pt = b.ports[key];
      const side = pt.x < cx ? "L" : "R";
      const want = p.direction === "out" ? "R" : "L";
      if (side !== want) bad.push({ node: node.id, pin: p.name, dir: p.direction, side });
    }
  }
  return { boxes: laid.boxes.length, bad };
};

test("inputs stay on the left and outputs on the right (free schematic + DRC canvas)", async () => {
  test.setTimeout(240_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // --- scene 1: grow a free schematic in BOTH directions, then show every pin of a big box
  await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().openSchematic(seed);
    for (const p of ["CLK", "CEN", "WEN", "A", "D"]) await st().traceSchematic(seed, seed, p, "fanin");
    await st().traceSchematic(seed, seed, "Q", "fanout");
    for (let round = 0; round < 2; round++) {
      const g = st().schematics[seed];
      for (const id of Object.keys(g.nodes))
        for (const q of g.nodes[id].ports.filter((x: any) => x.direction === "out"))
          await st().traceSchematic(seed, id, q.name, "fanout");
    }
    // the 43-pin case: "Show Pins on Box" puts every port of PROCESSOR_1 on the canvas
    const full = await (window as any).dft.design.query("get-ports", { nodeId: "processor_core.PROCESSOR_1" });
    st().setVisiblePins(seed, "processor_core.PROCESSOR_1", full.ports.map((p: any) => p.name), full.ports);
  }, SEED);
  await page.locator("#hier-center canvas").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  const free = await page.evaluate(CHECK, SEED);
  console.log("FREE:", JSON.stringify(free));
  expect(free.boxes).toBeGreaterThan(2);
  expect(free.bad, "a pin is drawn on the wrong side in the free schematic").toEqual([]);

  // --- scene 2: the DRC debug canvas (planned muxes + IP internals + walked boxes)
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("drc"));
  await page.waitForFunction(() => !!(window as any).__proposeResetFixesForTest, null, { timeout: 30_000 });
  await page.evaluate(async (ipdir) => {
    const q = (m: string, p: any) => (window as any).dft.design.query(m, p);
    try { await q("dp-shell", { script: "read_dfx_ip {" + ipdir + "}", file: "" }); } catch { /* optional */ }
    const tree: any = await q("clock-reset-tree", { sdcFile: "", dftLibSetting: "", occPoints: [],
      scanForces: [], pinConstraints: [], phases: false });
    const items = (tree.items ?? []).filter((i: any) => i.kind === "reset");
    const acts = (window as any).__proposeResetFixesForTest({ items, ips: [], patched: [] });
    await q("dp-shell", { script: acts.filter((a: any) => a.on && !a.command.startsWith("#"))
      .map((a: any) => a.command).join(String.fromCharCode(10)), file: "" });
  }, IPDIR);
  const run = page.locator(".drctab button", { hasText: "Run DRC" }).first();
  await expect(run).toBeEnabled({ timeout: 120_000 });
  await run.click();
  await page.locator(".drctab .drcrule.has").first().waitFor({ timeout: 120_000 });
  const rules = await page.locator(".drctab .drcrule.has").count();
  for (let k = 0; k < rules; k++) {
    await page.locator(".drctab .drcrule.has").nth(k).click();
    const rows = page.locator(".drctab .drcrow").filter({ hasText: "puc_rst" });
    if (await rows.count()) { await rows.first().dblclick(); break; }
  }
  await page.waitForFunction(() => Object.keys((window as any).__laidForTest ?? {})
    .some((k) => k.startsWith("drcsch:")), null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  const drcKey = await page.evaluate(() =>
    Object.keys((window as any).__laidForTest ?? {}).find((k) => k.startsWith("drcsch:"))!) as string;
  const drc = await page.evaluate(CHECK, drcKey);
  console.log("DRC:", drcKey.slice(0, 50), JSON.stringify(drc));
  expect(drc.boxes).toBeGreaterThan(4);
  expect(drc.bad, "a pin is drawn on the wrong side on the DRC canvas").toEqual([]);

  await app.close().catch(() => {});
});
