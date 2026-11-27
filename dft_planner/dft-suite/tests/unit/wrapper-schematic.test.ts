import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWrapperSchematic } from "../../src/hierarchy/core/wrapperSchematic.ts";
import type { SchNode } from "../../src/hierarchy/core/schematic.ts";
import type { WrapperConeResult } from "../../src/core-bridge/model.ts";

// The real `nmi` cone from processor_core, verbatim from the daemon:
//   L0 port nmi | L1 net nmi (PROCESSOR_1) | L2 net nmi (…/sfr_0) | L3 gate xor
//   L4 net nmi_pol | L5 net nmi_capture | L6 net data_in | L7 flop data_sync[0]
const N = (id: string, kind: string, label: string, scope: string, level: number, elem = "",
           clock = "") =>
  ({ id, kind, label, scope, level, elem, clock, detail: elem ? "assign" : "",
     instance: scope ? `processor_core.${scope.replace(/\//g, ".")}` : "processor_core" });

const CONE = {
  core: "processor_core", port: "nmi", name: "nmi", bit: 0, dir: "in",
  decision: "shared", reason: "",
  cell: "PROCESSOR_1/sfr_0/sync_cell_nmi/data_sync[0]",
  truncated: false,
  nodes: [
    N("p", "port", "nmi", "", 0),
    N("n1", "net", "nmi", "PROCESSOR_1", 1),
    N("n2", "net", "nmi", "PROCESSOR_1/sfr_0", 2),
    N("g", "gate", "nmi_pol", "PROCESSOR_1/sfr_0", 3, "xor"),
    N("n3", "net", "nmi_pol", "PROCESSOR_1/sfr_0", 4),
    N("n4", "net", "nmi_capture", "PROCESSOR_1/sfr_0", 5),
    N("n5", "net", "data_in", "PROCESSOR_1/sfr_0/sync_cell_nmi", 6),
    N("f", "flop", "data_sync[0]", "PROCESSOR_1/sfr_0/sync_cell_nmi", 7, "", "clk"),
  ],
  edges: [
    { from: "p", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "g" },
    { from: "g", to: "n3" }, { from: "n3", to: "n4" }, { from: "n4", to: "n5" },
    { from: "n5", to: "f" },
  ],
} as unknown as WrapperConeResult;

const build = () => buildWrapperSchematic(CONE, { core: "processor_core", seedId: "wrapsch:cone" });

/** Nodes are keyed by DESIGN PATH now, so the tests look them up by role — which is also what
 *  keeps them honest if the id scheme changes again. */
const role = (g: { nodes: Record<string, SchNode> }, want: "port" | "gate" | "flop" | "clk") =>
  Object.values(g.nodes).filter((n) =>
    want === "flop" ? n.prim === "dff"
    : want === "gate" ? !!n.prim && n.prim !== "dff"
    : want === "clk" ? n.kind === "port" && n.instanceName === "clock"
    : n.kind === "port" && n.instanceName !== "clock");
const one = (g: { nodes: Record<string, SchNode> }, want: "port" | "gate" | "flop" | "clk") => {
  const hits = role(g, want);
  assert.equal(hits.length, 1, `expected exactly one ${want}, got ${hits.length}`);
  return hits[0];
};

test("net bits become WIRES, not boxes", () => {
  const g = build();
  const drawn = Object.values(g.nodes).filter((n) => n.kind !== "module");
  // port + xor + dff + the clock source. The five intermediate nets are wires.
  assert.equal(drawn.length, 4);
  assert.equal(role(g, "gate").length, 1);
});

test("node ids are DESIGN PATHS the object-name bar can resolve", () => {
  const g = build();
  // "processor_core|nmi|0" is not a path anything can resolve; these prefixes are the ones the
  // rest of the tool already maps back to real objects.
  assert.equal(one(g, "port").id, "port:processor_core.nmi");
  assert.equal(one(g, "flop").id,
    "ff:wrap:processor_core.PROCESSOR_1.sfr_0.sync_cell_nmi:data_sync[0]");
  assert.equal(one(g, "gate").id, "g:processor_core.PROCESSOR_1.sfr_0:nmi_pol");
  for (const id of Object.keys(g.nodes)) assert.equal(id.includes("|"), false);
});

test("the port pentagon is labelled with the PORT BIT, not with its direction", () => {
  const g = build();
  assert.equal(one(g, "port").designName, "nmi");
  assert.equal(one(g, "port").instanceName, "input port");
});

test("symbols carry the primitive the renderer draws", () => {
  const g = build();
  assert.equal(one(g, "port").kind, "port");
  assert.equal(one(g, "gate").prim, "xor");
  assert.equal(one(g, "flop").prim, "dff");
  assert.equal(one(g, "flop").alert, true, "the chosen cell gets the alert outline");
});

test("the flop is named, with the clock it shifts on", () => {
  const g = build();
  assert.equal(one(g, "flop").designName, "data_sync[0]  clk clk");
});

test("the clock is drawn as a source into the CLK pin", () => {
  const g = build();
  const clk = one(g, "clk");
  assert.equal(clk.designName, "clk");
  const e = g.edges.find((x) => x.fromNode === clk.id);
  assert.ok(e, "the clock must reach the flop");
  assert.equal(e!.toNode, one(g, "flop").id);
  assert.equal(e!.toPort, "clk", "…on the clock pin, not the D pin");
});

