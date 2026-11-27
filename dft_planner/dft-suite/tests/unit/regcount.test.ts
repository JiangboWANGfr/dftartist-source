import { test } from "node:test";
import assert from "node:assert/strict";
import { regRows, depthOf, leafName } from "../../src/hierarchy/core/regcount.ts";
import type { RegCountResult } from "../../src/core-bridge/model.ts";

const R: RegCountResult = {
  total: 44,
  counts: [
    { instanceId: "top",         own: 4,  subtree: 44, memoryBits: 0 },
    { instanceId: "top.u_leaf",  own: 32, subtree: 32, memoryBits: 0 },
    { instanceId: "top.u_dedup", own: 8,  subtree: 8,  memoryBits: 0 },
    { instanceId: "top.u_mem",   own: 0,  subtree: 0,  memoryBits: 2048 },
  ],
};

test("hier mode preserves daemon pre-order (the hierarchy)", () => {
  const rows = regRows(R, { key: "hier", dir: "desc" }, "");
  assert.deepEqual(rows.map(r => r.instanceId),
    ["top", "top.u_leaf", "top.u_dedup", "top.u_mem"]);
});

test("sort by subtree desc", () => {
  const rows = regRows(R, { key: "subtree", dir: "desc" }, "");
  assert.deepEqual(rows.map(r => r.instanceId), ["top", "top.u_leaf", "top.u_dedup", "top.u_mem"]);
});

test("sort by own asc", () => {
  const rows = regRows(R, { key: "own", dir: "asc" }, "");
  assert.equal(rows[0].instanceId, "top.u_mem");   // own 0
  assert.equal(rows[rows.length - 1].instanceId, "top.u_leaf"); // own 32
});

test("filter by instanceId substring (hier mode keeps order)", () => {
  const rows = regRows(R, { key: "hier", dir: "desc" }, "u_");
  assert.deepEqual(rows.map(r => r.instanceId),
    ["top.u_leaf", "top.u_dedup", "top.u_mem"]);
});

test("depthOf / leafName", () => {
  assert.equal(depthOf("top"), 0);
  assert.equal(depthOf("top.u_mem"), 1);
  assert.equal(depthOf("a.b.c"), 2);
  assert.equal(leafName("top"), "top");
  assert.equal(leafName("top.u_mem"), "u_mem");
  assert.equal(leafName("a.b.c"), "c");
});
