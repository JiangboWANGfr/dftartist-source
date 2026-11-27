// "早期阶段...floorplan图,显示memory所在的位置...虚线框显示mbist controller...虚线...关系" —
// pins the pure layout math: die/memory/controller screen positions and the Y-flip (DEF Y goes
// up, canvas Y goes down), independent of any React/Konva rendering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFloorplan } from "../../src/hierarchy/core/floorplan.ts";

const DIE = { x0: 0, y0: 0, x1: 1000, y1: 500 };

test("die fills the view, centered, preserving aspect ratio", () => {
  const r = buildFloorplan(DIE, [], [], 400, 400, 0);
  // die is 1000x500 (2:1); a 400x400 view can only fit 400x200 without distortion
  assert.equal(r.die.w, 400);
  assert.equal(r.die.h, 200);
  assert.equal(r.die.x, 0);
  assert.equal(r.die.y, 100);   // centered vertically: (400 - 200) / 2
});

test("a memory at the die's bottom-left lands at the screen's bottom-left (Y flips)", () => {
  const r = buildFloorplan(DIE, [{ path: "m0", x: 0, y: 0, placed: true }], [], 400, 400, 0);
  assert.equal(r.memories.length, 1);
  const m = r.memories[0];
  // world (0,0) is the die's bottom-left; DIE y1=500 is world "up" -> screen y = die.y + die.h
  assert.ok(Math.abs((m.x + m.w / 2) - r.die.x) < 1e-6);
  assert.ok(Math.abs((m.y + m.h / 2) - (r.die.y + r.die.h)) < 1e-6);
});

test("a memory at the die's top-right lands at the screen's top-right", () => {
  const r = buildFloorplan(DIE, [{ path: "m0", x: 1000, y: 500, placed: true }], [], 400, 400, 0);
  const m = r.memories[0];
  assert.ok(Math.abs((m.x + m.w / 2) - (r.die.x + r.die.w)) < 1e-6);
  assert.ok(Math.abs((m.y + m.h / 2) - r.die.y) < 1e-6);
});

test("a controller centers on its members' centroid and draws one link per member", () => {
  const mems = [
    { path: "a", x: 0, y: 0, placed: true },
    { path: "b", x: 1000, y: 0, placed: true },
  ];
  const r = buildFloorplan(DIE, mems, [{ name: "ctrl0", memories: [0, 1] }], 400, 400, 0);
  assert.equal(r.controllers.length, 1);
  const c = r.controllers[0];
  const cx = c.x + c.w / 2;
  // centroid of (0,0) and (1000,0) in world space is (500,0) -> mid-x of the die's screen span
  assert.ok(Math.abs(cx - (r.die.x + r.die.w / 2)) < 1e-6);
  assert.equal(r.links.length, 2);
  assert.equal(c.memberPaths.length, 2);
  assert.equal(r.memories[0].controller, 0);
  assert.equal(r.memories[1].controller, 0);
});

test("a controller's box is a padded BOUNDING BOX of its members, not a fixed small square at "
   + "the centroid — it must fully enclose every member it supposedly covers", () => {
  const mems = [
    { path: "a", x: 0, y: 0, placed: true },
    { path: "b", x: 1000, y: 500, placed: true },   // spans the WHOLE die diagonally
  ];
  const r = buildFloorplan(DIE, mems, [{ name: "ctrl0", memories: [0, 1] }], 400, 400, 0);
  const c = r.controllers[0];
  for (const m of r.memories) {
    assert.ok(m.x >= c.x && m.x + m.w <= c.x + c.w, "member x-extent must sit inside the controller box");
    assert.ok(m.y >= c.y && m.y + m.h <= c.y + c.h, "member y-extent must sit inside the controller box");
  }
});

test("an unplaced memory is excluded from its controller's centroid and gets no link", () => {
  const mems = [
    { path: "a", x: 0, y: 0, placed: true },
    { path: "b", x: 999, y: 999, placed: false },
  ];
  const r = buildFloorplan(DIE, mems, [{ name: "ctrl0", memories: [0, 1] }], 400, 400, 0);
  assert.equal(r.controllers.length, 1);
  assert.equal(r.controllers[0].memberPaths.length, 1);
  assert.equal(r.links.length, 1);
});

test("a controller with NO placed members draws nothing (not a box at the origin)", () => {
  const mems = [{ path: "a", x: 0, y: 0, placed: false }];
  const r = buildFloorplan(DIE, mems, [{ name: "ctrl0", memories: [0] }], 400, 400, 0);
  assert.equal(r.controllers.length, 0);
  assert.equal(r.links.length, 0);
});

test("no DIEAREA and no placed memories at all -> empty, not a crash", () => {
  const r = buildFloorplan({ x0: 0, y0: 0, x1: 0, y1: 0 }, [], [], 400, 400, 0);
  assert.equal(r.empty, true);
  assert.equal(r.die.w, 0);
});

test("no DIEAREA but placed memories exist -> falls back to their bounding box", () => {
  const mems = [
    { path: "a", x: 100, y: 100, placed: true },
    { path: "b", x: 300, y: 400, placed: true },
  ];
  const r = buildFloorplan({ x0: 0, y0: 0, x1: 0, y1: 0 }, mems, [], 400, 400, 0);
  assert.equal(r.empty, false);
  assert.equal(r.memories.length, 2);
  // bbox is 200x300 (2:3) fit into a 400x400 view -> width-bound at 200 wide... actually height-bound
  assert.ok(r.die.w > 0 && r.die.h > 0);
});
