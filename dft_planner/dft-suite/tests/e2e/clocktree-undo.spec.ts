// Clock tree undo/redo + double-click expand: real gestures end to end. Guards the
// "double-click to close → 闪屏/黑屏" class of bugs by asserting the graph settles after
// toggling, and the history round-trips exactly.

import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))
  ?? path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");
const SDC = path.resolve(process.cwd(), "tests/fixtures/soc.sdc");

const nodeCount = "Object.keys((window).__hierStore.getState().schematics['crsch:clock']?.nodes ?? {}).length";

test("clock tree: double-click expands, Ctrl+Z undoes, Ctrl+Y redoes", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  writeFileSync(SDC, "create_clock -name CLK -period 10 [get_ports clk]\n");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator("#hier-tree [data-node]").first().waitFor();
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("clocktree"));
  await page.locator('input[placeholder^="func SDC"]').fill(SDC);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.waitForFunction(
    () => ((window as any).__schPinProbe?.() ?? []).length > 0,
    undefined, { timeout: 30_000 },
  );

  const before = await page.evaluate(`(${nodeCount})`) as number;
  expect(before).toBeGreaterThan(0);

  // Double-click the collapsed u_cpu box BODY (right of its clk boundary pin) to expand it.
  const pin = await page.evaluate(() =>
    ((window as any).__schPinProbe() as Array<{ node: string; port: string; x: number; y: number }>)
      .find((p) => p.port === "clk" && p.node.endsWith("u_cpu")));
  expect(pin).toBeTruthy();
  await page.mouse.dblclick(pin!.x + 60, pin!.y);
  await expect.poll(async () => await page.evaluate(`(${nodeCount})`) as number,
                    { timeout: 10_000 }).toBeGreaterThan(before);
  const opened = await page.evaluate(`(${nodeCount})`) as number;

  // Undo -> back to the collapsed shape; redo -> open again. Buttons mirror the state.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => await page.evaluate(`(${nodeCount})`) as number,
                    { timeout: 10_000 }).toBe(before);
  await expect(page.locator('[data-btn="redo"]')).toBeEnabled();

  await page.keyboard.press("Control+y");
  await expect.poll(async () => await page.evaluate(`(${nodeCount})`) as number,
                    { timeout: 10_000 }).toBe(opened);

  // The graph must SETTLE after a toggle (no flip-flopping relayout): stable node count
  // across a quiet second.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(`(${nodeCount})`) as number).toBe(opened);

  await app.close();
});
