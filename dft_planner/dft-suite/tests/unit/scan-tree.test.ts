// The Scan Planner's tree used to open on ONE collapsed row and list siblings in declaration
// order, so finding the blocks that hold the flops meant clicking ▶ blindly, level after level.
// These two pure functions are the fix, and this pins their behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ancestorsOf, childrenOf, initialExpansion, treeRows }
  from "../../src/hierarchy/core/scanTree.ts";
import type { RegCount } from "../../src/core-bridge/model.ts";

const c = (id: string, subtree: number, own = 0): RegCount =>
  ({ instanceId: id, own, subtree, memoryBits: 0 });

// top
//  ├ cpu (1300)      ├ core (1200) ├ alu (900), regfile (300)
//  ├ periph (100)    └ uart (60), spi (40)
//  └ sync (4)
const DESIGN: RegCount[] = [
  c("top", 1404), c("top.cpu", 1300), c("top.cpu.core", 1200), c("top.cpu.core.alu", 900),
  c("top.cpu.core.regfile", 300), c("top.periph", 100), c("top.periph.uart", 60),
  c("top.periph.spi", 40), c("top.sync", 4),
];

test("childrenOf returns only the immediate level", () => {
  assert.deepEqual(childrenOf(DESIGN, "top").map((x) => x.instanceId),
                   ["top.cpu", "top.periph", "top.sync"]);
  assert.deepEqual(childrenOf(DESIGN, "top.cpu").map((x) => x.instanceId), ["top.cpu.core"]);
  assert.deepEqual(childrenOf(DESIGN, "top.sync"), []);
});

test("the tree opens on the real fan-out instead of one collapsed row", () => {
  const open = initialExpansion(DESIGN, "top");
  assert.ok(open.has("top"), "the core itself must be open");
  // cpu holds one child only — a level that adds a row without adding information, so the
  // walk follows it through to the block the reader actually came for
  assert.ok(open.has("top.cpu"), "a single-child level is always followed");
  assert.ok(open.has("top.cpu.core"), "…down to the real fan-out");
  assert.ok(open.has("top.periph"));
  const rows = treeRows(DESIGN, "top", open);
  assert.ok(rows.length >= 8, `expected the design on screen, got ${rows.length} rows`);
});

test("a huge fan-out stops at the row budget (the page must stay readable)", () => {
  const wide: RegCount[] = [c("top", 1000)];
  for (let i = 0; i < 50; i++) wide.push(c(`top.blk${i}`, 20), c(`top.blk${i}.sub`, 10));
  const open = initialExpansion(wide, "top", 24);
  assert.ok(open.has("top"));
  // the 50 children are revealed; their sub-levels are not forced open on top of that
  const rows = treeRows(wide, "top", open);
  assert.ok(rows.length <= 60, `budget ignored: ${rows.length} rows`);
});

test("siblings sort by scan bits (biggest first), or by name on demand", () => {
  const open = new Set(["top", "top.cpu", "top.cpu.core", "top.periph"]);
  const byBits = treeRows(DESIGN, "top", open, "bits").map((r) => r.instanceId);
  assert.deepEqual(byBits, [
    "top", "top.cpu", "top.cpu.core", "top.cpu.core.alu", "top.cpu.core.regfile",
    "top.periph", "top.periph.uart", "top.periph.spi", "top.sync",
  ]);
  const byName = treeRows(DESIGN, "top", open, "name").map((r) => r.instanceId);
  assert.deepEqual(byName.slice(-3), ["top.periph.spi", "top.periph.uart", "top.sync"]);
});

test("a collapsed node hides its subtree, and only that", () => {
  const open = new Set(["top"]);
  assert.deepEqual(treeRows(DESIGN, "top", open).map((r) => r.instanceId),
                   ["top", "top.cpu", "top.periph", "top.sync"]);
});

test("ancestorsOf lists what a filter hit needs opened, stopping at the core", () => {
  assert.deepEqual(ancestorsOf("top.cpu.core.alu", "top"), ["top.cpu.core", "top.cpu", "top"]);
  assert.deepEqual(ancestorsOf("top", "top"), []);
});
