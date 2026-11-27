// The MBIST plan must come out of the MEMORY LIBRARY ALONE — no DEF, no UPF, no SDC ("def/upf/
// cpf 不是必须的输入件"). This drives the real design and asserts the partition the planner
// reports. processor_core carries 202 identical SRAM_8Kx16 instances across 4 real clock domains
// (dco_clk/inclk/lfxt_clk/taclk) — a "极限测试" scale-up (10 -> 202) to stress CCR3/SCR10/CCR4
// with real volume; assertions below are written against clock-domain GROUPS (summed across
// however many controllers a domain ends up split into by THIS query's physical clustering,
// not just the no-DEF one here) rather than raw array indices, so they stay correct if the
// design's memory count changes again later. This query has no defFile, so groupMemories never
// runs and clock domain alone determines the controllers.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const LIB = "/home/wongw/nx9000/library/memories";

test("MBIST plan needs only the memory library (no DEF/UPF)", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL) || !existsSync(LIB), "real design/library not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // 1) Default budgets: everything derived from the library + RTL.
  const base = await page.evaluate(async (lib) =>
    await (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);
  console.log("MBIST-BASE:", JSON.stringify({
    controllers: base.controllers.map((c: any) => ({ name: c.name, clock: c.clockDomain,
      power: c.powerMw, cycles: c.cycles, steps: c.steps.length, mem: c.memories.length })),
    steps: base.steps.length,
    memories: base.memories.map((m: any) => ({ p: m.path, clk: m.clockDomain, w: m.words,
      width: m.width, pw: m.powerMw, ctrl: m.controller, step: m.step })),
  }));

  expect(base.errors).toEqual([]);
  expect(base.memories.length).toBe(202);
  // The clock domain must be the resolved ROOT, not the local net at the memory pin.
  for (const m of base.memories) {
    expect(m.clockDomain, "clock domain must resolve out of the RTL").toBeTruthy();
    expect(m.clockDomain).not.toBe("unclocked");
    expect(m.words).toBeGreaterThan(0);
    expect(m.width).toBeGreaterThan(0);
    expect(m.powerMw).toBeGreaterThan(0);
    expect(m.cycles).toBeGreaterThan(0);
  }
  // One controller per distinct clock domain (CCR3): 4 real domains in this design.
  const domains = new Set(base.memories.map((m: any) => m.clockDomain));
  expect(domains.size).toBe(4);
  expect(base.controllers.length).toBe(domains.size);
  // At 120 mW/memory and the default 500 mW/step cap, only 4 memories fit per parallel step —
  // with 50+ memories per controller (the stress-test scale-up), that means SEVERAL sequential
  // steps per controller (SCR10), not one. Assert the budget/accounting invariants generically
  // rather than assuming everything still fits in a single step.
  for (const c of base.controllers) {
    expect(c.steps.length).toBeGreaterThan(1);
    let totalMembers = 0, totalRuntime = 0;
    for (const si of c.steps) {
      const step = base.steps[si];
      totalMembers += step.members.length;
      totalRuntime += step.runtimeNs;
      const perMem = base.memories[step.members[0]].powerMw;
      expect(step.powerMw).toBeCloseTo(perMem * step.members.length, 6);
      expect(step.powerMw).toBeLessThanOrEqual(500 + 1e-6);   // the default budget
    }
    expect(totalMembers).toBe(c.memories.length);
    // Steps within a controller run SEQUENTIALLY -> the controller's own runtime is their sum.
    expect(c.runtimeNs).toBeCloseTo(totalRuntime, 6);
  }
  // dco_clk carries the biggest group (4 original + 48 stress-test memories); the other three
  // domains carry 2 original + 48 stress-test memories each. No defFile here -> physical
  // clustering never runs, so a domain can only ever land in ONE controller (summing is still
  // future-proof if that ever changes).
  const byDomain = new Map<string, number>();
  for (const c of base.controllers)
    byDomain.set(c.clockDomain, (byDomain.get(c.clockDomain) ?? 0) + c.memories.length);
  expect(byDomain.get("dco_clk")).toBe(52);
  expect(byDomain.get("inclk")).toBe(50);
  expect(byDomain.get("lfxt_clk")).toBe(50);
  expect(byDomain.get("taclk")).toBe(50);

  // 2) A tight per-step power budget must SERIALIZE every controller's memories into more, smaller
  //    steps — peak power drops, total test time rises. That is the trade-off the knob exists for.
  const split = await page.evaluate(async (lib) =>
    await (window as any).dft.design.query("mbist-plan",
      { libDir: lib, maxPowerPerStepMw: 150 }), LIB);
  console.log("MBIST-SPLIT:", JSON.stringify({ steps: split.steps.length,
    peak: split.peakPowerMw, runtime: split.totalRuntimeNs }));
  expect(split.controllers.length).toBe(base.controllers.length);   // still one per clock domain
  expect(split.steps.length).toBeGreaterThan(base.steps.length);    // strictly more, smaller steps
  expect(split.peakPowerMw).toBeLessThan(base.peakPowerMw);
  expect(split.totalRuntimeNs).toBeGreaterThan(base.totalRuntimeNs);
  // Every extra step must be ATTRIBUTED to the rule that caused it (SCR10 = the budgets).
  const extraSteps = split.steps.filter((s: any) => s.ruleId === "SCR10");
  expect(extraSteps.length).toBeGreaterThan(0);
  for (const s of extraSteps) expect(s.ruleWhy).toContain("max_power_per_step");
  expect(split.rules.find((r: any) => r.id === "SCR10").splits).toBeGreaterThan(0);

  // 3) The rule ledger covers every CCR/SCR, and a rule the design cannot exercise says so
  //    rather than silently passing.
  const ids = base.rules.map((r: any) => r.id);
  for (const id of ["CCR1", "CCR2", "CCR3", "CCR4", "SCR1", "SCR2", "SCR3", "SCR4",
                    "SCR5", "SCR7", "SCR9", "SCR10", "SCR11"])
    expect(ids, `rule ${id} missing from the ledger`).toContain(id);
  // 4 clock domains among otherwise-identical SRAMs: CCR3 must be the thing that split them.
  expect(base.rules.find((r: any) => r.id === "CCR3").splits).toBeGreaterThan(0);
  expect(base.rules.find((r: any) => r.id === "CCR2").applies).toBe(false);  // no DRAM
  expect(base.rules.find((r: any) => r.id === "SCR4").applies).toBe(false);  // no DRAM
  expect(base.rules.find((r: any) => r.id === "CCR1").applies).toBe(true);

  // 4) CCR4 (user-forced partitioning_group) must separate PROG_MEM_2 into its own controller
  //    and say why — one MORE controller than the clock-domain-only base.
  const forced = await page.evaluate(async (lib) => {
    await (window as any).dft.design.query("dp-shell",
      { script: "set_memory_instance_options PROG_MEM_2 -partitioning_group grpB", file: "" });
    return await (window as any).dft.design.query("mbist-plan", { libDir: lib });
  }, LIB);
  console.log("MBIST-CCR4:", JSON.stringify({
    controllers: forced.controllers.map((c: any) => ({ n: c.name, rule: c.ruleId, why: c.ruleWhy })),
  }));
  expect(forced.controllers.length).toBe(base.controllers.length + 1);
  const forcedCtrl = forced.controllers.find((c: any) =>
    c.memories.some((i: number) => forced.memories[i].path.endsWith("PROG_MEM_2")) &&
    c.memories.length === 1);
  expect(forcedCtrl, "PROG_MEM_2 must land alone in a CCR4-separated controller").toBeTruthy();
  expect(forcedCtrl.ruleId).toBe("CCR4");
  expect(forcedCtrl.ruleWhy).toContain("partitioning_group");
  expect(forced.rules.find((r: any) => r.id === "CCR4").splits).toBeGreaterThan(0);

  await app.close().catch(() => {});
});
