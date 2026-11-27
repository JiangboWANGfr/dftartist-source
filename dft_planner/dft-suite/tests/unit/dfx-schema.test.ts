import { test } from "node:test";
import assert from "node:assert/strict";
import { deserialize, serialize, CURRENT_SCHEMA_VERSION, emptyDocument } from "../../src/genconn/core/document.ts";

test("schema version is 3", () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
});

test("v1 document migrates: ctrlIps/counters/dfxInstances defaulted, version bumped", () => {
  const v1 = JSON.parse(serialize(emptyDocument("chip")));
  v1.schemaVersion = 1;
  delete v1.ctrlIps; delete v1.dfxInstances; delete v1.moduleDsNext; delete v1.muxDsNext;
  const doc = deserialize(JSON.stringify(v1));
  assert.equal(doc.schemaVersion, 3);
  assert.deepEqual(doc.ctrlIps, []);
  assert.deepEqual(doc.dfxInstances, []);
  assert.equal(doc.moduleDsNext, 1);
  assert.equal(doc.muxDsNext, 1);
});

test("v2 document migrates: ctrlIps preserved, dfxInstances defaulted, version bumped to 3", () => {
  const d = emptyDocument("chip");
  d.ctrlIps.push({
    spec: { schemaVersion: 2, moduleBase: "pll_ctrl", dsIndex: 1, pins: [] },
    ctrlInstId: "i1", targets: {},
  });
  d.moduleDsNext = 2; d.muxDsNext = 3;
  const raw = JSON.parse(serialize(d));
  raw.schemaVersion = 2;
  delete raw.dfxInstances;                       // v2 文档没有该字段
  const back = deserialize(JSON.stringify(raw));
  assert.equal(back.schemaVersion, 3);
  assert.deepEqual(back.dfxInstances, []);        // migrate 兜底
  assert.equal(back.ctrlIps.length, 1);           // ctrlIps 保留
  assert.equal(back.ctrlIps[0].spec.moduleBase, "pll_ctrl");
  assert.equal(back.moduleDsNext, 2);
  assert.equal(back.muxDsNext, 3);
});

test("v2 document round-trips ctrlIps untouched", () => {
  const d = emptyDocument("chip");
  d.ctrlIps.push({
    spec: {
      schemaVersion: 2, moduleBase: "pll_ctrl", dsIndex: 1,
      pins: [{ portName: "enable", mode: "control", width: 1, stitch: "mux",
               target: "PLL_1/enable", muxName: "u_dfx_PLL_1_enable_persistent_mux_inst_ds1" }],
    },
    ctrlInstId: "i123",
    targets: { "top.PLL_1": "i45" },
  });
  d.moduleDsNext = 2; d.muxDsNext = 2;
  const back = deserialize(serialize(d));
  assert.equal(back.ctrlIps.length, 1);
  assert.equal(back.ctrlIps[0].spec.moduleBase, "pll_ctrl");
  assert.equal(back.muxDsNext, 2);
});

test("v1 doc that already carries ctrlIps data keeps it through migrate", () => {
  const d = emptyDocument("chip");
  d.ctrlIps.push({ spec: { schemaVersion: 2, moduleBase: "m", dsIndex: 1, pins: [] },
                   ctrlInstId: "i1", targets: {} });
  d.moduleDsNext = 5; d.muxDsNext = 9;
  const raw = JSON.parse(serialize(d));
  raw.schemaVersion = 1;                       // loadExample autosave 场景
  const back = deserialize(JSON.stringify(raw));
  assert.equal(back.schemaVersion, 3);
  assert.equal(back.ctrlIps.length, 1);        // 不得被迁移清空
  assert.equal(back.moduleDsNext, 5);
  assert.equal(back.muxDsNext, 9);
});
