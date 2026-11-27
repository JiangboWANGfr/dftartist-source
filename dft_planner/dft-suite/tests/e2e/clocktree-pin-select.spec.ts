// User-reported "clock tree 里 pin 无法选中": clicking a CONNECTED pin landed on the wire's
// invisible 12px hit stroke (the wire hit layer used to render ABOVE the pin layer). This spec
// drives REAL mouse clicks at pin pixels — through Playwright, through Konva's hit canvas —
// so the whole stack is exercised, not just the React handlers.

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

test("clock tree: a connected pin is click-selectable (object-name bar + pin menu)", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  writeFileSync(SDC, "create_clock -name CLK -period 10 [get_ports clk]\n");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );
  await page.locator("#hier-tree [data-node]").first().waitFor();

  // Clock Tree workspace; run the analysis with the SDC.
  await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("clocktree"));
  await page.locator('input[placeholder^="func SDC"]').fill(SDC);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.waitForFunction(
    () => ((window as any).__schPinProbe?.() ?? []).length > 0,
    undefined, { timeout: 30_000 },
  );

  // "pins.length > 0" only proves a FIRST layout pass landed — the stage's post-layout auto-fit
  // (pan/zoom-to-content) can still shift every pin's screen coordinates a moment later, so a
  // probe read right at that first instant can be stale by the time the click actually fires.
  // Poll until the same pin reports the same coordinates on two consecutive reads.
  const findPin = () => page.evaluate(() =>
    ((window as any).__schPinProbe() as Array<{ node: string; port: string; x: number; y: number }>)
      .find((p) => p.port === "clk" && p.node.endsWith("u_cpu")));
  let pin = await findPin();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = await findPin();
    if (pin && next && pin.x === next.x && pin.y === next.y) break;
    pin = next;
  }
  expect(pin, "u_cpu clk pin must be on the canvas").toBeTruthy();

  // LEFT-CLICK selects: the RTLvision-style object-name bar appears with the full path.
  await page.mouse.click(pin!.x, pin!.y);
  const bar = page.locator('[data-status="objname"]');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("clk");

  // RIGHT-CLICK opens the pin menu with the copy / add_occ_point actions.
  await page.mouse.click(pin!.x, pin!.y, { button: "right" });
  await expect(page.locator('[data-menu="copy-pin-path"]')).toBeVisible();
  await expect(page.locator('[data-menu="add-occ"]')).toBeVisible();

  // add_pin_constraint straight from the menu: click "1", then verify the SHELL actually
  // recorded it — the whole chain (menu → dp_shell → state), not just the click handler.
  await expect(page.locator('[data-menu="pin-constraint"]')).toBeVisible();
  await page.locator('[data-btn="pincon-1"]').click();
  const rep = await page.evaluate(() =>
    (window as any).dft.design.query("dp-shell", { script: "report_pin_constraints", file: "" }));
  expect(rep.output).toContain("= 1");
  expect(rep.pinConstraints?.length ?? 0).toBeGreaterThan(0);

  await app.close();
});
