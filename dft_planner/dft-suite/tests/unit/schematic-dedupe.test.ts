// DRC-debug "乱显示" regression: repeated traces stacked duplicates of things the canvas
// already showed — three reset_n pentagons, and `assign por_a = ~reset_n` drawn twice (the
// walk's inferred gate symbol AND a freshly created logic box). findExistingSource is the
// one place that answers "is this trace source already on the canvas?".

import { test } from "node:test";
import assert from "node:assert/strict";
import { findExistingSource, type SchNode } from "../../src/hierarchy/core/schematic.ts";

const CM = "processor_core.PROCESSOR_1.clock_module_0";
const F = "/d/omsp_clock_module.v";

test("logic source matching an existing gate node's loc reuses it (the double-inverter case)", () => {
  // the walk's inferred inverter for `assign por_a = ~reset_n` at F:118
  const gate: SchNode = {
    id: `g:${CM}:por_a`, instanceName: "por_a", designName: "inv", kind: "logic", prim: "inv",
    loc: { file: F, line: 118 },
    ports: [{ name: "a", direction: "in", busLabel: "reset_n" },
            { name: "o", direction: "out", busLabel: "por_a" }],
  };
  const hit = findExistingSource({ [gate.id]: gate },
    { kind: "logic", id: `logic:${CM}:${F}:118`, label: "assign", net: "por_a", file: F, line: 118 });
  assert.deepEqual(hit, { nodeId: gate.id, port: "o" });
});

test("logic source at a DIFFERENT line is not merged", () => {
  const gate: SchNode = {
    id: `g:${CM}:por_a`, instanceName: "por_a", designName: "inv", kind: "logic", prim: "inv",
    loc: { file: F, line: 118 },
    ports: [{ name: "o", direction: "out", busLabel: "por_a" }],
  };
  assert.equal(findExistingSource({ [gate.id]: gate },
    { kind: "logic", id: `logic:${CM}:${F}:220`, label: "assign", net: "x", file: F, line: 220 }), null);
});

test("port source matching an existing pentagon's signal reuses it (three reset_n case)", () => {
  const pent: SchNode = {
    id: "pi:processor_core:reset_n", instanceName: "unconstrained (Z)", designName: "reset_n",
    kind: "port", ports: [{ name: "o", direction: "out", busLabel: "reset_n" }],
  };
  const hit = findExistingSource({ [pent.id]: pent },
    { kind: "port", id: "port:processor_core.reset_n", label: "reset_n", net: "reset_n" });
  assert.deepEqual(hit, { nodeId: pent.id, port: "o" });
});

test("net taps and other-signal ports never match", () => {
  const tap: SchNode = {
    id: "logic:x@n", instanceName: "n", designName: "n", kind: "port", netTap: true,
    ports: [{ name: "o", direction: "out", busLabel: "reset_n" }],
  };
  const other: SchNode = {
    id: "pi:top:clk", instanceName: "clk", designName: "clk",
    kind: "port", ports: [{ name: "o", direction: "out", busLabel: "clk" }],
  };
  const nodes = { [tap.id]: tap, [other.id]: other };
  assert.equal(findExistingSource(nodes,
    { kind: "port", id: "port:top.reset_n", label: "reset_n", net: "reset_n" }), null);
});

test("the source's own id is skipped (id reuse is the callers' existing path)", () => {
  const self: SchNode = {
    id: "port:top.rst", instanceName: "rst", designName: "rst",
    kind: "port", ports: [{ name: "o", direction: "out", busLabel: "rst" }],
  };
  assert.equal(findExistingSource({ [self.id]: self },
    { kind: "port", id: "port:top.rst", label: "rst", net: "rst" }), null);
});
