// "绿色圈圈里面的引脚点击无法 trace" — PROG_MEM_2's CEN/WEN/A/D/OEN. The daemon answered
// every one of them; the canvas died because the FIRST trace (CLK) put PROCESSOR_1 on canvas
// showing only mclk, and the next trace's edge referenced its pmem_* pin — a pin the box does
// not show. ensure() grafted pins onto NEW nodes only, so the edge pointed at nothing, ELK
// aborted the whole layout, and every later click LOOKED dead. This replays that exact
// sequence with a REAL mouse and fails on any layout exception.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const LIB = "/home/wongw/nx9000/library/memories";
const SEED = "processor_core.PROG_MEM_2";

test("SRAM input pins keep tracing after the first trace shares a neighbour box", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });
  // warm the memory library so the SRAM box carries its real, directed pins
  await page.evaluate((lib) => (window as any).dft.design.query("memory-map", { libDir: lib }), LIB);

  await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().openSchematic(seed);
    // the user's first move: trace CLK — PROCESSOR_1 lands on canvas showing only mclk
    await st().traceSchematic(seed, seed, "CLK", "fanin");
  }, SEED);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1000);

  const count = () => page.evaluate(
    (seed) => Object.keys((window as any).__hierStore.getState().schematics[seed].nodes).length, SEED);
  const edgeCount = () => page.evaluate(
    (seed) => (window as any).__hierStore.getState().schematics[seed].edges.length, SEED);

  // REAL MOUSE click on each circled pin, one after another — every one must grow the graph
  // or at least add its edge, and none may throw a layout exception.
  for (const pin of ["CEN", "WEN", "A", "D", "OEN"]) {
    const pos = await page.evaluate(([seed, p]) => {
      const laid = (window as any).__laidForTest?.[seed];
      const view = (window as any).__stageViewForTest?.[seed];
      if (!laid || !view) return null;
      const b = laid.boxes.find((x: any) => x.node.id === seed);
      const key = Object.keys(b?.ports ?? {}).find((k: string) =>
        k.endsWith(p) && k.length === seed.length + 1 + p.length);
      if (!b || !key) return null;
      const pt = b.ports[key];
      return { x: view.x + (pt.x + 10) * view.scale, y: view.y + pt.y * view.scale };
    }, [SEED, pin] as [string, string]);
    expect(pos, `${pin} pin geometry not found`).not.toBeNull();
    const beforeE = await edgeCount();
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + pos!.x, box!.y + pos!.y);
    await page.waitForTimeout(900);
    const afterE = await edgeCount();
    console.log(`PIN ${pin}: edges ${beforeE} -> ${afterE}`);
    expect(afterE, `${pin} click did not trace`).toBeGreaterThan(beforeE);
  }

  console.log("NODES:", await count(), "EDGES:", await edgeCount());
  // the killer assertion: no layout exception anywhere in the sequence
  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  // and the neighbour box gained the pins the edges reference
  const procPins = await page.evaluate((seed) => {
    const g = (window as any).__hierStore.getState().schematics[seed];
    return g.nodes["processor_core.PROCESSOR_1"]?.ports.map((p: any) => p.name) ?? [];
  }, SEED);
  console.log("PROC PINS:", JSON.stringify(procPins));
  for (const p of ["pmem_cen", "pmem_wen", "pmem_addr", "pmem_din"])
    expect(procPins).toContain(p);

  await app.close().catch(() => {});
});
