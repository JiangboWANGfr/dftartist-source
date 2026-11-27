// A trace answering "this net is an input port" is NOT the end of the trace: the driver lives
// at the parent's port connection, reachable through the owner box's pin fanin. These lock down
// the sync_cell_puc case — clk/data_in/rst rendered as dead port pentagons inside the container
// instead of wiring to (and, when missing, adding) the container's real boundary pins.

import { test } from "node:test";
import assert from "node:assert/strict";
import { portSourceBoundary, withBoundaryPin, type SchNode } from "../../src/hierarchy/core/schematic.ts";

const box = (id: string, ports: SchNode["ports"] = []): SchNode =>
  ({ id, instanceName: id, designName: "sync_cell", kind: "module", ports, isLeaf: false });

const SC = "processor_core.PROCESSOR_1.clock_module_0.sync_cell_puc";

test("resolves a port source to its on-canvas owner box", () => {
  const nodes: Record<string, SchNode> = { [SC]: box(SC) };
  const hit = portSourceBoundary(
    { kind: "port", id: `port:${SC}.clk`, label: "clk", net: "clk" },
    (id) => nodes[id]);
  assert.deepEqual(hit, { ownerId: SC, pin: "clk" });
});

test("owner not on canvas -> null (pentagon fallback stays)", () => {
  const hit = portSourceBoundary(
    { kind: "port", id: `port:${SC}.clk`, label: "clk", net: "clk" },
    () => undefined);
  assert.equal(hit, null);
});

test("non-port sources and malformed ids are left alone", () => {
  const nodes: Record<string, SchNode> = { [SC]: box(SC) };
  const lookup = (id: string) => nodes[id];
  assert.equal(portSourceBoundary(
    { kind: "logic", id: `logic:${SC}:/d/m.v:12`, label: "assign", net: "clk" }, lookup), null);
  assert.equal(portSourceBoundary(
    { kind: "port", id: "not-a-port-id", label: "clk", net: "clk" }, lookup), null);
});

test("a pin name containing dots still parses (id ends with .<pin>)", () => {
  const nodes: Record<string, SchNode> = { [SC]: box(SC) };
  const hit = portSourceBoundary(
    { kind: "port", id: `port:${SC}.data_in`, label: "data_in", net: "data_in" },
    (id) => nodes[id]);
  assert.deepEqual(hit, { ownerId: SC, pin: "data_in" });
});

test("withBoundaryPin adds a missing input pin and is idempotent", () => {
  const b0 = box(SC, [{ name: "rst", direction: "in", busLabel: "rst" }]);
  const b1 = withBoundaryPin(b0, "clk");
  assert.deepEqual(b1.ports.map((p) => p.name), ["rst", "clk"]);
  assert.equal(b1.ports.find((p) => p.name === "clk")?.direction, "in");
  // already present -> the SAME object back, so no spurious re-layout
  assert.equal(withBoundaryPin(b1, "clk"), b1);
  // the original box is untouched (state updates must stay immutable)
  assert.equal(b0.ports.length, 1);
});
