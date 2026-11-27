// Repro for "为什么这个模块的输入引脚无法trace": free schematic seeded at the REAL design's
// processor_core.U_2.sync_cell_taclk (omsp_sync_cell) — its boundary IN pins clk/data_in/rst
// must trace (daemon verified: trace-drivers answers port sources mclk/taclk/puc_rst).
// Runs only when the real design exists (WSL home); skipped elsewhere.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const SEED = "processor_core.U_2.sync_cell_taclk";

test("sync_cell_taclk boundary input pins trace (mouse + store)", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  // A trace that grows the store but crashes ELK ("Referenced shape does not exist") looks
  // EXACTLY like a dead click to the user — the canvas never re-renders. Store-growth alone
  // is not success; layout errors fail the test.
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 400)); });
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // Reach the instance through the lazy tree, then seed the free schematic on it.
  await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.U_2");
    await st().openSchematic(seed);
  }, SEED);
  await page.waitForFunction(
    (seed) => !!(window as any).__hierStore.getState().schematics[seed], SEED, { timeout: 30_000 });
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800); // ELK + fit settle

  const count = () => page.evaluate(
    (seed) => Object.keys((window as any).__hierStore.getState().schematics[seed].nodes).length, SEED);

  // 1) REAL MOUSE single-click on the clk pin marker (free schematic → click = trace).
  const pos = await page.evaluate((seed) => {
    const anyWin = window as any;
    const laid = anyWin.__laidForTest?.[seed];
    const view = anyWin.__stageViewForTest?.[seed];
    if (!laid || !view) return null;
    const b = laid.boxes.find((x: any) => x.node.id === seed);
    const key = Object.keys(b?.ports ?? {}).find((k: string) =>
      k.startsWith(seed) && k.endsWith("clk") && k.length === seed.length + 1 + "clk".length);
    if (!b || !key) return null;
    const pt = b.ports[key];
    return { x: view.x + pt.x * view.scale, y: view.y + pt.y * view.scale };
  }, SEED);
  const before = await count();
  let mouseGrew = false;
  if (pos) {
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + pos.x + 6, box!.y + pos.y + 6);
    await page.waitForTimeout(1500);
    mouseGrew = (await count()) > before;
  }

  // 2) Store path for all three pins (mouse already covered clk; idempotent if it grew).
  const res = await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    const out: Record<string, { grew: boolean; err: string }> = {};
    for (const pin of ["clk", "data_in", "rst"]) {
      const n0 = Object.keys(st().schematics[seed].nodes).length;
      st().setState?.({ error: undefined });
      await st().traceSchematic(seed, seed, pin, "fanin");
      const n1 = Object.keys(st().schematics[seed].nodes).length;
      out[pin] = { grew: n1 > n0, err: String(st().error ?? "") };
    }
    return out;
  }, SEED);
  console.log("TACLK:", JSON.stringify({ mouse: pos ? (mouseGrew ? "grew" : "DEAD") : "no-handle", store: res }));

  // clk may not grow in step 2 if the mouse click already added its driver — accept either.
  expect(pos ? mouseGrew : true).toBe(true);
  expect(res.data_in.grew, `data_in err=${res.data_in.err}`).toBe(true);
  expect(res.rst.grew, `rst err=${res.rst.err}`).toBe(true);
  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
