// Unit test: genconn hierarchy panel adapter — parseHierarchy(JSON.stringify(dumpOutput))
// Tests that the hdl-dump object shape (returned by dftDesign.dump()) is consumable by
// parseHierarchy, which is the exact path the panel uses. No daemon, no React.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHierarchy } from "../../src/genconn/hierarchy.ts";

// A minimal dump object matching the real hdl-dump JSON (verified against soc.f output).
const SOC_DUMP = {
  schemaVersion: 1,
  rootInstanceIds: ["soc"],
  instances: {
    "soc": {
      id: "soc",
      instanceName: "soc",
      definitionId: "soc|/rtl/soc.v",
      parentInstanceId: null,
      childInstanceIds: ["soc.u_cpu", "soc.u_mem"],
      isLeaf: false,
    },
    "soc.u_cpu": {
      id: "soc.u_cpu",
      instanceName: "u_cpu",
      definitionId: "cpu|/rtl/soc.v",
      parentInstanceId: "soc",
      childInstanceIds: [],
      isLeaf: true,
    },
    "soc.u_mem": {
      id: "soc.u_mem",
      instanceName: "u_mem",
      definitionId: "mem|/rtl/soc.v",
      parentInstanceId: "soc",
      childInstanceIds: [],
      isLeaf: true,
    },
  },
  definitions: {
    "soc|/rtl/soc.v": { id: "soc|/rtl/soc.v", designName: "soc", filePath: "/rtl/soc.v" },
    "cpu|/rtl/soc.v": { id: "cpu|/rtl/soc.v", designName: "cpu", filePath: "/rtl/soc.v" },
    "mem|/rtl/soc.v": { id: "mem|/rtl/soc.v", designName: "mem", filePath: "/rtl/soc.v" },
  },
};

test("parseHierarchy accepts hdl dump output (JSON.stringify path)", () => {
  // This is the exact path the panel takes: parseHierarchy(JSON.stringify(await dftDesign.dump()))
  const h = parseHierarchy(JSON.stringify(SOC_DUMP));

  assert.equal(h.schemaVersion, 1);
  assert.deepEqual(h.rootInstanceIds, ["soc"]);
  assert.equal(Object.keys(h.instances).length, 3);
  assert.equal(Object.keys(h.definitions).length, 3);
});

test("root instance has correct children after parsing", () => {
  const h = parseHierarchy(JSON.stringify(SOC_DUMP));
  const root = h.instances["soc"];
  assert.ok(root, "root instance 'soc' must exist");
  assert.equal(root.instanceName, "soc");
  assert.equal(root.isLeaf, false);
  assert.deepEqual(root.childInstanceIds, ["soc.u_cpu", "soc.u_mem"]);
});

test("leaf instances are correctly identified", () => {
  const h = parseHierarchy(JSON.stringify(SOC_DUMP));
  const cpu = h.instances["soc.u_cpu"];
  assert.ok(cpu, "cpu instance must exist");
  assert.equal(cpu.instanceName, "u_cpu");
  assert.equal(cpu.isLeaf, true);
  assert.deepEqual(cpu.childInstanceIds, []);
});

test("definitions map is correctly built", () => {
  const h = parseHierarchy(JSON.stringify(SOC_DUMP));
  const socDef = h.definitions["soc|/rtl/soc.v"];
  assert.ok(socDef, "soc definition must exist");
  assert.equal(socDef.designName, "soc");
  assert.equal(socDef.filePath, "/rtl/soc.v");
});

test("parseHierarchy rejects dump missing instances", () => {
  const bad = { schemaVersion: 1, rootInstanceIds: [], definitions: {} };
  assert.throws(() => parseHierarchy(JSON.stringify(bad)), /instances/);
});

test("parseHierarchy rejects dump missing definitions", () => {
  const bad = { schemaVersion: 1, rootInstanceIds: [], instances: {} };
  assert.throws(() => parseHierarchy(JSON.stringify(bad)), /definitions/);
});

test("parentInstanceId is preserved from dump", () => {
  const h = parseHierarchy(JSON.stringify(SOC_DUMP));
  assert.equal(h.instances["soc"].parentInstanceId, null);
  assert.equal(h.instances["soc.u_cpu"].parentInstanceId, "soc");
});
