// "or gate 出现了 multi driven" — on the FINAL canvas graph (planned muxes spliced in, planned
// IP internals expanded), no pin may have two drivers. This drives the real design through the
// real DRC autofix, then checks the invariant on the very graph the page renders, because the
// overlay is exactly where a second driver can appear.
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

test("no multi-driven pin on the DRC canvas after the autofix muxes are planned", async () => {
  test.setTimeout(240_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // The DRC workspace owns the proposal function; open it so its module (and the e2e handle)
  // is loaded before the plan is computed.
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("drc"));
  await page.waitForFunction(() => !!(window as any).__proposeResetFixesForTest, null,
                             { timeout: 30_000 });

  // Plan exactly what the autofix proposes for the puc chain — IPs first, then the muxes.
  const planned = await page.evaluate(async (ipdir) => {
    const q = (m: string, p: any) => (window as any).dft.design.query(m, p);
    if (ipdir) { try { await q("dp-shell", { script: `read_dfx_ip {${ipdir}}`, file: "" }); } catch { /* optional */ } }
    const tree: any = await q("clock-reset-tree", { sdcFile: "", dftLibSetting: "", occPoints: [],
      scanForces: [], pinConstraints: [], phases: false });
    const items = (tree.items ?? []).filter((i: any) => i.kind === "reset");
    // the app's OWN proposal function (exposed for e2e) — never a hard-coded mux list
    const propose = (window as any).__proposeResetFixesForTest;
    const actions = propose ? propose({ items, ips: [], patched: [] }) : [];
    const cmds = actions.filter((a: any) => a.on && a.command && !a.command.startsWith("#"))
                        .map((a: any) => a.command);
    if (cmds.length) await q("dp-shell", { script: cmds.join("\n"), file: "" });
    return cmds;
  }, IPDIR);
  console.log("PLANNED:", JSON.stringify(planned, null, 0).slice(0, 700));
  expect(planned.length, "the autofix proposed nothing to plan").toBeGreaterThan(0);

  // Run the DRC and open the DEBUG view of a failing reset — this is the picture the engineer
  // looks at: the walked circuit, the planned muxes spliced in, the planned IP boxes expanded
  // into their real internals.
  await page.locator(".drctab").first().waitFor({ timeout: 20_000 });
  const run = page.locator(".drctab button", { hasText: /run|analy|分析/i }).first();
  if (await run.count()) await run.click().catch(() => {});
  // Open the RESET violations (several of them) — the reset rows are the ones whose circuit
  // carries the planned muxes and the expanded IP boxes, i.e. the picture in question.
  const rows = page.locator(".drctab .drcrow").filter({ hasText: "puc" });
  await rows.first().waitFor({ timeout: 90_000 });
  const n = Math.min(await rows.count(), 8);
  for (let k = 0; k < n; k++) await rows.nth(k).dblclick().catch(() => {});
  // Wait for the DEBUG canvas's own graph handle rather than a DOM container id — the handle
  // is set by the schematic itself, so it cannot go stale when the layout markup changes.
  await page.waitForFunction(() =>
    Object.keys((window as any).__graphForTest ?? {}).some((k) => k.startsWith("drcsch:")),
    null, { timeout: 60_000 });
  await page.waitForTimeout(3000);   // planned-mux overlay + IP cone fetch + layout

  const report = await page.evaluate(() => {
    const all: Record<string, any> = (window as any).__graphForTest ?? {};
    const seeds = Object.keys(all).filter((k) => k.startsWith("drcsch:"));
    if (!seeds.length) return { ok: false, reason: "no drc graph handle", seeds: Object.keys(all) };
    const bad: string[] = [];
    let nodes = 0, edges = 0;
    for (const s of seeds) {
      const g = all[s];
      if (!g) continue;
      nodes = Math.max(nodes, Object.keys(g.nodes).length);
      edges = Math.max(edges, g.edges.length);
      const seen = new Map<string, Set<string>>();
      for (const e of g.edges) {
        const key = `${e.toNode} ${e.toPort}`;
        const set = seen.get(key) ?? new Set<string>();
        set.add(`${e.fromNode}.${e.fromPort}`);
        seen.set(key, set);
      }
      for (const [k2, set] of seen)
        if (set.size > 1) bad.push(`${s.slice(0, 40)} :: ${k2} <- ${[...set].join(" , ")}`);
    }
    return { ok: true, seeds: seeds.length, nodes, edges, bad };
  });
  console.log("GRAPH:", JSON.stringify(report).slice(0, 1200));
  expect(report.ok, report.reason ?? "").toBe(true);
  expect(report.bad, "a pin with two drivers is on the canvas").toEqual([]);

  await app.close().catch(() => {});
});
