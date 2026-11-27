// "clock module 为什么不能 trace": tracing INTO clock_module_0/mclk draws the assign buffers,
// and their fan-in is a PORT source of the inner module — rendered as the owner's OUTLINE box
// whose node id is the synthetic `port:<owner>.<pin>`. Clicking that box's pin used to ask the
// daemon about that synthetic id (which it has never heard of), get nothing, and mark the pin
// dead. The box must query its realPath instead. Real design; skipped when absent.
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

test("outline boxes from an inner-module port source keep tracing (realPath)", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const result = await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.PROCESSOR_1");
    await st().openSchematic(seed);
    // 1) into the module: the mclk assign buffers appear
    await st().traceInside(seed, seed, "mclk");
    // 2) walk every logic node's fan-in until an OUTLINE box (realPath, id starts "port:")
    //    shows up — that is the box in the screenshot.
    for (let round = 0; round < 4; round++) {
      const g = st().schematics[seed];
      for (const n of Object.values(g.nodes) as any[]) {
        if (n.kind === "logic") await st().traceSchematic(seed, n.id, "in", "fanin");
      }
      const outline = (Object.values(st().schematics[seed].nodes) as any[])
        .find((n) => n.realPath && n.id.startsWith("port:"));
      if (outline) {
        const pin = outline.ports[0];
        const before = Object.keys(st().schematics[seed].nodes).length;
        await st().traceSchematic(seed, outline.id, pin.name, pin.direction === "out" ? "fanin" : "fanin");
        const after = Object.keys(st().schematics[seed].nodes).length;
        const g2 = st().schematics[seed];
        const dead = (g2.empty?.[outline.id] ?? []).includes(pin.name);
        return { found: true, id: outline.id, realPath: outline.realPath,
                 pin: pin.name, busLabel: pin.busLabel, before, after, dead, err: String(st().error ?? "") };
      }
    }
    return { found: false };
  }, SEED);

  console.log("CLOCKMOD:", JSON.stringify(result));
  expect(result.found, "no outline box appeared — the trace chain changed").toBe(true);
  // The pin must NOT be a dead end: either the graph grew, or the trace wired to a box already
  // present (both are "the trace continued"); a dead-marked pin is the bug.
  expect(result.dead, `outline pin marked dead (err=${result.err})`).toBe(false);
  // The pin must be labeled by the real net, never the literal word "assign".
  expect(result.busLabel).not.toBe("assign");
  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
