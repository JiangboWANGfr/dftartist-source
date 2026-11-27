// The Scan Planner opened on ONE collapsed row: to reach any block you clicked ▶ blindly, level
// after level, with nothing telling you where the flops were ("操作起来不是很方便"). This drives
// the real page on the real design: the first screen must show the design's fan-out, biggest
// blocks first, and the sort toggle must actually re-order the rows.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";

test("the scan planner opens on the design, biggest blocks first", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("scanplan"));
  const rows = page.locator(".sp-tree tbody tr");
  await rows.first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);   // register counts + auto-expand

  const read = async () => page.locator(".sp-tree tbody tr").evaluateAll((trs) =>
    trs.map((tr) => ({
      name: (tr.querySelector("td:nth-child(2)")?.textContent ?? "").trim(),
      bits: Number((tr.querySelector("td:nth-child(3)")?.textContent ?? "0").replace(/[^\d]/g, "")),
    })));
  const first = await read();
  console.log("ROWS:", first.length, JSON.stringify(first.slice(0, 8)));

  // 1. the design is ON SCREEN, not one collapsed row
  expect(first.length, "the tree must open on more than the core row").toBeGreaterThan(3);

  // 2. siblings are biggest-first: the first child row carries more bits than the last one
  const kids = first.slice(1).filter((r) => r.bits > 0);
  expect(kids.length).toBeGreaterThan(1);
  const maxBits = Math.max(...kids.map((k) => k.bits));
  expect(kids[0].bits, "the biggest block should be near the top").toBe(maxBits);

  // 3. the sort toggle really re-orders (bits ↓ -> name)
  await page.locator('[data-btn="sp-sort"]').click();
  await page.waitForTimeout(600);
  const byName = await read();
  console.log("BY NAME:", JSON.stringify(byName.slice(0, 6).map((r) => r.name)));
  expect(byName.map((r) => r.name).join("|")).not.toBe(first.map((r) => r.name).join("|"));

  // 4. Collapse still works and leaves the core row alone
  await page.locator(".sp-colhead button", { hasText: "Collapse" }).click();
  await page.waitForTimeout(500);
  const collapsed = await read();
  expect(collapsed.length).toBe(1);

  await app.close().catch(() => {});
});
