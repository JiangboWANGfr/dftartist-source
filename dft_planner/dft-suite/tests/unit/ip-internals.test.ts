import { test } from "node:test"; import assert from "node:assert/strict";
import { expandIpInternals, primOfCellModule } from "../../src/hierarchy/core/ipInternals.ts";
import type { SchematicGraph } from "../../src/hierarchy/core/schematic.ts";
import type { DfxIpConeResult } from "../../src/core-bridge/model.ts";

// The planned IP box the overlay draws (flat: input list + the used output pin).
const boxGraph = (): SchematicGraph => ({
  seedId: "s",
  nodes: {
    "planip:u_dyn": {
      id: "planip:u_dyn", instanceName: "u_dyn", designName: "dfx_dynamic_hyper_ctl",
      kind: "module", isLeaf: true, planned: true,
      ports: [
        { name: "dfx_scan_mode", direction: "in", busLabel: "dfx_scan_mode · s(1)-sac(1)/asc(1)" },
        { name: "scan_enable", direction: "in", busLabel: "scan_enable · s(1)-sac(0)/asc(0)" },
        { name: "dfx_mbist_mode", direction: "in", busLabel: "dfx_mbist_mode · s(X)-sac(X)/asc(X)" },
        { name: "dfx_rst_scan_n", direction: "out", busLabel: "dfx_rst_scan_n · override_source" },
      ],
    },
    mux: { id: "mux", instanceName: "planned", designName: "dmux2_1", kind: "logic", prim: "mux",
           planned: true,
           ports: [{ name: "a", direction: "in", busLabel: "a" },
                   { name: "o", direction: "out", busLabel: "o" }] },
  },
  edges: [{ id: "pe0a", fromNode: "planip:u_dyn", fromPort: "dfx_rst_scan_n",
            toNode: "mux", toPort: "a", netName: "u_dyn/dfx_rst_scan_n", bus: false }],
  expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
});

// A miniature of the real library module: port -> and2 -> (persistent dff, input port).
const cone = (): DfxIpConeResult => ({
  instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", truncated: false,
  ports: [
    { port: "dfx_scan_mode", dir: "in", net: "dfx_scan_mode", tie: "" },
    { port: "scan_enable", dir: "in", net: "scan_enable", tie: "" },
    { port: "dfx_mbist_mode", dir: "in", net: "dfx_mbist_mode", tie: "" },
    { port: "dfx_rst_scan_n", dir: "out", net: "dfx_rst_scan_n", tie: "" },
  ],
  cells: [
    { name: "rst_and2_inst", module: "cell_and2", pins: [
      { port: "Z", dir: "out", net: "dfx_rst_scan_n", tie: "" },
      { port: "A1", dir: "in", net: "rst_scan_n_int", tie: "" },
      { port: "A2", dir: "in", net: "dfx_scan_mode", tie: "" },
    ] },
    { name: "persist_inst", module: "sig_dff", pins: [
      { port: "sig_out", dir: "out", net: "rst_scan_n_int", tie: "" },
      { port: "sig_in", dir: "in", net: "rst_scan_n_int", tie: "" },
      { port: "en", dir: "in", net: "", tie: "1'b1" },
    ] },
    { name: "unrelated_inst", module: "cell_or2", pins: [
      { port: "Z", dir: "out", net: "other_out", tie: "" },
      { port: "A1", dir: "in", net: "scan_enable", tie: "" },
    ] },
  ],
  nets: [
    { name: "dfx_rst_scan_n", s: "1", sac: "X", asc: "X" },
    { name: "rst_scan_n_int", s: "X", sac: "X", asc: "X" },
    { name: "dfx_scan_mode", s: "1", sac: "1", asc: "1" },
  ],
});

