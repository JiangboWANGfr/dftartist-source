// Regression: SdcClocksPanel used to call useMemo() AFTER an early "if (!data) return ..." —
// a React Rules-of-Hooks violation (hook COUNT differs between a "no data" render and a
// "data present" render). It never showed up in tests that only ever mounted the panel once
// `data` was already resolved. It IS reachable in the Clock Tree "Generated files" drawer: open
// the drawer with a valid SDC (data resolves, panel shows the table), then CLEAR the func-SDC
// path — `loadSdcLint("")` sets data back to null WITHOUT ever setting sdcLintBusy (that guard
// is only set on the non-empty path), so the SAME mounted SdcClocksPanel instance sees `data` go
// from a real result straight back to null. This drives exactly that sequence and asserts no
// uncaught error and a correct empty-state render.
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

test("SdcClocksPanel: SDC path cleared while the drawer stays open does not crash (hooks-order)", async () => {
  test.setTimeout(60_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`); });

  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("clocktree"));

  const sdcInput = page.locator('input[placeholder^="func SDC"]');
  await sdcInput.fill(SDC);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.locator(".crstat", { hasText: "group(s)" }).waitFor({ timeout: 15_000 });

  // Open the drawer WITH a resolved SDC — SdcClocksPanel mounts with real, non-null data.
  await page.locator('[data-btn="toggle-generated-files"]').click();
  const drawer = page.locator('[data-drawer="generated-files"]');
  await expect(drawer).toBeVisible();
  const row = (name: string) => drawer.locator("tr").filter({ has: page.getByRole("cell", { name, exact: true }) });
  await row("GEN_EXPLICIT").getByRole("cell", { name: "20", exact: true }).waitFor({ timeout: 10_000 });

  // Clear the SDC path WITHOUT closing the drawer — the SAME mounted panel instance must see
  // data go from real -> null in place, with no crash and no hook-count mismatch.
  await sdcInput.fill("");
  await sdcInput.press("Enter");
  await expect(page.locator("text=pick an SDC file and press Check")).toBeVisible({ timeout: 10_000 });

  // Type it back in — the panel must recover cleanly (proves it isn't just "didn't crash" but
  // actually still functions afterward).
  await sdcInput.fill(SDC);
  await sdcInput.press("Enter");
  await row("GEN_EXPLICIT").getByRole("cell", { name: "20", exact: true }).waitFor({ timeout: 10_000 });

  expect(pageErrors, `uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);

  await app.close();
});
