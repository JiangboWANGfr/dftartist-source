// "我 trace netlist 并没有发现它 drive 寄存器" — because forward tracing DIED at the first
// gate/assign node: trace-loads keys on (instance, port) and knows nothing about a `logic:`
// statement, so the fanout of `assign por = por_noscan` answered nothing and the register
// loads behind it (sync_cell_lfxt_clk.rst, the lfxt_clk_dly always block, watchdog via the
// boundary port) stayed invisible. This walks the user's exact trace on the real design and
// asserts the registers now appear.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const SYNC = "processor_core.PROCESSOR_1.clock_module_0.sync_reset_por";

test("fanout continues past a logic node to the register loads (por chain)", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const result = await page.evaluate(async (sync) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.PROCESSOR_1");
    await st().toggleExpand("processor_core.PROCESSOR_1.clock_module_0");
    await st().openSchematic(sync);
    // step 1: fanout of rst_s (por_noscan) -> the `assign por = por_noscan` statement node
    await st().traceSchematic(sync, sync, "rst_s", "fanout");
    let g = st().schematics[sync];
    const logicIds = Object.keys(g.nodes).filter((k: string) => k.startsWith("logic:"));
    // step 2: fanout of each statement's OUT pin — this is where the user's trace died
    for (const id of logicIds) {
      const n = g.nodes[id];
      for (const p of n.ports.filter((q: any) => q.direction === "out"))
        await st().traceSchematic(sync, id, p.name, "fanout");
    }
    // one more ring: the assign-por fanout adds new statements (wire puc_a) — walk them too
    g = st().schematics[sync];
    for (const id of Object.keys(g.nodes).filter((k: string) => k.startsWith("logic:"))) {
      if (logicIds.includes(id)) continue;
      const n = g.nodes[id];
      for (const p of n.ports.filter((q: any) => q.direction === "out"))
        await st().traceSchematic(sync, id, p.name, "fanout");
    }
    g = st().schematics[sync];
    return { nodes: Object.keys(g.nodes), edges: g.edges.length, err: String(st().error ?? "") };
  }, SYNC);
  console.log("FANOUT:", JSON.stringify({ n: result.nodes.length, edges: result.edges,
    nodes: result.nodes.filter((x: string) => !x.startsWith("logic:")) }));

  expect(result.err).toBe("");
  // The register load the user could not find: the lfxt sync cell, reached THROUGH the
  // assign-por statement. Its box must be on the canvas with the real pin.
  expect(result.nodes).toContain("processor_core.PROCESSOR_1.clock_module_0.sync_cell_lfxt_clk");
  // And the boundary exit that lets the trace continue up to the watchdog.
  expect(result.nodes.some((x: string) =>
    x === "port:processor_core.PROCESSOR_1.clock_module_0.por")).toBe(true);

  await app.close().catch(() => {});
});