test("the chain is port -> gate -> flop, and each wire keeps its net name", () => {
  const g = build();
  const p = one(g, "port").id, gt = one(g, "gate").id, f = one(g, "flop").id;
  const e = (from: string, to: string) => g.edges.find((x) => x.fromNode === from && x.toNode === to);
  assert.ok(e(p, gt), "port drives the gate");
  assert.ok(e(gt, f), "the gate drives the flop");
  assert.equal(e(p, gt)!.netName, "nmi");
  assert.equal(e(gt, f)!.netName, "data_in");
  assert.equal(e(gt, f)!.toPort, "d", "data lands on D");
});

test("containers follow the real instance hierarchy", () => {
  const g = build();
  assert.equal(g.nodes["PROCESSOR_1"].kind, "module");
  assert.equal(g.nodes["PROCESSOR_1/sfr_0"].parentId, "PROCESSOR_1");
  assert.equal(one(g, "gate").parentId, "PROCESSOR_1/sfr_0");
  assert.equal(one(g, "flop").parentId, "PROCESSOR_1/sfr_0/sync_cell_nmi");
  assert.equal(one(g, "port").parentId, undefined);
});

// An OUTPUT cone is walked BACKWARD from the port to whatever drives it, so walk order runs
// against the signal. Drawn as-is it showed the output port driving the flop's D pin.
const OUT_CONE = {
  ...CONE, port: "p1_dout_en", name: "p1_dout_en[3]", dir: "out",
  cell: "GPIO_1/p1dir[3]",
  nodes: [
    N("p", "port", "p1_dout_en[3]", "", 0),
    N("n1", "net", "p1_dout_en[3]", "GPIO_1", 1),
    N("f", "flop", "p1dir[3]", "GPIO_1", 2, "", "mclk"),
  ],
  edges: [{ from: "p", to: "n1" }, { from: "n1", to: "f" }],
} as unknown as WrapperConeResult;

test("an output is driven BY its flop, not the other way round", () => {
  const g = buildWrapperSchematic(OUT_CONE, { core: "processor_core", seedId: "s" });
  const p = one(g, "port").id, f = one(g, "flop").id;
  const data = g.edges.filter((x) => x.toPort !== "clk");
  assert.equal(data.length, 1);
  assert.equal(data[0].fromNode, f, "the flop is the driver");
  assert.equal(data[0].fromPort, "q");
  assert.equal(data[0].toNode, p, "the output port is the sink");
  assert.equal(data[0].toPort, "i", "…into the port, never onto a D pin");
});

test("an output port is a SINK: its pin is an input", () => {
  const g = buildWrapperSchematic(OUT_CONE, { core: "processor_core", seedId: "s" });
  assert.deepEqual(one(g, "port").ports.map((p) => [p.name, p.direction]), [["i", "in"]]);
  assert.equal(one(g, "port").designName, "p1_dout_en[3]");
  assert.deepEqual(one(build(), "port").ports.map((p) => [p.name, p.direction]), [["o", "out"]]);
});

test("a flop that is NOT the chosen cell is drawn without the alert", () => {
  const other = { ...CONE, cell: "somewhere/else[0]" } as WrapperConeResult;
  const g = buildWrapperSchematic(other, { core: "processor_core", seedId: "s" });
  assert.equal(one(g, "flop").alert, undefined);
});

test("the graph is a complete SchematicGraph the store can hold", () => {
  const g = build();
  assert.equal(g.seedId, "wrapsch:cone");
  for (const k of ["expanded", "empty", "inExpanded", "inEmpty"] as const)
    assert.deepEqual(g[k], {});
});

// ---- a DEDICATED port must show the cell that gets ADDED -----------------------------------
// Its cone is the REASON sharing failed; drawn alone it shows everything except the answer.
const DED_CONE = {
  ...CONE, port: "cpu_en", name: "cpu_en", dir: "in", decision: "dedicated",
  reason: "max identified cells", cell: "",
  nodes: [
    N("p", "port", "cpu_en", "", 0),
    N("n1", "net", "cpu_en", "PROCESSOR_1", 1),
    N("f", "flop", "tar[0]", "U_2", 2, "", "mclk"),
  ],
  edges: [{ from: "p", to: "n1" }, { from: "n1", to: "f" }],
} as unknown as WrapperConeResult;

test("a dedicated port draws the NEW cell, flagged as an addition", () => {
  const g = buildWrapperSchematic(DED_CONE, { core: "processor_core", seedId: "s" });
  const added = Object.values(g.nodes).find((n) => n.id.startsWith("ff:wrap:new:"));
  assert.ok(added, "the inserted cell has to be on the drawing");
  assert.equal(added!.prim, "dff");
  assert.equal(added!.alert, true);
  assert.match(added!.designName, /dedicated wrapper cell/);

  // it TAPS the boundary — an input cell hangs off the port, it is not spliced into the wire
  const tap = g.edges.find((e) => e.toNode === added!.id && e.toPort === "d");
  assert.ok(tap, "the new cell must be driven from the boundary");
  assert.equal(tap!.fromNode, one(g, "port").id);
  // and the functional path to the cone flop is untouched
  assert.ok(g.edges.some((e) => e.fromNode === one(g, "port").id && e.toPort === "d" &&
                                e.toNode !== added!.id));
});

test("a shared port adds no new cell", () => {
  const g = build();
  assert.equal(Object.values(g.nodes).some((n) => n.id.startsWith("ff:wrap:new:")), false);
});
