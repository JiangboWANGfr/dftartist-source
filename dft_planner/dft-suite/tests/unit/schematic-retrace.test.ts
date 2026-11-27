// Re-expanding a behavioural block must REPLACE its fan-in, not accumulate it.
//
// Real symptom: `assign mclk = nodiv_mclk;` has exactly ONE driver (the `assign nodiv_mclk`
// block — verified against the design), yet the canvas kept showing a superseded green `port`
// symbol for nodiv_mclk wired alongside it. Two things conspired:
//   1. input pins were APPENDED, so old `i<n>` pins survived a re-trace;
//   2. the edge filter kept any wire whose pin name still existed — and pin names are
//      POSITIONAL (`i0`, `i1`, …), reused from i0 on every rebuild, so stale wires always
//      looked live and kept their obsolete source box from being garbage-collected.

import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeId, newSchematic, pruneOrphanSources,
         type SchEdge, type SchematicGraph, type SchNode } from "../../src/hierarchy/core/schematic.ts";

const LOGIC = "logic:/d/omsp_clock_module.v:618";      // assign mclk = nodiv_mclk;
const STALE = "port:top.clock_module_0.nodiv_mclk";    // superseded source from an older trace
const FRESH = "logic:/d/omsp_clock_module.v:560";      // assign nodiv_mclk = dco_clk;

const node = (id: string, kind: SchNode["kind"], ports: SchNode["ports"]): SchNode =>
  ({ id, instanceName: id, designName: id, kind, ports });

/** The merge step of traceLogicInputs, as shipped in store.ts. */
function mergeRetrace(g: SchematicGraph, logicId: string, sources: Array<{ id: string; net: string }>) {
  const logic = g.nodes[logicId];
  const inPorts = logic.ports.filter((p) => p.direction === "out");
  const edges: SchEdge[] = [];
  sources.forEach((src, i) => {
    const pin = `i${i}`;
    inPorts.push({ name: pin, direction: "in", busLabel: src.net });
    edges.push({ id: edgeId(src.id, "o", logicId, pin), fromNode: src.id, fromPort: "o",
                 toNode: logicId, toPort: pin, netName: src.net, bus: false });
  });
  const nodes = { ...g.nodes, [logicId]: { ...logic, ports: inPorts } };
  for (const s of sources)
    if (!nodes[s.id]) nodes[s.id] = node(s.id, "logic", [{ name: "o", direction: "out", busLabel: s.net }]);
  const kept = g.edges.filter((e) => e.toNode !== logicId);
  const have = new Set(kept.map((e) => e.id));
  return pruneOrphanSources({ ...g, nodes, edges: [...kept, ...edges.filter((e) => !have.has(e.id))] });
}

test("a re-trace replaces the fan-in and collects the superseded source", () => {
  // Graph as an EARLIER trace left it: the block wired to a stale `port:` source on pin i0.
  let g = newSchematic(node("top.clock_module_0", "module", [{ name: "mclk", direction: "out", busLabel: "mclk" }]));
  g = {
    ...g,
    nodes: {
      ...g.nodes,
      [LOGIC]: node(LOGIC, "logic", [{ name: "o", direction: "out", busLabel: "mclk" },
                                     { name: "i0", direction: "in", busLabel: "nodiv_mclk" }]),
      [STALE]: node(STALE, "port", [{ name: "o", direction: "out", busLabel: "nodiv_mclk" }]),
    },
    edges: [{ id: edgeId(STALE, "o", LOGIC, "i0"), fromNode: STALE, fromPort: "o",
              toNode: LOGIC, toPort: "i0", netName: "nodiv_mclk", bus: false }],
  };

  // Re-trace: the daemon reports ONE source — the assign that really drives nodiv_mclk.
  const out = mergeRetrace(g, LOGIC, [{ id: FRESH, net: "nodiv_mclk" }]);

  // exactly one input pin, wired to the CORRECT source
  const pins = out.nodes[LOGIC].ports.filter((p) => p.direction === "in");
  assert.deepEqual(pins.map((p) => `${p.name}:${p.busLabel}`), ["i0:nodiv_mclk"]);
  assert.equal(out.edges.length, 1);
  assert.equal(out.edges[0].fromNode, FRESH);

  // the superseded source box is gone — not merely disconnected
  assert.equal(out.nodes[STALE], undefined, "stale port source must be collected");
  assert.ok(out.nodes[FRESH], "the real driver is on the graph");
});

test("pruneOrphanSources never removes real instances or the seed", () => {
  const seed = node("top.u_a", "module", [{ name: "clk", direction: "in", busLabel: "clk" }]);
  let g = newSchematic(seed);
  g = { ...g, nodes: { ...g.nodes,
        "top.u_b": node("top.u_b", "module", []),          // real instance, unwired
        "logic:/d/x.v:9": node("logic:/d/x.v:9", "logic", []) } };   // synthetic, unwired
  const out = pruneOrphanSources(g);
  assert.ok(out.nodes["top.u_a"], "seed kept");
  assert.ok(out.nodes["top.u_b"], "a real instance the user placed is kept even when unwired");
  assert.equal(out.nodes["logic:/d/x.v:9"], undefined, "orphaned synthetic source collected");
});