test("expandIpInternals splices the driver cone into the box", () => {
  const out = expandIpInternals(boxGraph(), "planip:u_dyn", cone(), ["dfx_rst_scan_n"]);
  // the box became a container holding exactly the cone cells — not the unrelated one
  assert.ok(out.nodes["planip:u_dyn#rst_and2_inst"], "the AND is inside");
  assert.ok(out.nodes["planip:u_dyn#persist_inst"], "the persistent cell is inside");
  assert.equal(out.nodes["planip:u_dyn#unrelated_inst"], undefined, "off-cone cells stay out");
  assert.equal(out.nodes["planip:u_dyn"].isLeaf, false, "the box is a container now");
  assert.equal(out.nodes["planip:u_dyn#rst_and2_inst"].parentId, "planip:u_dyn");
  assert.equal(out.nodes["planip:u_dyn#rst_and2_inst"].prim, "and", "cell module classified");
  assert.equal(out.nodes["planip:u_dyn#persist_inst"].prim, "dff");
  // wires: internal driver -> box output pin, values carried per phase
  const toPin = out.edges.find((e) =>
    e.fromNode === "planip:u_dyn#rst_and2_inst" && e.toNode === "planip:u_dyn" &&
    e.toPort === "dfx_rst_scan_n");
  assert.ok(toPin, "gate drives the boundary pin");
  assert.equal(toPin?.val, "s(1)-sac(X)/asc(X)");
  const feedback = out.edges.find((e) =>
    e.fromNode === "planip:u_dyn#persist_inst" && e.toNode === "planip:u_dyn#rst_and2_inst");
  assert.equal(feedback?.val, "X", "uniform three-phase value compresses to one character");
  // boundary: the module input used by the cone comes from the box frame
  const fromPort = out.edges.find((e) =>
    e.fromNode === "planip:u_dyn" && e.fromPort === "dfx_scan_mode");
  assert.ok(fromPort, "input port feeds the gate through the frame");
  // unused inputs are dropped from the frame; used + outputs stay
  const names = out.nodes["planip:u_dyn"].ports.map((p) => p.name);
  assert.ok(names.includes("dfx_scan_mode") && names.includes("dfx_rst_scan_n"));
  assert.ok(!names.includes("dfx_mbist_mode"), "dead inputs no longer widen the frame");
  // a tie shows on the pin label instead of a wire to nowhere
  const en = out.nodes["planip:u_dyn#persist_inst"].ports.find((p) => p.name === "en");
  assert.equal(en?.busLabel, "en = 1'b1");
});

test("no cone data or unknown pins leave the graph untouched", () => {
  const g = boxGraph();
  assert.equal(expandIpInternals(g, "planip:u_dyn",
    { instance: "", module: "", truncated: false, ports: [], cells: [], nets: [] },
    ["dfx_rst_scan_n"]), g);
  assert.equal(expandIpInternals(g, "planip:nope", cone(), ["dfx_rst_scan_n"]), g);
  assert.equal(expandIpInternals(g, "planip:u_dyn", cone(), []), g);
});

test("primOfCellModule ordering: nand before and, xnor before nor", () => {
  assert.equal(primOfCellModule("cell_nand2"), "nand");
  assert.equal(primOfCellModule("cell_and2"), "and");
  assert.equal(primOfCellModule("cell_xnor2"), "xnor");
  assert.equal(primOfCellModule("cell_nor2"), "nor");
  assert.equal(primOfCellModule("INV_X1"), "not");
  assert.equal(primOfCellModule("dmux2_1"), "mux");
  assert.equal(primOfCellModule("sig_dff"), "dff");
  assert.equal(primOfCellModule("weird_cell"), undefined);
});


