// "这个界面关于chain的配置还是有点不是很方便" — the Scan Planner's chain-family assignment had
// no undo (a wrong bulk-assign meant manual per-row re-assignment), the keyboard shortcut mapping
// wasn't visible without scrolling back to the sidebar, and cross-cutting selections needed one
// checkbox click per row. This drives the real page on the real design: undo/redo a family
// rename and a row assignment, shift-range-select, ctrl-toggle-select, and the right-click
// "assign to / select all children" menu.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";

test("Scan Planner: undo/redo, shift/ctrl multi-select, and the right-click assign menu", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("scanplan"));
  const rows = page.locator(".sp-tree tbody tr");
  await rows.first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  // ---- color dot on the sticky hint line and on every Family-cell tag ------------------------
  await expect(page.locator(".sp-hint .sp-dot")).toBeVisible();
  await expect(page.locator(".sp-tree .sp-tag .sp-dot").first()).toBeVisible();

  // ---- undo/redo: a family rename is ONE undo step, not one per keystroke ---------------------
  const famRow = page.locator(".sp-famrow").first();
  await famRow.click();
  const nameInput = page.locator(".sp-name");
  const before = await nameInput.inputValue();
  await nameInput.fill("");
  await nameInput.type("RENAMED_FAMILY", { delay: 20 });
  await expect(nameInput).toHaveValue("RENAMED_FAMILY");
  await nameInput.blur();

  await page.locator('[data-btn="undo"]').click();
  await expect(nameInput).toHaveValue(before);
  await page.locator('[data-btn="redo"]').click();
  await expect(nameInput).toHaveValue("RENAMED_FAMILY");
  // Back to the original name so the rest of the test (and any later run) starts clean.
  await page.locator('[data-btn="undo"]').click();
  await expect(nameInput).toHaveValue(before);

  // ---- undo/redo also covers a row assignment (a discrete click, not a burst) -----------------
  const familyCell = (r: ReturnType<typeof rows.nth>) => r.locator("td.sp-cell");
  const firstLeaf = rows.filter({ has: page.locator("td:nth-child(2) .sp-caret.leaf") }).first();
  await expect(firstLeaf).toBeVisible();
  const cellBefore = await familyCell(firstLeaf).innerText();
  await firstLeaf.locator("td:nth-child(2)").click();
  await page.waitForTimeout(200);
  const cellAfter = await familyCell(firstLeaf).innerText();
  expect(cellAfter).not.toBe(cellBefore);
  await page.locator('[data-btn="undo"]').click();
  await page.waitForTimeout(200);
  await expect(familyCell(firstLeaf)).toHaveText(cellBefore);

  // ---- shift-range-select then ctrl-toggle, then assign via digit key -------------------------
  const leaves = rows.filter({ has: page.locator("td:nth-child(2) .sp-caret.leaf") });
  const leafCount = await leaves.count();
  expect(leafCount).toBeGreaterThan(3);
  const checkbox = (i: number) => leaves.nth(i).locator("td").first().locator("input[type=checkbox]");
  await checkbox(0).click();                                    // anchor
  await leaves.nth(2).locator("td:nth-child(2)").click({ modifiers: ["Shift"] });   // range 0..2
  await expect(checkbox(0)).toBeChecked();
  await expect(checkbox(1)).toBeChecked();
  await expect(checkbox(2)).toBeChecked();
  await leaves.nth(3).locator("td:nth-child(2)").click({ modifiers: ["Control"] }); // add row 3
  await expect(checkbox(3)).toBeChecked();
  // ctrl-click the SAME row again removes it, without touching the rest of the selection
  await leaves.nth(3).locator("td:nth-child(2)").click({ modifiers: ["Control"] });
  await expect(checkbox(3)).not.toBeChecked();
  await expect(checkbox(0)).toBeChecked();

  // ---- right-click a subtree root: same assignable list as the Family-cell dropdown, plus
  // "select all children" ------------------------------------------------------------------
  const parentRow = rows.filter({ has: page.locator("td:nth-child(2) .sp-caret:not(.leaf)") }).first();
  await expect(parentRow).toBeVisible();
  await parentRow.click({ button: "right" });
  const ctxMenu = page.locator(".sp-cellmenu.ctx");
  await expect(ctxMenu).toBeVisible();
  await expect(ctxMenu.locator(".sp-cmi", { hasText: "assign to" }).first()).toBeVisible();
  await expect(ctxMenu.locator(".sp-cmi", { hasText: "select all children" })).toBeVisible();
  // Escape closes it without acting
  await page.keyboard.press("Escape");
  await expect(ctxMenu).toBeHidden();

  await app.close().catch(() => {});
});
