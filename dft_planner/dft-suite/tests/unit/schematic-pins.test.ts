// Signal identity on the schematic. Two bugs this locks down (both user-reported, both from
// pin/source identity NOT being the signal):
//   1. "two dco_clk inputs" — expand-inputs named pins positionally (i0, i1) while decompose
//      named them by signal; dedupe compares names, so one signal became two pins.
//   2. "floating nodiv_mclk net" — decompose invented a source tap for an internal net even
//      when the box DRIVING that net (the sibling `assign nodiv_mclk`) was already on canvas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findDriverOutput, type SchNode } from "../../src/hierarchy/core/schematic.ts";

const node = (id: string, ports: SchNode["ports"],
              extra: Partial<SchNode> = {}): SchNode =>
  ({ id, instanceName: id, designName: id, kind: "logic", ports, ...extra });

const CM = "top.PROCESSOR_1.clock_module_0";

test("finds the sibling assign block that drives an internal net (the nodiv_mclk case)", () => {
  const nodes: Record<string, SchNode> = {
    // the driver: an expanded `assign nodiv_mclk` block — out pin is named "o", the SIGNAL
    // lives in its busLabel, exactly how makeSourceNode builds logic nodes
    "logic:/d/m.v:560": node("logic:/d/m.v:560",
      [{ name: "o", direction: "out", busLabel: "nodiv_mclk" },
       { name: "dco_clk", direction: "in", busLabel: "dco_clk" }],
      { parentId: CM }),
    // an unrelated instance
    "top.u_x": node("top.u_x", [{ name: "q", direction: "out", busLabel: "q" }], { kind: "module" }),
  };
  const hit = findDriverOutput(nodes, "nodiv_mclk", { exclude: "logic:/d/m.v:618", parentId: CM });
  assert.deepEqual(hit, { nodeId: "logic:/d/m.v:560", port: "o" });
});

test("matches an instance output by PORT NAME and prefers the same scope", () => {
  const nodes: Record<string, SchNode> = {
    "top.other.u_far": node("top.other.u_far",
      [{ name: "mclk", direction: "out", busLabel: "mclk" }], { kind: "module", parentId: "top.other" }),
    "top.here.u_near": node("top.here.u_near",
      [{ name: "mclk", direction: "out", busLabel: "mclk" }], { kind: "module", parentId: "top.here" }),
  };
  assert.deepEqual(findDriverOutput(nodes, "mclk", { parentId: "top.here" }),
                   { nodeId: "top.here.u_near", port: "mclk" });
  // no scope preference -> any match is acceptable, but it must find one
  assert.ok(findDriverOutput(nodes, "mclk"));
});

test("never picks a net tap, the block itself, or the block's internals as a driver", () => {
  const blk = "logic:/d/m.v:618";
  const nodes: Record<string, SchNode> = {
    // a tap for the same signal from an earlier decompose — a stand-in, not a driver
    [`${blk}@nodiv_mclk`]: node(`${blk}@nodiv_mclk`,
      [{ name: "o", direction: "out", busLabel: "nodiv_mclk" }], { kind: "port", netTap: true }),
    // the block itself and one of its internal cells expose out pins too
    [blk]: node(blk, [{ name: "o", direction: "out", busLabel: "nodiv_mclk" }]),
    [`${blk}#c0`]: node(`${blk}#c0`, [{ name: "o", direction: "out", busLabel: "nodiv_mclk" }]),
  };
  assert.equal(findDriverOutput(nodes, "nodiv_mclk", { exclude: blk }), null,
               "with no real driver on canvas the caller must fall back to a tap");
});
