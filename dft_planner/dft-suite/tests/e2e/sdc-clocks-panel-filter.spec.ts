// "左边全部都堆叠到一起了，我希望可以tab切换，可以ctrl+f查找" — Generated Files' add_clock /
// tessent_clock_mapping / YAML are now sub-tabs (not one long stack), and Ctrl+F focuses the
// panel's own filter box (there is nothing a browser-level find could usefully reach here — the
// clock/OCC tables aren't the SDC file's literal text) instead of the browser's native find.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))
  ?? path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc_clockgen.f");
const SDC = path.resolve(process.cwd(), "tests/fixtures/soc_clockgen.sdc");

test("Clock Tree drawer: Generated Files sub-tabs + Ctrl+F filter", async () => {
  test.setTimeout(60_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("clocktree"));

  await page.locator('input[placeholder^="func SDC"]').fill(SDC);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.locator(".crstat", { hasText: "group(s)" }).waitFor({ timeout: 15_000 });

  await page.locator('[data-btn="toggle-generated-files"]').click();
  const drawer = page.locator('[data-drawer="generated-files"]');
  await expect(drawer).toBeVisible();

  // ---- Ctrl+F focuses the panel's own filter box, not the browser's native find -------------
  const filterInput = drawer.locator('input[placeholder="filter (Ctrl+F)"]');
  await page.locator("body").click();   // land focus somewhere else first
  await page.keyboard.press("Control+f");
  await expect(filterInput).toBeFocused();

  // ---- filtering the Clocks table -------------------------------------------------------------
  await filterInput.fill("GEN_MULT");
  const row = (name: string) => drawer.locator("tr").filter({ has: page.getByRole("cell", { name, exact: true }) });
  await row("GEN_MULT").waitFor({ timeout: 5_000 });
  await expect(row("GEN_EXPLICIT")).toHaveCount(0);

  // ---- Generated Files: add_clock / tessent_clock_mapping / YAML are separate sub-tabs, and the
  // ---- SAME filter narrows whichever one is active.
  await drawer.getByRole("button", { name: "Generated Files" }).click();
  await drawer.locator("text=-label GEN_MULT").first().waitFor({ timeout: 5_000 });
  await expect(drawer.locator("text=GEN_EXPLICIT")).toHaveCount(0);

  await drawer.getByRole("button", { name: "tessent_clock_mapping" }).click();
  await drawer.locator("text=set tessent_clock_mapping(GEN_MULT) GEN_MULT").first().waitFor({ timeout: 5_000 });

  // Clear the filter (Escape) and confirm everything comes back.
  await filterInput.press("Escape");
  await expect(filterInput).toHaveValue("");
  await drawer.locator("text=set tessent_clock_mapping(CLK) CLK").first().waitFor({ timeout: 5_000 });

  await app.close();
});