// A gate-level library stitches cells with assigns. A buf assign is a WIRE (seen through, no
// node); an expr assign is a generic box; the chain port <- assign(buf) <- assign(expr) <- cell
// must reach the cell — this exact break was "dfx_rst_scan_n 完全没有显示".
test("assign chains: buf wires through, expr draws, the cone survives aliases", () => {
  const c: DfxIpConeResult = {
    instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", truncated: false,
    ports: [
      { port: "dfx_rst_scan_n", dir: "out", net: "dfx_rst_scan_n", tie: "" },
      { port: "lbist_rst_scan_n", dir: "in", net: "lbist_rst_scan_n", tie: "" },
      { port: "dfx_mbist_mode", dir: "in", net: "dfx_mbist_mode", tie: "" },
    ],
    cells: [
      { name: "assign@dfx_rst_scan_n", module: "assign_buf", pins: [
        { port: "z", dir: "out", net: "dfx_rst_scan_n", tie: "" },
        { port: "a", dir: "in", net: "rst_mix", tie: "" },
      ] },
      { name: "assign@rst_mix", module: "assign", pins: [
        { port: "z", dir: "out", net: "rst_mix", tie: "" },
        { port: "a0", dir: "in", net: "rst_or_out", tie: "" },
        { port: "a1", dir: "in", net: "lbist_rst_scan_n", tie: "" },
      ] },
      { name: "or3_persist", module: "cell_or3", pins: [
        { port: "Z", dir: "out", net: "rst_or_out", tie: "" },
        { port: "A1", dir: "in", net: "dfx_mbist_mode", tie: "" },
      ] },
    ],
    nets: [
      { name: "dfx_rst_scan_n", s: "1", sac: "0", asc: "1" },
      { name: "rst_mix", s: "1", sac: "0", asc: "1" },
      { name: "rst_or_out", s: "X", sac: "X", asc: "X" },
    ],
  };
  const gg = boxGraph();
  gg.nodes["planip:u_dyn"].ports = [
    { name: "lbist_rst_scan_n", direction: "in", busLabel: "lbist_rst_scan_n" },
    { name: "dfx_mbist_mode", direction: "in", busLabel: "dfx_mbist_mode" },
    { name: "dfx_rst_scan_n", direction: "out", busLabel: "dfx_rst_scan_n" },
  ];
  const out = expandIpInternals(gg, "planip:u_dyn", c, ["dfx_rst_scan_n"]);
  assert.equal(out.nodes["planip:u_dyn#assign@dfx_rst_scan_n"], undefined,
               "the buf assign is a wire, not a node");
  const expr = out.nodes["planip:u_dyn#assign@rst_mix"];
  assert.ok(expr, "the expr assign draws");
  assert.equal(expr.designName, "assign");
  assert.equal(expr.instanceName, "rst_mix", "captioned by the net it drives");
  assert.ok(out.nodes["planip:u_dyn#or3_persist"], "…and the chain reaches the real cell");
  // the boundary pin is fed THROUGH the buf by the expr assign, phases differing -> full label
  const toPin = out.edges.find((e) => e.toNode === "planip:u_dyn" && e.toPort === "dfx_rst_scan_n");
  assert.equal(toPin?.fromNode, "planip:u_dyn#assign@rst_mix");
  assert.equal(toPin?.val, "s(1)-sac(0)/asc(1)", "differing phases keep the full label");
});

// The slang decomposition of an assign RHS arrives as primitive cells (module = kind,
// label = display text). A `sel ? a : b` must draw as a real MUX with its s pin — the
// opaque 3-input box lost the select direction ("非常危险").
test("decomposed assign draws real primitives (MUX with s/a/b)", () => {
  const c: DfxIpConeResult = {
    instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", truncated: false,
    ports: [
      { port: "dfx_rst_scan_n", dir: "out", net: "dfx_rst_scan_n", tie: "" },
      { port: "dfx_lbist_mode", dir: "in", net: "dfx_lbist_mode", tie: "" },
      { port: "lbist_rst_scan_n", dir: "in", net: "lbist_rst_scan_n", tie: "" },
    ],
    cells: [
      { name: "assign@dfx_rst_scan_n.c0", module: "mux", label: "MUX", pins: [
        { port: "z", dir: "out", net: "dfx_rst_scan_n", tie: "" },
        { port: "s", dir: "in", net: "dfx_lbist_mode", tie: "" },
        { port: "a", dir: "in", net: "lbist_rst_scan_n", tie: "" },
        { port: "b", dir: "in", net: "inner", tie: "" },
      ] },
      { name: "or3", module: "cell_or3", pins: [
        { port: "Z", dir: "out", net: "inner", tie: "" },
        { port: "A1", dir: "in", net: "dfx_lbist_mode", tie: "" },
      ] },
    ],
    nets: [{ name: "dfx_rst_scan_n", s: "1", sac: "0", asc: "1" }],
  };
  const gg = boxGraph();
  gg.nodes["planip:u_dyn"].ports = [
    { name: "dfx_lbist_mode", direction: "in", busLabel: "dfx_lbist_mode" },
    { name: "lbist_rst_scan_n", direction: "in", busLabel: "lbist_rst_scan_n" },
    { name: "dfx_rst_scan_n", direction: "out", busLabel: "dfx_rst_scan_n" },
  ];
  const out = expandIpInternals(gg, "planip:u_dyn", c, ["dfx_rst_scan_n"]);
  const mux = out.nodes["planip:u_dyn#assign@dfx_rst_scan_n.c0"];
  assert.ok(mux, "the decomposed cell draws");
  assert.equal(mux.prim, "mux", "…as a real MUX glyph");
  assert.equal(mux.designName, "MUX", "…labeled by the decomposer's text");
  assert.equal(mux.instanceName, "dfx_rst_scan_n", "captioned by the driven net");
  assert.ok(mux.ports.some((p) => p.name === "s" && p.direction === "in"),
            "the select pin survives — that direction was the dangerous loss");
  assert.ok(out.nodes["planip:u_dyn#or3"], "the b-arm chain keeps tracing");
});
