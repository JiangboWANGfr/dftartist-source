// "这张图显示有multi driven，错误太明显了" — a screenshot showed TWO `puc_a_scan` boxes both
// apparently feeding sync_cell_puc's reset pin. Root cause: the curated DRC-walk canvas already
// draws ONE edge into sync_cell_puc.rst (from the collapsed `puc_a` converge-point gate). If the
// user then manually re-traces that SAME pin's fanin (an ordinary behavioral trace, unaware of
// the walk's collapse), it resolves the literal alias chain instead (`assign puc_a_scan = puc_a;`
// at omsp_clock_module.v:1026) and used to draw a SECOND edge into the same pin — a real
// duplicate-driver rendering, not a genuine RTL multi-driven net (confirmed: omsp_clock_module.v
// drives puc_a_scan from exactly one branch of a mutually-exclusive `ifdef ASIC`/`else`).
// Fixed in core/schematic.ts: addTrace/addTraceInto/addNodeWithEdges now drop any newly-resolved
// edge whose target pin the graph already has an incoming edge for.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";
const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")].find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const IPDIR = "/home/wongw/nx9000/user_material/dfx_ip/gate";

test("re-tracing a pin the DRC walk already resolved does not draw a second driver", async () => {
  test.setTimeout(240_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 250)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("drc"));
  await page.waitForFunction(() => !!(window as any).__proposeResetFixesForTest, null, { timeout: 30_000 });
  await page.evaluate(async (ipdir) => {
    const q = (m: string, p: any) => (window as any).dft.design.query(m, p);
    try { await q("dp-shell", { script: `read_dfx_ip {${ipdir}}`, file: "" }); } catch { /* optional */ }
    const tree: any = await q("clock-reset-tree", { sdcFile: "", dftLibSetting: "", occPoints: [],
      scanForces: [], pinConstraints: [], phases: false });
    const items = (tree.items ?? []).filter((i: any) => i.kind === "reset");
    const actions = (window as any).__proposeResetFixesForTest({ items, ips: [], patched: [] });
    await q("dp-shell", { script: actions.filter((a: any) => a.on && !a.command.startsWith("#"))
      .map((a: any) => a.command).join(String.fromCharCode(10)), file: "" });
  }, IPDIR);
  const run = page.locator(".drctab button", { hasText: "Run DRC" }).first();
  await run.isEnabled({ timeout: 120_000 }).catch(() => {});
  await run.click().catch(() => {});
  await page.locator(".drctab .drcrule.has").first().waitFor({ timeout: 120_000 });
  const rc = await page.locator(".drctab .drcrule.has").count();
  let opened = false;
  for (let k = 0; k < rc && !opened; k++) {
    await page.locator(".drctab .drcrule.has").nth(k).click();
    const rows = page.locator(".drctab .drcrow");
    const n = await rows.count();
    for (let r = 0; r < n; r++) {
      const txt = (await rows.nth(r).innerText()).replace(/\s+/g, " ");
      if (/^PROCESSOR_1\.clock_module_0\.sync_cell_puc\s+rst\b/.test(txt)) {
        await rows.nth(r).dblclick(); opened = true; break;
      }
    }
  }
  expect(opened, "could not find the sync_cell_puc rst DRC row").toBe(true);
  await page.waitForFunction(() => Object.keys((window as any).__graphForTest ?? {}).some((k) => k.startsWith("drcsch:")), null, { timeout: 60_000 });
  await page.waitForTimeout(2000);

  const seedKey = "drcsch:reset:processor_core.PROCESSOR_1.clock_module_0.sync_cell_puc:rst";
  await page.evaluate(async (sk) => {
    const st = () => (window as any).__hierStore.getState();
    await st().traceSchematic(sk, "processor_core.PROCESSOR_1.clock_module_0.sync_cell_puc", "rst", "fanin");
  }, seedKey);
  await page.waitForTimeout(1000);

  const dump = await page.evaluate(() => {
    const all: Record<string, any> = (window as any).__graphForTest ?? {};
    const key = Object.keys(all).find((k) => k.startsWith("drcsch:"))!;
    const g = all[key];
    return {
      key,
      edges: g.edges.map((e: any) => ({ f: e.fromNode, fp: e.fromPort, t: e.toNode, tp: e.toPort, net: e.netName })),
    };
  });

  const seen = new Map<string, Set<string>>();
  for (const e of dump.edges) {
    const k = `${e.t} ${e.tp}`;
    const s = seen.get(k) ?? new Set<string>();
    s.add(`${e.f}.${e.fp}`);
    seen.set(k, s);
  }
  const multiDriven: string[] = [];
  for (const [k, s] of seen) if (s.size > 1) multiDriven.push(`${k} <- ${[...s].join(" , ")}`);
  console.log("MULTI-DRIVEN:", JSON.stringify(multiDriven));
  expect(multiDriven, "no pin may show two incoming edges").toEqual([]);

  // the original driver edge (from the walk's collapsed converge-point gate) must still be there —
  // the fix drops the DUPLICATE, not the original resolution.
  const rstIn = dump.edges.filter((e: any) =>
    e.t === "processor_core.PROCESSOR_1.clock_module_0.sync_cell_puc" && e.tp === "rst");
  expect(rstIn.length).toBe(1);

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
