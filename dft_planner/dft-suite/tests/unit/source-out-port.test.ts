// The edge out of a trace SOURCE must name a pin the source node really has. The convention
// (sourceOutPort: port→"o", gate→"y", instance→label) is wrong for exactly one node shape:
// an INNER module's port renders as the owner OUTLINE box whose out pin is the PORT NAME.
// A convention-only edge made ELK abort the whole layout ("Referenced shape does not exist:
// …mclko") — on screen, the sync_cell_taclk clk/data_in/rst clicks silently did nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceNodeOutPort, sourceOutPort } from "../../src/hierarchy/core/schematic.ts";
import type { SchNode } from "../../src/hierarchy/core/schematic.ts";

const ownerOutline: SchNode = {
  id: "port:processor_core.U_2.mclk", instanceName: "U_2", designName: "omsp_timerA",
  kind: "module", isLeaf: true, realPath: "processor_core.U_2",
  ports: [{ name: "mclk", direction: "out", busLabel: "mclk" }],
};

test("inner-module port source: edge uses the outline box's REAL pin, not 'o'", () => {
  const fallback = sourceOutPort({ kind: "port", label: "mclk" });
  assert.equal(fallback, "o"); // the convention alone would reference a nonexistent pin
  assert.equal(sourceNodeOutPort(ownerOutline, fallback), "mclk");
});

test("every other shape keeps the convention", () => {
  // design-top flag (kind "port") — pin IS "o"
  const flag: SchNode = { id: "port:soc.clk", instanceName: "clk", designName: "clk",
    kind: "port", ports: [{ name: "o", direction: "out", busLabel: "clk" }] };
  assert.equal(sourceNodeOutPort(flag, "o"), "o");
  // instance driver — real port name from the daemon label
  assert.equal(sourceNodeOutPort(undefined, sourceOutPort({ kind: "instance", label: "q" })), "q");
  // plain module box that is NOT a port: source (id has no port: prefix) is untouched even
  // if its first out pin differs from the fallback
  const box: SchNode = { id: "soc.u_x", instanceName: "u_x", designName: "x",
    kind: "module", ports: [{ name: "z", direction: "out", busLabel: "z" }] };
  assert.equal(sourceNodeOutPort(box, "q"), "q");
});
