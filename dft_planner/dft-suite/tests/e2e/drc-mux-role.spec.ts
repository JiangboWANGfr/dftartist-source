// "绿色 mux 的 fanout 没有 drive 任何寄存器,为什么需要这个 fix?" — because its beneficiaries
// are on ANOTHER branch of por that the drawn cone does not show. The canvas now has to SAY
// that: on a DRC debug view, every planned mux carries a role caption — the fix point of THIS
// group, or working for another branch (with its flop count) — so two muxes in series never
// read as one fix applied twice.
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

test("every planned mux on the debug canvas explains who it is for", async () => {
  test.setTimeout(240_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // Plan the autofix result (the session the screenshot came from).
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("drc"));
  await page.waitForFunction(() => !!(window as any).__proposeResetFixesForTest, null, { timeout: 30_000 });
  await page.evaluate(async (ipdir) => {
    const q = (m: string, p: any) => (window as any).dft.design.query(m, p);
    if (ipdir) { try { await q("dp-shell", { script: `read_dfx_ip {${ipdir}}`, file: "" }); } catch { /* optional */ } }
    const tree: any = await q("clock-reset-tree", { sdcFile: "", dftLibSetting: "", occPoints: [],
      scanForces: [], pinConstraints: [], phases: false });
    const items = (tree.items ?? []).filter((i: any) => i.kind === "reset");
    const actions = (window as any).__proposeResetFixesForTest({ items, ips: [], patched: [] });
    const cmds = actions.filter((a: any) => a.on && a.command && !a.command.startsWith("#"))
                        .map((a: any) => a.command);
    await q("dp-shell", { script: cmds.join("\n"), file: "" });
  }, IPDIR);

  // Re-run the DRC after planning (the test's raw queries bypass the planRev wiring that
  // would auto-rerun it) — wait out any in-flight analysis first, the button is disabled
  // while one runs and a swallowed click on it re-runs nothing.
  const run = page.locator(".drctab button", { hasText: "Run DRC" }).first();
  await expect(run).toBeEnabled({ timeout: 120_000 });
  await run.click();
  // Rows render only for the SELECTED rule, and which rule holds the puc groups depends on
  // how the values compute in this session (constrained -> FIX, unconstrained -> R2/R3/RB).
  // Walk the rules that have entries and open the first puc_rst row found — the mux splice
  // and its role captions are the same either way.
  await page.locator(".drctab .drcrule.has").first().waitFor({ timeout: 120_000 });
  const ruleCount = await page.locator(".drctab .drcrule.has").count();
  let opened = false;
  for (let k = 0; k < ruleCount && !opened; k++) {
    await page.locator(".drctab .drcrule.has").nth(k).click();
    const rows = page.locator(".drctab .drcrow").filter({ hasText: "puc_rst" });
    if (await rows.count()) { await rows.first().dblclick(); opened = true; }
  }
  expect(opened, "no rule lists a puc_rst row").toBe(true);
  await page.waitForFunction(() =>
    Object.keys((window as any).__graphForTest ?? {}).some((k) => k.startsWith("drcsch:")),
    null, { timeout: 60_000 });
  await page.waitForTimeout(3000);   // mux overlay re-splice with roles

  const roles = await page.evaluate(() => {
    const all: Record<string, any> = (window as any).__graphForTest ?? {};
    const key = Object.keys(all).find((k) => k.startsWith("drcsch:"))!;
    const out: Array<{ id: string; caption: string }> = [];
    for (const n of Object.values(all[key].nodes) as any[])
      if (n.id.startsWith("planmux:")) out.push({ id: n.id, caption: n.designName });
    return out;
  });
  console.log("ROLES:", JSON.stringify(roles, null, 1));
  expect(roles.length, "the debug canvas should carry planned muxes").toBeGreaterThan(0);
  for (const r of roles) {
    // every mux must explain itself — never a bare "dmux2_1"
    expect(r.caption, `${r.id} has no role caption`).toContain("—");
    expect(r.caption).toMatch(/本组的修复点|其他分支|无失败组/);
    expect(r.caption).toMatch(/flop|无失败组/);
  }
  // The puc debug view carries the chain's muxes: at least one must be THIS group's fix point,
  // and any second one on the wire must declare itself as another branch's — that distinction
  // IS the answer to "why is the upstream mux here at all".
  if (roles.length > 1) {
    expect(roles.some((r) => r.caption.includes("本组的修复点"))).toBe(true);
    expect(roles.some((r) => r.caption.includes("其他分支"))).toBe(true);
  }

  // The PROOF LIST for the "green" mux (sync_reset_por/rst_s): the daemon walk must name the
  // exact registers it serves — por's direct consumers (watchdog wdtifg/wdt_reset, the lfxt
  // sync cell, a clock_module flop), 5 flops in all — and NONE of them is on the puc cone the
  // debug view draws. This is the answer to "它并没有 drive 任何寄存器".
  const proof = await page.evaluate(() => {
    const items = (window as any).__hierStore.getState().crItems;
    const mod = (window as any).__muxCoveredGroupsForTest;
    return mod ? mod(items, "processor_core/PROCESSOR_1/clock_module_0/sync_reset_por/rst_s") : null;
  });
  console.log("GREEN-MUX PROOF:", JSON.stringify(proof, null, 1));
  expect(proof, "muxCoveredGroups handle missing").not.toBeNull();
  const flops = proof.reduce((n: number, g: any) => n + g.flops, 0);
  expect(proof.length).toBeGreaterThanOrEqual(3);
  expect(flops).toBe(5);
  const owners = proof.map((g: any) => g.owner).join(" ");
  expect(owners).toContain("watchdog_0");
  expect(owners).toContain("lfxt");
  // and none of its groups is the puc chain — those belong to the downstream muxes
  for (const g of proof) expect(g.net).not.toBe("puc_rst");

  // CLICK the planned mux's OUTPUT PIN (real mouse) — the registers it serves must appear as
  // DFF boxes carrying the full story (owner/net, bits, edge, inactive, three-phase values),
  // and a second click must fold them away ("点击 fanout 显示对应的寄存器 / 信息不够").
  const seedKey = await page.evaluate(() =>
    Object.keys((window as any).__graphForTest ?? {}).find((k) => k.startsWith("drcsch:"))) as string;
  const clickMuxOut = async () => {
    const pos = await page.evaluate((sk) => {
      const laid = (window as any).__laidForTest?.[sk];
      const view = (window as any).__stageViewForTest?.[sk];
      if (!laid || !view) return null;
      const b = laid.boxes.find((x: any) => x.node.id.startsWith("planmux:"));
      if (!b) return null;
      const key = Object.keys(b.ports).find((k: string) => k.endsWith("o"));
      if (!key) return null;
      const pt = b.ports[key];
      // The clickable marker sits ON the box border: an OUT pin's anchor is PIN_STUB(=10)
      // outside the edge, so step back inward to land inside the 18x18 hit area.
      return { x: view.x + (pt.x - 10) * view.scale, y: view.y + pt.y * view.scale,
               mux: b.node.id };
    }, seedKey);
    expect(pos, "planned mux pin geometry not found").not.toBeNull();
    const canvas = page.locator(".drctab canvas, #hier-center canvas").first();
    const bb = await canvas.boundingBox();
    await page.mouse.click(bb!.x + pos!.x, bb!.y + pos!.y);
    await page.waitForTimeout(1200);
    return pos!.mux;
  };
  await clickMuxOut();
  // wait until the relayout with the new boxes actually LANDED before reading anything
  await page.waitForFunction((sk) => {
    const laid = (window as any).__laidForTest?.[sk];
    return !!laid?.boxes.some((b: any) => b.node.id.startsWith("covreg:"));
  }, seedKey, { timeout: 30_000 });
  const shown = await page.evaluate((sk) => {
    const g = (window as any).__graphForTest?.[sk];
    return Object.values(g?.nodes ?? {}).filter((n: any) => n.id.startsWith("covreg:"))
      .map((n: any) => ({ id: n.id, name: n.instanceName, info: n.designName,
                          state: n.stateLabel, bits: n.bits, prim: n.prim }));
  }, seedKey);
  console.log("COVREG:", JSON.stringify(shown.slice(0, 4), null, 1),
              "total:", shown.length);
  expect(shown.length, "register boxes must appear after clicking the mux output")
    .toBeGreaterThan(0);
  // capped: at most 12 concrete groups + one "+N more" summary — never a buried canvas
  expect(shown.length).toBeLessThanOrEqual(13);
  for (const n of shown) {
    expect(n.prim).toBe("dff");
    expect(n.bits).toBeGreaterThan(0);
    if (n.id.endsWith("__more")) { expect(n.name).toMatch(/^\+\d+ 组/); continue; }
    expect(n.info).toMatch(/bit · (rst|set) (posedge|negedge)/);
    expect(n.info).toContain("inactive=");
    expect(n.state).toMatch(/s\(/);
  }
  // second click folds them away
  await clickMuxOut();
  await page.waitForFunction((sk) => {
    const g = (window as any).__graphForTest?.[sk];
    return Object.keys(g?.nodes ?? {}).every((k) => !k.startsWith("covreg:"));
  }, seedKey, { timeout: 30_000 });

  await app.close().catch(() => {});
});
