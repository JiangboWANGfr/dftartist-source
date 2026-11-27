// "选中模块可以右键 show pin 并且在 schematic 中显示" — right-click a box, one click puts
// EVERY pin of the instance on it (daemon's full list; a blackbox SRAM gets the memory
// model's directed pins); "Hide Unconnected Pins" folds back to just the wired ones. Driven
// with a REAL right-click + menu click, and the layout must survive both ways.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const SEED = "processor_core.PROG_MEM_2";
const PROC = "processor_core.PROCESSOR_1";

test("right-click Show Pins on Box lists every pin, Hide folds back", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // Seed at the SRAM, trace CLK -> PROCESSOR_1 arrives showing ONLY mclk.
  await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().openSchematic(seed);
    await st().traceSchematic(seed, seed, "CLK", "fanin");
  }, SEED);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1000);

  const pinsOf = (id: string) => page.evaluate(([seed, nid]) =>
    ((window as any).__hierStore.getState().schematics[seed].nodes[nid]?.ports ?? [])
      .map((p: any) => p.name), [SEED, id] as [string, string]);
  const before = await pinsOf(PROC);
  console.log("BEFORE:", JSON.stringify(before));
  expect(before.length).toBeLessThanOrEqual(2);   // just mclk (default = connected only)

  // REAL right-click on the PROCESSOR_1 box body, then the new menu item.
  const rc = async () => {
    const pos = await page.evaluate(([seed, nid]) => {
      const laid = (window as any).__laidForTest?.[seed];
      const view = (window as any).__stageViewForTest?.[seed];
      const b = laid?.boxes.find((x: any) => x.node.id === nid);
      if (!b || !view) return null;
      // aim at the title area (top-center), clear of pins and children
      return { x: view.x + (b.x + b.w / 2) * view.scale, y: view.y + (b.y + 8) * view.scale };
    }, [SEED, PROC] as [string, string]);
    expect(pos, "box geometry not found").not.toBeNull();
    const bb = await canvas.boundingBox();
    await page.mouse.click(bb!.x + pos!.x, bb!.y + pos!.y, { button: "right" });
  };
  await rc();
  await page.locator('[data-menu="show-pins-on-box"]').click();
  await page.waitForTimeout(1200);
  const shown = await pinsOf(PROC);
  console.log("SHOWN:", shown.length, JSON.stringify(shown.slice(0, 10)));
  expect(shown.length, "the full pin list must land on the box").toBeGreaterThan(10);
  expect(shown).toContain("mclk");       // the connected pin survives
  expect(shown).toContain("puc_rst");    // a pin nothing on canvas touches yet

  // fold back: only the wired pin remains
  await rc();
  await page.locator('[data-menu="hide-unconnected-pins"]').click();
  await page.waitForTimeout(1200);
  const folded = await pinsOf(PROC);
  console.log("FOLDED:", JSON.stringify(folded));
  expect(folded).toContain("mclk");
  expect(folded.length).toBeLessThanOrEqual(2);

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
