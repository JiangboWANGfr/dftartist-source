// "我希望红色圈圈里面的step controller mem 都可以选中，复制、粘贴（paste above，paste below）、
// 删除、rename" — Controller/Step/Memory tree nodes must be selectable, with copy/paste/delete/
// rename per node kind. A Step has no persisted identity (recomputed by the packer on every plan
// run) and a Memory's name is its design instance name, so only a Controller can be renamed —
// this drives the real UI against a real design and locks down the kind-aware behavior.
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

test("Controller Matrix tree: select, copy/paste, delete, rename — kind-aware", async () => {
  test.setTimeout(150_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const shell = (script: string) =>
    page.evaluate((s) => (window as any).dft.design.query("dp-shell", { script: s, file: "" }), script);
  const plan = () =>
    page.evaluate((lib) => (window as any).dft.design.query("mbist-plan", { libDir: lib }), LIB);

  // Two user controllers (for the multi-select delete) and one more with two memories in a
  // single step (for the copy-a-step / paste-onto-a-different-controller case).
  await shell("add_mbist_controller U1 MEM_A0");
  await shell("add_mbist_controller U2 MEM_A1");
  await shell("add_mbist_controller STEPSRC MEM_C0 MEM_C1 -step 0");
  await shell("add_mbist_controller STEPDST MEM_D0");

  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("memory"));
  await page.locator("#mbisttab").waitFor({ timeout: 15_000 });
  await page.locator('#mbisttab input[placeholder*="memory library"]').fill(LIB);
  await page.locator('[data-btn="mbist-plan"]').click();
  await page.locator('#mbisttab [data-tree="mbist"] [data-ctrl]').first().waitFor({ timeout: 30_000 });
  await expect(page.locator('#mbisttab [data-ctrl="U1"]')).toBeVisible();
  await expect(page.locator('#mbisttab [data-ctrl="U2"]')).toBeVisible();
  await expect(page.locator('#mbisttab [data-ctrl="STEPSRC"]')).toBeVisible();
  await expect(page.locator('#mbisttab [data-ctrl="STEPDST"]')).toBeVisible();

  const row = (ctrl: string) => page.locator(`#mbisttab [data-ctrl="${ctrl}"] [data-row="ctrl"]`);
  const stepRow = (ctrl: string) => page.locator(`#mbisttab [data-ctrl="${ctrl}"] [data-row="step"]`);

  // ---- right-click on a Step: Rename is disabled, with an explanatory tooltip ----
  await stepRow("STEPSRC").click({ button: "right" });
  const stepMenu = page.locator('[data-ctxmenu="step"]');
  await expect(stepMenu).toBeVisible();
  const stepRenameItem = stepMenu.getByText("Rename", { exact: true });
  await expect(stepRenameItem).toHaveAttribute("aria-disabled", "true");
  await expect(stepRenameItem).toHaveAttribute("title", /steps are computed automatically/);
  await page.keyboard.press("Escape");
  await expect(stepMenu).toBeHidden();

  // ---- right-click on a Memory row: Rename is disabled too, different reason ----
  const memRow = page.locator('#mbisttab [data-tree="mbist"] [data-mem="MEM_A0"]');
  await memRow.click({ button: "right" });
  const memMenu = page.locator('[data-ctxmenu="memory"]');
  await expect(memMenu).toBeVisible();
  const memRenameItem = memMenu.getByText("Rename", { exact: true });
  await expect(memRenameItem).toHaveAttribute("aria-disabled", "true");
  await expect(memRenameItem).toHaveAttribute("title", /design instance name/);
  await page.keyboard.press("Escape");

  // ---- copy a Step's memory set, paste onto a DIFFERENT controller ----
  await stepRow("STEPSRC").click();
  await page.keyboard.press("Control+c");
  await row("STEPDST").click();
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(1000);
  const afterPaste = await plan();
  const stepdst = afterPaste.controllers.find((c: any) => c.name === "STEPDST");
  const stepdstNames = stepdst.memories
    .map((i: number) => afterPaste.memories[i].path.split(".").pop()).sort();
  console.log("PASTE-ONTO-CTRL:", JSON.stringify(stepdstNames));
  expect(stepdstNames).toEqual(["MEM_C0", "MEM_C1", "MEM_D0"]);

  // ---- ctrl-click to multi-select 2 controllers, Delete releases both ----
  page.once("dialog", (d) => d.accept());
  await row("U1").click();
  await row("U2").click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1000);
  const afterDelete = await plan();
  expect(afterDelete.controllers.some((c: any) => c.name === "U1")).toBe(false);
  expect(afterDelete.controllers.some((c: any) => c.name === "U2")).toBe(false);

  // ---- rename a Controller via F2, and confirm it survives a fresh plan re-run ----
  await row("STEPDST").click();
  await page.keyboard.press("F2");
  const renameInput = page.locator('#mbisttab [data-input="ctrl-rename"]');
  await expect(renameInput).toBeVisible();
  await renameInput.fill("RENAMED_CTRL");
  await renameInput.press("Enter");
  await expect(page.locator('#mbisttab [data-ctrl="RENAMED_CTRL"]')).toBeVisible({ timeout: 20_000 });
  const rerun = await plan();
  const renamed = rerun.controllers.find((c: any) => c.name === "RENAMED_CTRL");
  expect(renamed, "the rename must be a real backend round-trip, not just a DOM relabel").toBeTruthy();
  const renamedNames = renamed.memories
    .map((i: number) => rerun.memories[i].path.split(".").pop()).sort();
  expect(renamedNames).toEqual(["MEM_C0", "MEM_C1", "MEM_D0"]);

  await app.close().catch(() => {});
});
