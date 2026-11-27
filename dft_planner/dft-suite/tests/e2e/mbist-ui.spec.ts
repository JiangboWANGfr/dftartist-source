// The MBIST Planner has to stay workable with MANY memories, so this drives the actual UI:
// collapse/expand the tree, filter the memory table, select everything the filter matched, and
// move that selection onto a new controller in one action. Store-only tests would not catch a
// tree that cannot fold or a bulk action that silently moves the wrong rows.
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

test("the planner UI scales: collapse, filter, select-all, bulk move", async () => {
  test.setTimeout(150_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // Open the MBIST Planner and plan with the fixture library.
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("memory"));
  await page.locator("#mbisttab").waitFor({ timeout: 15_000 });
  await page.locator('#mbisttab input[placeholder*="memory library"]').fill(LIB);
  await page.locator('[data-btn="mbist-plan"]').click();
  await page.locator('#mbisttab [data-tree="mbist"] [data-ctrl]').first().waitFor({ timeout: 30_000 });

  // 12 memories over 3 controllers — the tree shows every one of them expanded.
  const memNodes = page.locator('#mbisttab [data-tree="mbist"] [data-mem]');
  await expect(memNodes).toHaveCount(12);
  await expect(page.locator('#mbisttab [data-tree="mbist"] [data-ctrl]')).toHaveCount(3);

  // COLLAPSE ALL -> controllers remain, memories are folded away; EXPAND ALL brings them back.
  await page.locator('[data-btn="tree-collapse"]').click();
  await expect(memNodes).toHaveCount(0);
  await expect(page.locator('#mbisttab [data-tree="mbist"] [data-ctrl]')).toHaveCount(3);
  await page.locator('[data-btn="tree-expand"]').click();
  await expect(memNodes).toHaveCount(12);

  // FILTER + SELECT ALL SHOWN: pick just the 4K memories, then move them in one action.
  await page.locator('[data-input="mem-filter"]').fill("MEM_C");
  // scope to the Memory Summary table — the Step Summary lists member names too
  const rows = page.locator('[data-section="memories"] tbody tr');
  await expect(rows).toHaveCount(2);
  await page.locator('[data-btn="select-all"]').click();
  await expect(page.locator("#mbisttab").getByText(/2 selected of 2 shown/)).toBeVisible();

  await page.locator('[data-btn="mbist-new-ctrl"]').click();
  await page.locator('[data-input="new-ctrl-name"]').fill("SMALL_CTRL");
  await page.locator('[data-btn="new-ctrl-ok"]').click();
  await expect(page.locator('#mbisttab [data-ctrl="SMALL_CTRL"]')).toBeVisible({ timeout: 20_000 });

  // The move must be exactly the two filtered memories — verified against the daemon's plan,
  // not against the DOM that produced the click.
  const after = await page.evaluate((lib) =>
    (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);
  const small = after.controllers.find((c: any) => c.name === "SMALL_CTRL");
  const names = small.memories.map((i: number) => after.memories[i].path.split(".").pop()).sort();
  console.log("UI-MOVE:", JSON.stringify({ names, user: small.userDefined,
    controllers: after.controllers.map((c: any) => `${c.name}(${c.memories.length})`) }));
  expect(names).toEqual(["MEM_C0", "MEM_C1"]);
  expect(small.userDefined).toBe(true);
  expect(small.violations).toEqual([]);

  // GROUP BY CLOCK: one controller per clock domain, in one click.
  await page.locator('[data-btn="regroup-clock"]').click();
  await page.waitForTimeout(1500);
  const grouped = await page.evaluate((lib) =>
    (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);
  const domains = new Set(grouped.memories.map((m: any) => m.clockDomain));
  console.log("BY-CLOCK:", JSON.stringify(grouped.controllers.map((c: any) =>
    `${c.name}:${c.clockDomain}(${c.memories.length})`)));
  expect(grouped.controllers.length).toBe(domains.size);
  for (const ctrl of grouped.controllers) {
    // Names come from the DESIGN and are identifier-safe — regrouping must not stack the
    // previous controller's name, and a clock root like "u_div2/d" must not leak a slash.
    expect(ctrl.name).toMatch(/^soc_mem_mbist_[A-Za-z0-9_]+$/);
    expect(ctrl.name).not.toContain("SMALL_CTRL");
    expect(ctrl.userDefined).toBe(true);
    const clocks = new Set(ctrl.memories.map((i: number) => grouped.memories[i].clockDomain));
    expect(clocks.size, "a per-clock controller must hold one clock domain").toBe(1);
  }

  // RESET returns everything to the automatic partition.
  await page.locator('[data-btn="release-all"]').click();
  await page.waitForTimeout(1500);
  const reset = await page.evaluate((lib) =>
    (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);
  expect(reset.controllers.some((c: any) => c.userDefined)).toBe(false);

  await app.close().catch(() => {});
});
