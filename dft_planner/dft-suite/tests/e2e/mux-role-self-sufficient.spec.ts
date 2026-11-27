// "这张图绿色圆圈里面的mux 会让用户觉得多余" — a planned mux's role caption ("本组的修复点 · N
// flop · owner/net") only ever appeared because the DRC tab happened to have been run once THIS
// session (it is the only place that called setCrItems). A free schematic opened without ever
// visiting DRC (or running it) drew every planned mux with the bare, unexplained "dmux2_1"
// caption, which reads as a redundant mux. SchematicTab.tsx now bootstraps a bare reset walk
// itself the first time a planned mux appears with crItems still empty. This test reproduces the
// exact "never ran DRC" condition: the DRC workspace is only visited far enough to register the
// test hook and apply the fix plan via raw dp_shell/daemon queries — the "Run DRC" button (the
// only thing that calls setCrItems) is never clicked — then the free schematic is opened and the
// mux's caption must still explain itself.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")].find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const IPDIR = "/home/wongw/nx9000/user_material/dfx_ip/gate";
const SEED = "processor_core.PROCESSOR_1.clock_module_0.sync_cell_puc";   // its data_out feeds a planned mux

test("a planned mux explains its role even if DRC was never run this session", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 250)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // Visit the DRC workspace only far enough to mount the test hook + apply the plan via RAW
  // daemon queries — never through the store's clockResetTree/runDrc, so setCrItems is never
  // called and the "Run DRC" button is never clicked.
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
  const crItemsAfterApply = await page.evaluate(() => (window as any).__hierStore.getState().crItems.length);
  console.log("crItems after applying the plan (must be 0 — Run DRC never clicked):", crItemsAfterApply);
  expect(crItemsAfterApply).toBe(0);

  // Now leave DRC and open the FREE schematic — no DRC run has ever happened this session.
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("hierarchy"));
  await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.PROCESSOR_1");
    await st().toggleExpand("processor_core.PROCESSOR_1.clock_module_0");
    await st().openSchematic(seed);
    // data_out is sync_cell_puc's real Q output — the mux the plan records against
    // "sync_cell_puc.data_out" splices onto THIS edge structurally, no alias hop needed.
    await st().traceSchematic(seed, seed, "data_out", "fanout");
  }, SEED);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  // Give the async crBootstrapPromise (clockResetTree -> setCrItems) time to land and the
  // planned-mux poll to pick up the resulting role.
  await page.waitForTimeout(6000);

  const mux = await page.evaluate((seed) => {
    const g: any = (window as any).__graphForTest?.[seed];
    if (!g) return null;
    const id = Object.keys(g.nodes).find((k: string) => k.startsWith("planmux:") && k.includes("sync_cell_puc"));
    return id ? { id, designName: g.nodes[id].designName } : null;
  }, SEED);
  console.log("MUX CAPTION:", JSON.stringify(mux));
  expect(mux, "the puc_a planned mux must be on canvas").not.toBeNull();
  expect(mux!.designName, "caption must explain the mux's role, not read as a bare/redundant mux")
    .not.toBe("dmux2_1");

  const crItemsNow = await page.evaluate(() => (window as any).__hierStore.getState().crItems.length);
  console.log("crItems after bootstrap:", crItemsNow);
  expect(crItemsNow).toBeGreaterThan(0);

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
