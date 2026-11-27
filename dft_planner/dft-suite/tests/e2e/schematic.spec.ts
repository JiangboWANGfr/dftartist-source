// Perf gate for the schematic canvas: verify ≥50fps during pan on a traced schematic cone.
// Task 3.3 — Konva layer/listening perf hardening anti-卡顿.

import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";
import { expectSmooth } from "../helpers/perf.ts";
import { existsSync } from "node:fs";
import path from "node:path";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = path.resolve(process.cwd(), "tests/fixtures/soc.f");

test("schematic: pan is smooth (≥50fps) on a traced schematic cone", async () => {
  test.setTimeout(120_000);
  test.skip(!existsSync(path.join(BIN, "hdl")), "no hdl binary");

  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });

  // Open the design via the shared store (same path as the shell's 打开设计 button).
  await page.evaluate(
    (fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }),
    FILELIST,
  );

  // Wait for the hierarchy tree to populate.
  await page.locator('#hier-tree [data-node]').first().waitFor();

  // Expand the soc root to show u_cpu.
  await page.locator('#hier-tree [data-arrow="soc"]').click();
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').waitFor();

  // Right-click u_cpu to open context menu, then click "Show on Hierarchical Schematic".
  await page.locator('#hier-tree [data-node="soc.u_cpu"]').click({ button: "right" });
  await page.locator('[data-menu="schematic"]').waitFor();
  await page.locator('[data-menu="schematic"]').click();

  // Wait for the Konva canvas to appear in the center panel.
  const canvas = page.locator('#hier-center canvas').first();
  await canvas.waitFor({ timeout: 10_000 });

  // Verify the tab opened (schematic tab kind).
  await expect(page.locator('#hier-center [data-tab-kind="schematic"]')).toBeVisible();

  // Grow a real cone before measuring: trace every seed pin through the exposed
  // store (same daemon-backed path as clicking the diamonds). The perf gate then
  // actually covers the per-pin labels + per-wire net labels redraw load.
  const counts = await page.evaluate(async () => {
    const store = (window as any).__hierStore;
    // Graphs are keyed by seedNodeId (not tab id) after the reuse-tab change (D12).
    const seedNodeId = "soc.u_cpu";
    const seed = store.getState().schematics[seedNodeId].nodes["soc.u_cpu"];
    for (const p of seed.ports) {
      const dir = p.direction === "out" ? "fanout" : "fanin";
      await store.getState().traceSchematic(seedNodeId, "soc.u_cpu", p.name, dir);
    }
    const g = store.getState().schematics[seedNodeId];
    return { edges: g.edges.length, nodes: Object.keys(g.nodes).length };
  });
  expect(counts.edges).toBeGreaterThan(0);
  // let ELK relayout + Konva redraw settle
  await page.waitForTimeout(500);

  // Get canvas bounding box for pan gesture coordinates.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  // Measure FPS during a drag-pan across the canvas (~20 small mouse moves, 5px each).
  await expectSmooth(page, async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(cx - i * 5, cy - i * 3);
    }
    await page.mouse.up();
  }, 50);

  // fit / relayout buttons: present, clickable, canvas stays alive
  await page.locator('[data-btn="fit"]').click();
  await page.locator('[data-btn="relayout"]').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#hier-center canvas').first()).toBeVisible();

  await app.close();
});
