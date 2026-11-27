// The builder against VERBATIM daemon output, so a shape change in the engine fails here rather
// than silently producing an empty drawing in the modal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWrapperSchematic } from "../../src/hierarchy/core/wrapperSchematic.ts";
import type { WrapperConeResult } from "../../src/core-bridge/model.ts";

// `hdl serve` → wrapper-cone {port: p1_dout, bit: 0} on processor_core, copied as-is.
const REAL = {
  core: "processor_core", port: "p1_dout", name: "p1_dout[0]", bit: 0, dir: "out",
  decision: "shared", reason: "", cell: "GPIO_1/p1out[0]", truncated: false,
  nodes: [
    { id: "processor_core|p1_dout|0", kind: "port", elem: "", detail: "",
      label: "p1_dout[0]", instance: "processor_core", scope: "", level: 0 },
    { id: "processor_core.GPIO_1|p1_dout|0", kind: "net", elem: "", detail: "",
      label: "p1_dout[0]", instance: "processor_core.GPIO_1", scope: "GPIO_1", level: 1 },
    { id: "processor_core.GPIO_1|p1out|0", kind: "net", elem: "", detail: "",
      label: "p1out[0]", instance: "processor_core.GPIO_1", scope: "GPIO_1", level: 2 },
    { id: "flop:processor_core.GPIO_1|p1out|0", kind: "flop", elem: "", detail: "",
      label: "p1out[0]", instance: "processor_core.GPIO_1", scope: "GPIO_1", level: 3 },
  ],
  edges: [
    { from: "processor_core|p1_dout|0", to: "processor_core.GPIO_1|p1_dout|0" },
    { from: "processor_core.GPIO_1|p1_dout|0", to: "processor_core.GPIO_1|p1out|0" },
    { from: "processor_core.GPIO_1|p1out|0", to: "flop:processor_core.GPIO_1|p1out|0" },
  ],
} as unknown as WrapperConeResult;

const PORT = "port:processor_core.p1_dout[0]";
const FLOP = "ff:wrap:processor_core.GPIO_1:p1out[0]";

test("a real SHARED OUTPUT cone produces a drawable graph", () => {
  const g = buildWrapperSchematic(REAL, { core: "processor_core", seedId: "wrapsch:cone" });

  // it must not come out empty — an empty graph is a blank modal
  assert.ok(Object.keys(g.nodes).length >= 3, "port + flop + container");
  assert.ok(g.edges.length >= 1, "the flop has to reach the port");

  assert.equal(g.nodes[PORT].designName, "p1_dout[0]");
  assert.equal(g.nodes[FLOP].prim, "dff");
  assert.equal(g.nodes[FLOP].alert, true, "GPIO_1/p1out[0] is the chosen cell");
  assert.equal(g.nodes["GPIO_1"].kind, "module");

  const e = g.edges.find((x) => x.fromNode === FLOP);
  assert.ok(e, "the flop drives");
  assert.equal(e!.fromPort, "q");
  assert.equal(e!.toNode, PORT);
  assert.equal(e!.toPort, "i");
  // nothing but the CLOCK may point into the flop: the drawing is what drives the output
  assert.equal(g.edges.some((x) => x.toNode === FLOP && x.toPort !== "clk"), false);
  // and nothing leaves the output port
  assert.equal(g.edges.some((x) => x.fromNode === PORT), false);
});

test("every edge endpoint exists as a node", () => {
  const g = buildWrapperSchematic(REAL, { core: "processor_core", seedId: "s" });
  for (const e of g.edges) {
    assert.ok(g.nodes[e.fromNode], `missing source node ${e.fromNode}`);
    assert.ok(g.nodes[e.toNode], `missing target node ${e.toNode}`);
    const f = g.nodes[e.fromNode].ports.find((p) => p.name === e.fromPort);
    const t = g.nodes[e.toNode].ports.find((p) => p.name === e.toPort);
    assert.ok(f && f.direction === "out", `${e.fromNode}.${e.fromPort} must be an output pin`);
    assert.ok(t && t.direction !== "out", `${e.toNode}.${e.toPort} must be an input pin`);
  }
});
