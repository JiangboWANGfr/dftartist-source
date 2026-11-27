// "早期阶段...floorplan图,显示memory所在的位置,根据CCR/SCR显示mbist plan,虚线框显示mbist
// controller以及虚线显示它与memory之间的关系;现在我的设计中没有def" — no real DEF exists for
// this fixture design, so tests/fixtures/mbist/mock_floorplan.def is a hand-authored stand-in.
// Drives the REAL MbistTab UI (DEF input -> Plan -> Floorplan sub-tab), not the store directly.
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
const DEF = path.join(FIX, "mock_floorplan.def");

test("floorplan draws the die, placed memories, and dashed MBIST controller overlay", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("memory"));
  await page.locator('[data-btn="mbist-plan"]').waitFor({ timeout: 15_000 });
  await page.locator('input.findinput[placeholder*="memory library"]').fill(LIB);
  await page.locator('input.findinput[placeholder="DEF (optional)"]').fill(DEF);
  await page.locator('[data-btn="mbist-plan"]').click();
  // wait for the plan summary line (controller/step/memory counts) to appear
  await page.locator(".crstat").waitFor({ timeout: 60_000 });

  await page.locator('[data-sub="floorplan"]').click();
  await page.locator('[data-view="floorplan"] canvas').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);

  const fp = await page.evaluate(() => (window as any).__floorplanForTest);
  console.log("FLOORPLAN:", JSON.stringify({
    empty: fp?.empty, die: fp?.die,
    memories: fp?.memories?.length, placed: fp?.memories?.filter((m: any) => m.placed).length,
    controllers: fp?.controllers?.map((c: any) => ({ name: c.name, members: c.memberPaths.length })),
    links: fp?.links?.length,
  }));

  expect(fp, "floorplan layout must be published for the test").toBeTruthy();
  expect(fp.empty).toBe(false);
  // must actually be sized to the (resized) container, not stuck at the 1x1 pre-measure fallback
  expect(fp.die.w).toBeGreaterThan(50);
  expect(fp.die.h).toBeGreaterThan(50);
  // all 12 memories in the fixture DEF are placed
  expect(fp.memories.length).toBe(12);
  expect(fp.memories.every((m: any) => m.placed)).toBe(true);
  // every controller must have at least one member and one link per member
  expect(fp.controllers.length).toBeGreaterThan(0);
  for (const c of fp.controllers) expect(c.memberPaths.length).toBeGreaterThan(0);
  const totalMembers = fp.controllers.reduce((n: number, c: any) => n + c.memberPaths.length, 0);
  expect(fp.links.length).toBe(totalMembers);
  // every memory box sits strictly inside (or on) the die rectangle
  for (const m of fp.memories) {
    expect(m.x + m.w / 2).toBeGreaterThanOrEqual(fp.die.x - 1);
    expect(m.x + m.w / 2).toBeLessThanOrEqual(fp.die.x + fp.die.w + 1);
    expect(m.y + m.h / 2).toBeGreaterThanOrEqual(fp.die.y - 1);
    expect(m.y + m.h / 2).toBeLessThanOrEqual(fp.die.y + fp.die.h + 1);
  }

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
