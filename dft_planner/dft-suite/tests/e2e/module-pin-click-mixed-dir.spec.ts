// A module box with MANY pins shown via "Show Pins on Box" — the free schematic's clock_module_0
// case (26 ports, only ONE wired). Real mouse clicks on both IN and OUT pins, previously
// untouched, must trace. This pins the marker-position math itself: the clickable hit box is
// centered at `mx = pt.x -+ PIN_STUB` depending on direction (SchematicTab), NOT at the raw
// laid.ts anchor `pt.x` — a wrong sign there misses the 18px hit area by ~20px, which looks
// exactly like a dead pin from the user's side ("trace不动") even though the underlying trace
// logic is fine.
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

test("real clicks trace both IN and OUT pins on a module after Show Pins on Box", async () => {
  test.setTimeout(180_000);
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
    await st().traceSchematic(seed, seed, "cpu_en", "fanin");   // pulls PROCESSOR_1 in
    const full = await (window as any).dft.design.query("get-ports", { nodeId: seed });
    st().setVisiblePins(seed, seed, full.ports.map((p: any) => p.name), full.ports);
  }, SEED);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);

  const edgeCount = () => page.evaluate(
    (seed) => (window as any).__hierStore.getState().schematics[seed].edges.length, SEED);

  // one IN pin, one OUT pin — both previously untouched by any prior trace
  for (const pin of ["cpuoff", "aclk"]) {
    const pos = await page.evaluate(([seed, p]) => {
      const laid = (window as any).__laidForTest?.[seed];
      const view = (window as any).__stageViewForTest?.[seed];
      const b = laid?.boxes.find((x: any) => x.node.id === seed);
      if (!b || !view) return null;
      const key = Object.keys(b.ports).find((k: string) =>
        k.endsWith(p) && k.length === seed.length + 1 + p.length);
      if (!key) return null;
      const pt = b.ports[key];
      const dir = (window as any).__hierStore.getState().schematics[seed].nodes[seed].ports
        .find((q: any) => q.name === p)?.direction;
      // clickable marker sits ON THE BORDER at mx = pt.x -+ PIN_STUB(10) by direction — the
      // raw laid.ts pt.x itself is 10px OUTSIDE the hit box, on the stub.
      const mx = pt.x + (dir === "out" ? -10 : 10);
      return { x: view.x + mx * view.scale, y: view.y + pt.y * view.scale };
    }, [SEED, pin] as [string, string]);
    expect(pos, `${pin} geometry not found`).not.toBeNull();
    const before = await edgeCount();
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + pos!.x, box!.y + pos!.y);
    await page.waitForTimeout(900);
    const after = await edgeCount();
    console.log(`${pin}: edges ${before} -> ${after}`);
    expect(after, `clicking ${pin} did not trace`).toBeGreaterThan(before);
  }

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
