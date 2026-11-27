// "schematic 中如何辅助性快速找到对应的 RTL" — before this, double-clicking a PIN or a `src`
// symbol jumped straight to HDL, but double-clicking a plain MODULE BOX's body did nothing at
// all (onBoxDblClick was never wired by any caller). Now every box that resolves to an RTL
// location (module definition, or the exact assign/always statement for a gate/logic node)
// opens it on double-click — the same three-tier resolution the right-click "Show HDL
// Definition" menu item uses, so the two paths can never disagree.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const SEED = "processor_core.PROCESSOR_1.clock_module_0";

async function dblClickBoxTitle(page: import("@playwright/test").Page, seed: string, nodeId: string) {
  const pos = await page.evaluate(([s, n]) => {
    const laid = (window as any).__laidForTest?.[s];
    const view = (window as any).__stageViewForTest?.[s];
    const b = laid?.boxes.find((x: any) => x.node.id === n);
    if (!b || !view) return null;
    return { x: view.x + (b.x + b.w / 2) * view.scale, y: view.y + (b.y + 8) * view.scale };
  }, [seed, nodeId] as [string, string]);
  expect(pos, "box geometry not found").not.toBeNull();
  const canvas = page.locator("#hier-center canvas").first();
  const bb = await canvas.boundingBox();
  await page.mouse.dblclick(bb!.x + pos!.x, bb!.y + pos!.y);
}

test("double-clicking a module box jumps to its RTL definition", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.PROCESSOR_1");
    await st().openSchematic(seed);
  }, SEED);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // sanity: double-click did NOTHING before this feature (no tab appeared) — now it must.
  const tabsBefore = await page.evaluate(() =>
    (window as any).__hierStore.getState().tabs.filter((t: any) => t.kind === "hdl").length);
  await dblClickBoxTitle(page, SEED, SEED);
  await page.waitForTimeout(800);
  const hdlTab = await page.evaluate(() =>
    (window as any).__hierStore.getState().tabs.find((t: any) => t.kind === "hdl"));
  console.log("HDL TAB:", JSON.stringify(hdlTab));
  expect(hdlTab, "double-click must open an HDL tab").toBeTruthy();
  expect(hdlTab.file).toContain("omsp_clock_module.v");
  const tabsAfter = await page.evaluate(() =>
    (window as any).__hierStore.getState().tabs.filter((t: any) => t.kind === "hdl").length);
  expect(tabsAfter).toBeGreaterThan(tabsBefore);

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});

test("double-clicking a gate (logic node) jumps to its assign/always statement", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const gateId = await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.PROCESSOR_1");
    await st().openSchematic(seed);
    await st().traceInside(seed, seed, "cpu_en_s");   // -> the `assign cpu_en_s = cpu_en;` gate
    const g = st().schematics[seed];
    return Object.keys(g.nodes).find((k: string) => k.startsWith("logic:")) ?? null;
  }, SEED);
  expect(gateId).toBeTruthy();
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);

  await dblClickBoxTitle(page, SEED, gateId!);
  await page.waitForTimeout(800);
  const hdlTab = await page.evaluate(() =>
    (window as any).__hierStore.getState().tabs.find((t: any) => t.kind === "hdl"));
  console.log("GATE HDL TAB:", JSON.stringify(hdlTab));
  expect(hdlTab).toBeTruthy();
  expect(hdlTab.line).toBe(508);   // `assign cpu_en_s = cpu_en;` at omsp_clock_module.v:508

  await app.close().catch(() => {});
});
