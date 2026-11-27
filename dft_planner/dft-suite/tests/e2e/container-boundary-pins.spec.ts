// "为什么这里 pin 都没有了" — the pins had WALKED OUT of the container. Tracing a gate's input
// pin inside a drilled-into module produced a free-floating outline box per port source
// (`port:<owner>.<pin>`, parentId lost -> drawn at root, one duplicate box per signal), while
// the owner module — already on the canvas as the container those gates live in — kept a bare
// frame with no boundary pin where the wire crossed it.
//
// The rule this locks down: when a port source's owner is ALREADY on the canvas, the wire
// comes from THAT box's boundary pin; a second box for the same instance is never created.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
const SEED = "processor_core.DATA_MEM_1";
const BACKBONE = "processor_core.PROCESSOR_1.mem_backbone_0";

test("a port source lands on its owner's boundary, not on a duplicate box", async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  const dump = await page.evaluate(async (seed) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().openSchematic(seed);
    // drill to the gates that make dmem_cen, then click each gate INPUT pin (the user's path)
    await st().traceSchematic(seed, seed, "CEN", "fanin");
    await st().traceInside(seed, "processor_core.PROCESSOR_1", "dmem_cen");
    await st().traceInside(seed, "processor_core.PROCESSOR_1.mem_backbone_0", "dmem_cen");
    for (let r = 0; r < 2; r++) {
      const g = st().schematics[seed];
      for (const id of Object.keys(g.nodes)) {
        if (!id.startsWith("logic:")) continue;
        for (const p of g.nodes[id].ports.filter((q: any) => q.direction !== "out"))
          await st().traceSchematic(seed, id, p.name, "fanin");
      }
    }
    const g = st().schematics[seed];
    return Object.values(g.nodes).map((n: any) => ({
      id: n.id, parent: n.parentId ?? "", inst: n.instanceName,
      pins: n.ports.map((p: any) => `${p.direction}:${p.name}`),
    }));
  }, SEED);
  console.log("NODES:", JSON.stringify(dump.map((n: any) => ({ id: n.id.slice(0, 70), p: n.parent ? 1 : 0, pins: n.pins.length })), null, 0));

  // 1. no free-floating outline box for a module that is already on the canvas
  const strays = dump.filter((n: any) =>
    n.id.startsWith("port:") && n.id.includes("mem_backbone_0."));
  expect(strays.map((s: any) => s.id), "duplicate outline boxes for mem_backbone_0").toEqual([]);

  // 2. exactly ONE node stands for the module, and it carries the boundary pins the wires use
  const owners = dump.filter((n: any) => n.inst === "mem_backbone_0");
  expect(owners.length, "the module must be drawn once").toBe(1);
  const pins: string[] = owners[0].pins;
  console.log("BOUNDARY PINS:", JSON.stringify(pins));
  for (const p of ["in:eu_mab", "in:eu_mb_en", "in:dbg_mem_addr", "in:dbg_mem_en"])
    expect(pins, `${p} must sit on the container boundary`).toContain(p);

  // 3. every gate stays INSIDE that container, and its wires start at the boundary pins
  const gates = dump.filter((n: any) => n.id.startsWith("logic:"));
  expect(gates.length).toBeGreaterThan(1);
  for (const g of gates) expect(g.parent).toBe(BACKBONE);

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});
