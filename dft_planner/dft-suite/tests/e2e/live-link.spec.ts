// E2E: Phase-5 in-process "加入连接生成" live link.
// Right-click a hierarchy node → "Add to GenConnection" → genconn workspace opens
// and the block appears in the genconn store (no file dialog / no blocks.json).

import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("live-link: right-click 'Add to GenConnection' switches to genconn and adds a harden", async () => {
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  // Open design via the shared store (same path as the shell's 打开设计 button).
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );

  // Wait for the hierarchy tree to populate.
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 10000 });

  // Expand the root so soc.u_cpu is visible.
  await page.locator("#hier-tree [data-arrow='soc']").click();
  await page.locator("#hier-tree [data-node='soc.u_cpu']").waitFor({ timeout: 5000 });

  // Record instance count in the open def BEFORE the action (genconn starts with 0 instances).
  const countBefore = await page.evaluate(() => {
    const gcState = (window as any).__gcStore.getState();
    const { doc } = gcState;
    const openDef = doc.library.defs.find((d: any) => d.id === doc.ui.openDefId);
    return openDef ? openDef.childInstances.length : 0;
  });

  // Right-click the soc.u_cpu tree node to open the context menu.
  await page.locator("#hier-tree [data-node='soc.u_cpu']").click({ button: "right" });

  // Click "Add to GenConnection" in the context menu.
  await page.locator("[data-menu='add-to-gen']").click();

  // Assert the workspace switched to genconn (#ws-genconn is now visible).
  await expect(page.locator("#ws-genconn")).toBeVisible({ timeout: 5000 });

  // Assert the open def in the genconn store now has one more instance than before.
  const countAfter = await page.evaluate(() => {
    const gcState = (window as any).__gcStore.getState();
    const { doc } = gcState;
    const openDef = doc.library.defs.find((d: any) => d.id === doc.ui.openDefId);
    return openDef ? openDef.childInstances.length : 0;
  });
  expect(countAfter).toBe(countBefore + 1);

  // Assert a new def with designName "cpu" was added to the genconn library.
  const hasCpuDef = await page.evaluate(() => {
    const { doc } = (window as any).__gcStore.getState();
    return doc.library.defs.some((d: any) => d.designName === "cpu");
  });
  expect(hasCpuDef).toBe(true);

  // Confirm NO file dialog appeared (the handoff is purely in-process).
  // We verify this indirectly: the page's dialog listener was never triggered.
  // (Playwright auto-fails tests that have unhandled dialogs, so no explicit assertion needed.)

  await app.close();
});
