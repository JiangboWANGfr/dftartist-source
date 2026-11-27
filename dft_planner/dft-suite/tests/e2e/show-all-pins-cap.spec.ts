// "右键 module show all pin 也在图中显示它的输入和输出引脚，前提是引脚数量不超过200" —
// right-click Show All Pins now draws every port onto the box (previously it only opened the
// Ports tab), gated by a 200-pin cap so a pathological cell cannot bury the canvas. Both halves
// driven through the REAL context menu, not the store directly.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const REAL = "/home/wongw/nx9000/design/processor_core/processor_core.vc";
// Seeding directly on a module shows its FULL port list from the start (that is what a "seed"
// means); to test "Show All Pins grows a box that only shows its TOUCHED pins", frontend_0 has
// to be reached by a TRACE from elsewhere, exactly like the user's own workflow.
const SEED = "processor_core.PROCESSOR_1.clock_module_0";
const TARGET = "processor_core.PROCESSOR_1.frontend_0";   // reached via cpu_en_s fanout, 43 real ports

async function rightClickBoxTitle(page: import("@playwright/test").Page, seed: string, nodeId: string) {
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
  await page.mouse.click(bb!.x + pos!.x, bb!.y + pos!.y, { button: "right" });
}

test("Show All Pins draws every port on the box AND opens the Ports tab", async () => {
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
    // reach frontend_0 the way the user did: fanin cpu_en, trace INTO cpu_en_s (the alias
    // gate), then fanout that boundary pin — frontend_0 arrives showing only the ONE touched pin
    await st().traceSchematic(seed, seed, "cpu_en", "fanin");
    await st().traceInside(seed, seed, "cpu_en_s");
    await st().traceSchematic(seed, seed, "cpu_en_s", "fanout");
  }, SEED);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);

  const before = await page.evaluate(
    ([seed, target]) => (window as any).__hierStore.getState().schematics[seed].nodes[target].ports.length,
    [SEED, TARGET] as [string, string]);

  await rightClickBoxTitle(page, SEED, TARGET);
  await page.locator('[data-menu="show-all-pins"]').click();
  await page.waitForTimeout(1200);

  const after = await page.evaluate(
    ([seed, target]) => (window as any).__hierStore.getState().schematics[seed].nodes[target].ports.length,
    [SEED, TARGET] as [string, string]);
  console.log("PORTS:", before, "->", after);
  expect(after).toBeGreaterThan(before);
  expect(after).toBeGreaterThan(20);   // frontend_0's real port count

  // the Ports tab opened too — the two behaviours are now one click
  await page.locator("#hier-center").locator("text=Ports").first().waitFor({ timeout: 5000 }).catch(() => {});
  const tabOpen = await page.evaluate(() =>
    (window as any).__hierStore.getState().tabs.some((t: any) => t.kind === "ports"));
  expect(tabOpen, "Show All Pins must still open the Ports tab").toBe(true);

  expect(pageErrors.filter((e) => /JsonImportException|does not exist/.test(e))).toEqual([]);
  await app.close().catch(() => {});
});

test("the 200-pin cap refuses to draw an oversized port list", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  test.skip(!existsSync(REAL), "real design not present");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), REAL);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 60_000 });

  // A SYNTHETIC node (id prefix "port:" — never a real instance path, so revealAllPinsOnBox
  // skips the daemon and uses the node's OWN port list) standing in for a pathological cell:
  // no real library cell in this design has 200+ pins to test against honestly otherwise.
  const FAKE = "port:fakecell.big";
  await page.evaluate(async ([seed, fake]) => {
    const st = () => (window as any).__hierStore.getState();
    await st().toggleExpand("processor_core");
    await st().toggleExpand("processor_core.PROCESSOR_1");
    await st().openSchematic(seed);
    const g = st().schematics[seed];
    const huge = {
      id: fake, instanceName: "big_cell", designName: "FAKE_250PIN", kind: "module" as const,
      isLeaf: true,
      ports: Array.from({ length: 250 }, (_, i) => ({ name: `p${i}`, direction: "in" as const, busLabel: `p${i}` })),
    };
    st().putSchematic({ ...g, nodes: { ...g.nodes, [fake]: huge } });
  }, [SEED, FAKE] as [string, string]);
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);   // relayout with the injected node

  const before = await page.evaluate(
    ([seed, fake]) => (window as any).__hierStore.getState().schematics[seed].nodes[fake].ports.length,
    [SEED, FAKE] as [string, string]);

  await rightClickBoxTitle(page, SEED, FAKE);
  await page.locator('[data-menu="show-pins-on-box"]').click();
  await page.waitForTimeout(1200);

  const after = await page.evaluate(
    ([seed, fake]) => (window as any).__hierStore.getState().schematics[seed].nodes[fake].ports.length,
    [SEED, FAKE] as [string, string]);
  console.log("CAP: before", before, "after", after);
  expect(before).toBe(250);
  expect(after, "the 250-pin node must be left exactly as-is — the cap must REFUSE, not truncate").toBe(250);

  const toast = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#notify-host .notify-item")).map((n) => n.textContent));
  console.log("TOAST:", JSON.stringify(toast));
  expect(toast.some((t) => t?.includes("200"))).toBe(true);

  await app.close().catch(() => {});
});
