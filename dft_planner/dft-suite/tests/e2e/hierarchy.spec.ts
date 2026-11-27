import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { assertNoOverlap, assertNoOverflow } from "../helpers/layout.ts";
import { existsSync } from "node:fs"; import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("hierarchy: auto-opens top instance's ports tab on design open (no manual click)", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );

  // Wait for the tree to populate (signals that loadFromReady ran)
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });

  // WITHOUT any manual click, the top's ports tab must be open in the center.
  await expect(page.locator('#hier-center [data-tab-kind="ports"]')).toBeVisible({ timeout: 5000 });

  await app.close();
});

test("hierarchy: tree-only left, ports open in center, no 穿模", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  // Drive the SHARED store's openDesign (the same path as the shell's 打开设计 button):
  // it calls window.dft.design.open ONCE (one daemon) and fills useDesign.ready, which the
  // hierarchy reconciles via loadFromReady. No second daemon is spawned.
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );

  // tree populates from the SHARED daemon (reconciliation: loadFromReady, no 2nd open):
  await page.locator('#hier-tree [data-node]').first().waitFor();

  // expand the root (arrow), then select a child instance (row):
  await page.locator('#hier-tree [data-arrow="soc"]').click();          // expand soc
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click();     // select child

  // ports tab appears in the CENTER:
  await expect(page.locator('#hier-center [data-tab-kind="ports"]')).toBeVisible();

  await assertNoOverlap(page, ["#hier-tree", "#hier-center"]);
  await assertNoOverflow(page, "#hier-center");

  await expect(page).toHaveScreenshot("hierarchy-dark.png");
  await page.click("#theme-toggle");
  await expect(page).toHaveScreenshot("hierarchy-light.png");

  await app.close();
});

test("hierarchy: single follow-selection ports tab (selecting two instances yields one tab)", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor();

  await page.locator('#hier-tree [data-arrow="soc"]').click();
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click();
  await expect(page.locator('#hier-center [data-tab-kind="ports"]')).toBeVisible();

  // Select a DIFFERENT instance — should update the singleton tab, not add a second one.
  await page.locator('#hier-tree [data-node="soc.u_mem"]').click();
  const portsTabs = page.locator('#hier-center [data-tab-kind="ports"]');
  await expect(portsTabs).toHaveCount(1);

  await app.close();
});

test("hierarchy: tabs preserved after switching workspace and back", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor();

  await page.locator('#hier-tree [data-arrow="soc"]').click();
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click();
  await expect(page.locator('#hier-center [data-tab-kind="ports"]')).toBeVisible();

  // Switch to 连接生成, then back to 层次浏览.
  await page.click('[data-tab="genconn"]');
  await page.click('[data-tab="hierarchy"]');

  // The ports tab must still be visible after remount.
  await expect(page.locator('#hier-center [data-tab-kind="ports"]')).toBeVisible();
  // The tree must still show the expanded node.
  await expect(page.locator('#hier-tree [data-node="soc.u_cpu"]')).toBeVisible();

  await app.close();
});

test("hierarchy: +▾ 下拉打开功能页（寄存器统计）", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });
  await page.locator('[data-tabmenu="btn"]').click();
  await page.locator('[data-tabmenu-item="regcount"]').click();
  await expect(page.locator('#hier-center [data-tab-kind="regcount"]')).toBeVisible({ timeout: 5000 });
  await app.close();
});

test("hierarchy: dock-head 不再有功能按钮(已迁到 +▾)", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });
  await expect(page.locator('.dock-head [data-btn="regcount"]')).toHaveCount(0);
  await expect(page.locator('.dock-head [data-btn="pad"]')).toHaveCount(0);
  await app.close();
});

test("hierarchy: DFX Ctrl 面板用共享 Inspector 外壳渲染", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator('#hier-tree [data-node]').first().waitFor({ timeout: 10000 });
  await page.locator('[data-tabmenu="btn"]').click();
  await page.locator('[data-tabmenu-item="dfxctrl"]').click();
  await expect(page.locator('[data-tab-kind="dfxctrl"]')).toBeVisible({ timeout: 5000 });
  await app.close();
});
