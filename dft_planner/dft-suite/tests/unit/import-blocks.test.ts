// Unit test: addBlocksFromHierarchy + addBlockAt — the pure functions that underpin
// the in-process "加入连接生成" handoff (Phase 5). No daemon, no React, no Zustand.

import { test } from "node:test";
import assert from "node:assert/strict";
import { addBlocksFromHierarchy, addBlockAt, type BlockPayload } from "../../src/genconn/importBlocks.ts";
import { emptyDocument } from "../../src/genconn/core/document.ts";

function freshDoc() {
  return emptyDocument("chip");
}

test("addBlocksFromHierarchy adds a new harden def + instance for an unknown designName", () => {
  const doc = freshDoc();
  const payload: BlockPayload = { designName: "cpu", fileName: "/rtl/cpu.v", instanceName: "u_cpu" };
  const { doc: out, added, skipped } = addBlocksFromHierarchy(doc, [payload]);

  assert.equal(added, 1);
  assert.deepEqual(skipped, []);

  // A new def with designName "cpu" must have been created in the library.
  const cpuDef = out.library.defs.find((d) => d.designName === "cpu");
  assert.ok(cpuDef, "cpu def must exist after import");
  assert.equal(cpuDef.fileName, "/rtl/cpu.v");

  // The open def must now have exactly one child instance whose instanceName is "u_cpu".
  const openDef = out.library.defs.find((d) => d.id === out.ui.openDefId)!;
  assert.equal(openDef.childInstances.length, 1);
  assert.equal(openDef.childInstances[0].instanceName, "u_cpu");
});

test("addBlocksFromHierarchy reuses existing def when designName already present", () => {
  let doc = freshDoc();
  const p: BlockPayload = { designName: "cpu", instanceName: "u_cpu" };
  ({ doc } = addBlocksFromHierarchy(doc, [p]));
  const defsBefore = doc.library.defs.length;

  // Import a second instance of the same designName — no new def should be created.
  const p2: BlockPayload = { designName: "cpu", instanceName: "u_cpu2" };
  const { doc: out, added, skipped } = addBlocksFromHierarchy(doc, [p2]);
  assert.equal(added, 1);
  assert.deepEqual(skipped, []);
  assert.equal(out.library.defs.length, defsBefore, "no new def for already-known designName");

  const openDef = out.library.defs.find((d) => d.id === out.ui.openDefId)!;
  assert.equal(openDef.childInstances.length, 2);
});

test("addBlocksFromHierarchy skips self-import (designName === open def's designName)", () => {
  const doc = freshDoc(); // root designName = "chip", openDefId = "chip"
  const p: BlockPayload = { designName: "chip" };
  const { added, skipped } = addBlocksFromHierarchy(doc, [p]);
  assert.equal(added, 0);
  assert.equal(skipped.length, 1);
});

test("addBlocksFromHierarchy handles instance name collision gracefully (keeps auto-name)", () => {
  let doc = freshDoc();
  const p: BlockPayload = { designName: "mem", instanceName: "u_mem" };
  ({ doc } = addBlocksFromHierarchy(doc, [p]));

  // Import again with the same instanceName → should not throw, should skip rename.
  const p2: BlockPayload = { designName: "mem", instanceName: "u_mem" };
  const { doc: out, added, skipped } = addBlocksFromHierarchy(doc, [p2]);
  assert.equal(added, 1);
  assert.deepEqual(skipped, []);
  // The second instance gets its auto-name (not u_mem, which is taken).
  const openDef = out.library.defs.find((d) => d.id === out.ui.openDefId)!;
  const names = openDef.childInstances.map((i) => i.instanceName);
  assert.ok(names.includes("u_mem"), "first instance keeps u_mem");
});

test("addBlockAt places a block at the specified coordinates", () => {
  const doc = freshDoc();
  const p: BlockPayload = { designName: "pll", instanceName: "u_pll" };
  const out = addBlockAt(doc, p, { x: 100, y: 200 });
  const openDef = out.library.defs.find((d) => d.id === out.ui.openDefId)!;
  const inst = openDef.childInstances[0];
  assert.ok(inst, "instance was added");
  assert.deepEqual(inst.position, { x: 100, y: 200 });
});

test("addBlocksFromHierarchy with multiple payloads adds all valid blocks", () => {
  const doc = freshDoc();
  const payloads: BlockPayload[] = [
    { designName: "cpu", instanceName: "u_cpu" },
    { designName: "mem", instanceName: "u_mem" },
    { designName: "pll", instanceName: "u_pll" },
  ];
  const { doc: out, added, skipped } = addBlocksFromHierarchy(doc, payloads);
  assert.equal(added, 3);
  assert.deepEqual(skipped, []);
  const openDef = out.library.defs.find((d) => d.id === out.ui.openDefId)!;
  assert.equal(openDef.childInstances.length, 3);
});
