import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs"; import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const CORE = path.resolve(process.cwd(), "../dft-core");
const FILELIST = path.join(CORE, "test/rtl/pad/mini_chip.f");
const LIB = path.join(CORE, "test/fixtures/pad/mini.tcelllib");

test("pad tab: table loads, cell edit, generate preview", async () => {
  test.skip(!existsSync(path.join(BIN, "pad")) || !existsSync(FILELIST), "no pad binary/fixture");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });

  // Seed lib path directly (file dialog can't be driven headlessly), then open the tab.
  await page.evaluate((lib) => {
    localStorage.setItem("dft-suite.padLib", lib);
    (window as any).__hierStore.setState({ padLib: lib });
  }, LIB);
  await page.click('[data-tabmenu="btn"]');
  await page.click('[data-tabmenu-item="pad"]');

  await expect(page.locator(".pad-table")).toBeVisible({ timeout: 10000 });
  const rows = page.locator(".pad-table tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(5);

  // Click the reuse cell of the u_gpio0 row (inout) -> cycles to "in"
  const g0 = page.locator('.pad-table tbody tr', { hasText: "mini_chip.u_gpio0" });
  await g0.locator("td").nth(5).click(); // reuse column
  await expect(g0.locator("td").nth(5)).toHaveText("in");

  // Generate -> panel shows section A with GPIO_0 as internal aux input (level chip default)
  await page.click(".pad-panel-bar button:has-text('Generate')");
  // 预览拆双栏(GenPreview):默认选中 auxiliary.spec(read_config_data 段)
  await expect(page.locator(".gp-code")).toContainText("read_config_data", { timeout: 10000 });
  await expect(page.locator(".gp-code")).toContainText("internal_auxiliary_input_ports : GPIO_0;");
  // 切到 bscan_options.tcl 段看 set_boundary_scan_port_options
  await page.locator(".gp-file", { hasText: "bscan_options.tcl" }).click();
  await expect(page.locator(".gp-code")).toContainText("set_boundary_scan_port_options");

  await app.close();
});
