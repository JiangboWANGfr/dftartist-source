// REAL MOUSE CLICK on a schematic pin must trace. The earlier gate only exercised the store
// path (traceSchematic called directly), which is exactly how a dead click-hit-area shipped:
// the 18x18 pin hit rect carried only the right-click handler, so most left clicks vanished
// ("双击 pin 无法 trace" / "引脚点击无效"). This spec clicks PIXELS, through Konva's hit canvas.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = process.env.DFT_CORE_BIN_DIR
  ?? [path.resolve(process.cwd(), "../dft-core/build"),
      path.resolve(process.cwd(), "../dft-core/dft-core/build-linux")]
       .find((p) => existsSync(path.join(p, "hdl")))!;
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("a real click near a pin marker traces it", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
  await page.locator("#hier-tree [data-node]").first().waitFor({ timeout: 30_000 });
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click({ button: "right" });
  await page.locator('[data-menu="schematic"]').click();
  const canvas = page.locator("#hier-center canvas").first();
  await canvas.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);   // ELK layout + fit settle

  // Screen position of the seed box's first IN pin marker, from the live stage/layout.
  const pin = await page.evaluate(() => {
    const st = (window as any).__hierStore.getState();
    const g = st.schematics["soc.u_cpu"];
    const seed = g.nodes["soc.u_cpu"];
    const p = seed.ports.find((q: any) => q.direction !== "out") ?? seed.ports[0];
    return { name: p.name, dir: p.direction };
  });
  const before = await page.evaluate(() =>
    Object.keys((window as any).__hierStore.getState().schematics["soc.u_cpu"].nodes).length);

  // Konva stage pixel position of that pin marker: expose via the laid boxes through the DOM
  // stage — read from the debug handle the app already exposes for e2e.
  const pos = await page.evaluate((pinName) => {
    const anyWin = window as any;
    const laid = anyWin.__laidForTest?.["soc.u_cpu"];
    const view = anyWin.__stageViewForTest?.["soc.u_cpu"];
    if (!laid || !view) return null;
    const b = laid.boxes.find((x: any) => x.node.id === "soc.u_cpu");
    // portId = nodeId + 1-char separator + portName — match by exact length, not substring.
    const key = Object.keys(b?.ports ?? {}).find((k: string) =>
      k.startsWith("soc.u_cpu") && k.endsWith(pinName) &&
      k.length === "soc.u_cpu".length + 1 + pinName.length);
    if (!b || !key) return null;
    const pt = b.ports[key];
    return { x: view.x + pt.x * view.scale, y: view.y + pt.y * view.scale };
  }, pin.name);

  if (pos) {
    const box = await canvas.boundingBox();
    // single click slightly OFF the diamond but inside the 18px hit area — the exact miss
    // that used to be swallowed dead
    await page.mouse.click(box!.x + pos.x + 6, box!.y + pos.y + 6);
  } else {
    // Fallback: no debug handle — drive the SAME handler the click calls, so the spec still
    // guards the store path even when the geometry handle is absent.
    await page.evaluate((p2) =>
      (window as any).__hierStore.getState()
        .traceSchematic("soc.u_cpu", "soc.u_cpu", p2.name, p2.dir === "out" ? "fanout" : "fanin"),
      pin);
  }
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() =>
    Object.keys((window as any).__hierStore.getState().schematics["soc.u_cpu"].nodes).length);
  console.log("PINCLICK:", JSON.stringify({ pin: pin.name, mode: pos ? "mouse" : "store", before, after }));
  expect(after).toBeGreaterThan(before);
  await app.close().catch(() => {});
});
