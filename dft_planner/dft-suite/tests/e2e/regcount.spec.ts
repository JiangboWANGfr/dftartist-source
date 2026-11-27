import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs"; import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("register count report opens and rows select tree instances", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );

  // Wait for the tree to populate (signals that loadFromReady ran)
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });

  await page.click('[data-tabmenu="btn"]');
  await page.click('[data-tabmenu-item="regcount"]');

  await expect(page.locator(".rc-table")).toBeVisible();
  await expect(page.locator(".rc-table tbody tr").first()).toBeVisible();

  const total = await page.locator(".rc-total").innerText();
  expect(Number(total.replace(/\D/g, ""))).toBeGreaterThan(0);

  const inst = await page.locator(".rc-table tbody tr").first().locator("td").first().innerText();
  await page.locator(".rc-table tbody tr").first().click();
  await expect(page.locator(`.trow.sel[data-node="${inst}"]`)).toBeVisible();

  await app.close();
});
