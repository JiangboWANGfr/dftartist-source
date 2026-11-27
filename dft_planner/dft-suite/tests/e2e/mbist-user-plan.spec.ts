// Users must be able to EDIT the MBIST plan — "把某些 memory 单独划到某一个 controller".
// The contract this locks down:
//   1. an assignment puts exactly those memories on the named controller, and leaves the rest
//      to the automatic CCR partition;
//   2. an ILLEGAL grouping (two clock domains on one controller) is still built as asked, but
//      reported as a CCR violation — never silently accepted, never silently refused;
//   3. releasing the assignment hands the memories back to the automatic partition;
//   4. the assignment is written to the plan file, so it survives a restart.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const FIX = path.resolve(process.cwd(), "tests/fixtures/mbist");
const FILELIST = path.join(FIX, "soc_mem.f");
const LIB = path.join(FIX, "lib");

test("the MBIST plan can be edited by hand, and the rules still speak up", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const shell = (script: string) =>
    page.evaluate((s) => (window as any).dft.design.query("dp-shell", { script: s, file: "" }), script);
  const plan = () =>
    page.evaluate((lib) => (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);

  // 1) put ONE memory on a controller of its own
  await shell("add_mbist_controller MY_CTRL MEM_C0");
  let p: any = await plan();
  const my = p.controllers.find((c: any) => c.name === "MY_CTRL");
  console.log("USER-CTRL:", JSON.stringify(p.controllers.map((c: any) =>
    ({ n: c.name, user: c.userDefined, mem: c.memories.length, v: c.violations }))));
  expect(my, "the named controller must exist").toBeTruthy();
  expect(my.userDefined).toBe(true);
  expect(my.violations).toEqual([]);
  expect(my.memories.length).toBe(1);
  expect(p.memories[my.memories[0]].path).toContain("MEM_C0");
  // everything else is still partitioned automatically — one controller per clock domain,
  // and the memory pulled out by hand is NOT re-added to them.
  const auto = p.controllers.filter((c: any) => !c.userDefined);
  expect(auto.length).toBe(3);
  expect(p.memories.every((m: any) => m.controller >= 0)).toBe(true);
  expect(auto.every((c: any) => !c.memories.some((i: number) =>
    p.memories[i].path.endsWith("MEM_C0")))).toBe(true);

  // 2) an ILLEGAL grouping is honoured AND reported
  await shell("remove_mbist_controller");
  await shell("add_mbist_controller BAD_CTRL MEM_A0 MEM_D0");
  p = await plan();
  const bad = p.controllers.find((c: any) => c.name === "BAD_CTRL");
  console.log("BAD-CTRL:", JSON.stringify({ mem: bad.memories.length, v: bad.violations }));
  expect(bad.memories.length, "the request is honoured as asked").toBe(2);
  expect(bad.violations.length, "and the rule breach is named").toBe(1);
  expect(bad.violations[0]).toContain("CCR3");
  expect(bad.violations[0]).toContain("clock domain");
  expect(p.notes.some((n: string) => n.includes("cannot be inserted as-is"))).toBe(true);

  // 3) release -> back to the automatic partition (one controller per clock domain)
  await shell("remove_mbist_controller");
  p = await plan();
  expect(p.controllers.some((c: any) => c.userDefined)).toBe(false);
  expect(p.controllers.length).toBe(3);

  // 4) the assignment is PERSISTED to the plan file (replayed on the next session)
  const outDir = mkdtempSync(path.join(tmpdir(), "mbistplan-"));
  await shell(`set_occ_out_dir {${outDir}}`);
  await shell("add_mbist_controller KEEP_ME MEM_C0");
  const tcl = readFileSync(path.join(outDir, "dfx_dft_plan.tcl"), "utf8");
  console.log("PLAN-FILE:", tcl.split("\n").filter((l) => l.includes("memory")).join(" | "));
  expect(tcl).toContain("set_memory_instance_options MEM_C0 -controller KEEP_ME");

  await app.close().catch(() => {});
});
