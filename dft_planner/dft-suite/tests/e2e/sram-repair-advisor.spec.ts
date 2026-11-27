// "我希望mbist planner 中的repair，100%复刻sram_repair_advisor" — the MBIST Planner's Repair
// sub-tab is now a port of the standalone SRAM Repair Advisor (src/ui/SramRepairAdvisor.cpp):
// three switchable tabs (Redundancy Guideline / SRAM Yield Model / Help Documentation). All
// panels stay MOUNTED (CSS display:none when inactive, not conditionally rendered) — matching
// the Qt QTabWidget/QStackedWidget, whose pages are constructed once and never destroyed on
// switch — so locators must be scoped to `[data-panel="..."]`, since an unscoped text query can
// match the same label in more than one always-mounted panel (e.g. both Binomial and Foundry
// render their own "FusesPerSession:" line). Drives the real UI end to end, including the
// Foundry Model's "Load current MBIST plan" integration bridge (not in the original tool — an
// additive convenience), against the real 202-memory stress-test design.
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

test("SRAM Repair Advisor: all 3 tabs work through a real MBIST plan", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL) || !existsSync(LIB), "real design/library not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("memory"));

  // A real MBIST plan first, so the Foundry "Load current MBIST plan" bridge has data.
  await page.locator('[data-btn="mbist-plan"]').waitFor({ timeout: 15_000 });
  await page.locator('input.findinput[placeholder*="memory library"]').fill(LIB);
  await page.locator('[data-btn="mbist-plan"]').click();
  await page.locator(".crstat").waitFor({ timeout: 60_000 });

  await page.locator('[data-sub="repair"]').click();
  await page.locator('[data-sub="sra-guideline"]').waitFor({ timeout: 10_000 });
  const guideline = page.locator('[data-panel="sra-guideline"]');
  await guideline.locator("text=Every size band's redundancy mix totals 100%").waitFor({ timeout: 5_000 });

  // Redundancy Guideline: edit a cell, confirm it renders the new value.
  const cell = guideline.locator("table td").first();
  await cell.dblclick();
  await guideline.locator("table td input").first().fill("7");
  await page.keyboard.press("Enter");
  await expect(cell).toHaveText("7%");

  // SRAM Yield Model — Binomial (default): button-gated yield curve + strategy + fuse calc,
  // matching BinomialModelWindow's explicit Calculate Yield / Calculate Fuses buttons.
  await page.locator('[data-sub="sra-yield"]').click();
  const binomial = page.locator('[data-panel="binomial"]');
  await page.locator('[data-btn="ym-binomial"]').waitFor({ timeout: 5_000 });
  await binomial.locator("text=Press Calculate Yield to run the model.").waitFor({ timeout: 5_000 });
  await binomial.locator("button", { hasText: "Calculate Yield" }).click();
  await binomial.locator("text=Repairs needed:").waitFor({ timeout: 5_000 });
  await binomial.locator("button", { hasText: "Calculate Fuses" }).click();
  await binomial.locator("text=SingleBitsNumberOfFuses:").waitFor({ timeout: 5_000 });

  // Foundry Model: the MBIST-plan bridge, Calculate, Apply -> spare-scheme table + distribution.
  await page.locator('[data-btn="ym-foundry"]').click();
  const foundry = page.locator('[data-panel="foundry"]');
  await foundry.locator("text=Load current MBIST plan").click();
  await page.waitForTimeout(300);
  const rowCount = await foundry.locator("table").first().locator("tbody tr").count();
  expect(rowCount).toBe(202);
  await foundry.getByRole("button", { name: "Calculate", exact: true }).click();
  await foundry.locator("text=Repairs needed:").waitFor({ timeout: 5_000 });
  await foundry.locator("button", { hasText: "Apply" }).click();
  await foundry.locator("text=Memory repair scheme distribution").waitFor({ timeout: 5_000 });
  await foundry.locator("button", { hasText: "Calculate Fuses" }).click();
  await foundry.locator("text=SingleBitsNumberOfFuses:").waitFor({ timeout: 5_000 });
  const spareRows = await foundry.locator("table").nth(1).locator("tbody tr").count();
  expect(spareRows).toBe(202);

  // Help Documentation tab renders.
  await page.locator('[data-sub="sra-help"]').click();
  await page.locator('[data-panel="sra-help"]').locator("text=SRAM Repair Advisor Help").waitFor({ timeout: 5_000 });

  // Switching back to Guideline preserves the earlier edit (component stayed mounted).
  await page.locator('[data-sub="sra-guideline"]').click();
  await expect(cell).toHaveText("7%");

  expect(errs.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  expect(errs).toEqual([]);
  await app.close().catch(() => {});
});
