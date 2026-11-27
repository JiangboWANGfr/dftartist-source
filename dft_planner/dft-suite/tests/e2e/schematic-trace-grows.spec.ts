// REGRESSION PROBE for "所有引脚点击无效": open the fixture design, trace pins through the
// SAME store path the diamonds use, assert the graph actually grows.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("pin trace path grows the graph", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 400)));
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click({ button: "right" });
  await page.locator('[data-menu="schematic"]').click();
  await page.locator("#hier-center canvas").first().waitFor({ timeout: 10_000 });
  const counts = await page.evaluate(async () => {
    const store = (window as any).__hierStore;
    const seedNodeId = "soc.u_cpu";
    const seed = store.getState().schematics[seedNodeId].nodes["soc.u_cpu"];
    const before = Object.keys(store.getState().schematics[seedNodeId].nodes).length;
    for (const p of seed.ports) {
      const dir = p.direction === "out" ? "fanout" : "fanin";
      await store.getState().traceSchematic(seedNodeId, "soc.u_cpu", p.name, dir);
    }
    const g = store.getState().schematics[seedNodeId];
    return { before, after: Object.keys(g.nodes).length, edges: g.edges.length,
             empty: Object.values(g.empty as Record<string, string[]>).flat().length };
  });
  console.log("COUNTS:", JSON.stringify(counts));
  expect(counts.after).toBeGreaterThan(counts.before);
  expect(counts.edges).toBeGreaterThan(0);
  await app.close().catch(() => {});
});
