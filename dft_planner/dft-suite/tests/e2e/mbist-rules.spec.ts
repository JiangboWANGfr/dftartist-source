// The partition must be driven by the compatibility RULES (CCR = controller, SCR = step) and
// every split must name the rule that caused it. The fixture (12 memories, 2 cells, 3 clock
// domains) exercises all of it from RTL + memory library alone (no DEF, no UPF, no SDC):
//   MEM_A0..A5  identical 8K cells on core_clk -> one controller; steps split only by budget
//   MEM_C0..C1  4K deep instead of 8K          -> same controller, a SEPARATE step (SCR5)
//   MEM_D*/E*   on the two divided clocks      -> a SEPARATE controller each (CCR3)
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const FIX = path.resolve(process.cwd(), "tests/fixtures/mbist");
const FILELIST = path.join(FIX, "soc_mem.f");
const LIB = path.join(FIX, "lib");

test("CCR/SCR drive the partition and every split names its rule", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const plan = await page.evaluate(async (lib) =>
    await (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);
  const byName = (p: string) => plan.memories.find((m: any) => m.path.endsWith("." + p));
  console.log("RULES:", JSON.stringify({
    controllers: plan.controllers.map((c: any) => ({ n: c.name, clk: c.clockDomain,
      mem: c.memories.length, rule: c.ruleId, why: c.ruleWhy })),
    steps: plan.steps.map((s: any) => ({ c: s.controller, i: s.index, n: s.members.length,
      rule: s.ruleId, why: s.ruleWhy })),
    mem: plan.memories.map((m: any) => ({ p: m.path, clk: m.clockDomain, w: m.words,
      ctrl: m.controller, step: m.step })),
  }));

  expect(plan.errors).toEqual([]);
  expect(plan.memories.length).toBe(12);

  const a0 = byName("MEM_A0"), a1 = byName("MEM_A1"), c0 = byName("MEM_C0");
  const d0 = byName("MEM_D0"), e0 = byName("MEM_E0");

  // CCR3 — each divided clock is its OWN root. Two `clkdiv` instances both call their internal
  // register `d`, so an unqualified root name would merge two domains onto one controller.
  expect(a0.clockDomain).toBe(a1.clockDomain);
  expect(d0.clockDomain).not.toBe(a0.clockDomain);
  expect(e0.clockDomain).not.toBe(d0.clockDomain);
  expect(plan.controllers.length).toBe(3);
  expect(plan.controllers[d0.controller].ruleId).toBe("CCR3");
  expect(plan.controllers[d0.controller].ruleWhy).toContain("clock domain");
  expect(plan.controllers[e0.controller].ruleId).toBe("CCR3");

  // SCR5 — same controller, but the 4K memories get their own step.
  expect(c0.controller).toBe(a0.controller);
  expect(c0.step).not.toBe(a0.step);
  const stepC = plan.steps.find((s: any) => s.controller === c0.controller && s.index === c0.step);
  expect(stepC.ruleId).toBe("SCR5");
  expect(stepC.ruleWhy).toContain("4096");

  // Parallel step: power adds, runtime is the slowest member's.
  const stepA = plan.steps.find((s: any) => s.controller === a0.controller && s.index === a0.step);
  expect(stepA.members.length).toBeGreaterThan(1);
  expect(stepA.powerMw).toBeCloseTo(
    stepA.members.reduce((t: number, i: number) => t + plan.memories[i].powerMw, 0), 6);
  expect(stepA.cycles).toBe(Math.max(...stepA.members.map((i: number) => plan.memories[i].cycles)));

  // SCR10 — the default 500 mW budget must cap the parallel step (6 x 120 mW would be 720).
  expect(stepA.powerMw).toBeLessThanOrEqual(500);
  const rule = (id: string) => plan.rules.find((r: any) => r.id === id);
  expect(rule("SCR10").splits).toBeGreaterThan(0);

  // Controller rollup: steps are SEQUENTIAL (cycles add), power is the peak.
  const ctrlA = plan.controllers[a0.controller];
  const stepsA = plan.steps.filter((s: any) => s.controller === a0.controller);
  expect(ctrlA.cycles).toBe(stepsA.reduce((t: number, s: any) => t + s.cycles, 0));
  expect(ctrlA.powerMw).toBeCloseTo(Math.max(...stepsA.map((s: any) => s.powerMw)), 6);

  // The ledger attributes the splits it caused, and nothing else moved.
  expect(rule("CCR3").splits).toBe(2);
  expect(rule("SCR5").splits).toBe(1);
  for (const r of plan.rules)
    if (!["CCR3", "SCR5", "SCR10"].includes(r.id))
      expect(r.splits, `${r.id} split unexpectedly`).toBe(0);

  await app.close().catch(() => {});
});
