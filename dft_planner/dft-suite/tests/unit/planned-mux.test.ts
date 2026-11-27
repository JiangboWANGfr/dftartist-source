import { test } from "node:test"; import assert from "node:assert/strict";
import { withPlannedMuxes } from "../../src/hierarchy/core/plannedMux.ts";
import { dropPlaceholderGatePins } from "../../src/hierarchy/core/schematic.ts";
import type { SchematicGraph } from "../../src/hierarchy/core/schematic.ts";

const node = (id: string, kind: "module" | "port" = "module") => ({
  id, instanceName: id, designName: id, kind,
  ports: [{ name: "o", direction: "out" as const, busLabel: "o" },
          { name: "rst_a", direction: "in" as const, busLabel: "rst_a" }],
});

const g = (): SchematicGraph => ({
  seedId: "s",
  nodes: { drv: node("drv"), sink: node("sink"), other: node("other") },
  edges: [
    { id: "e1", fromNode: "drv", fromPort: "o", toNode: "sink", toPort: "rst_a", netName: "rst_a", bus: false },
    { id: "e2", fromNode: "drv", fromPort: "o", toNode: "other", toPort: "rst_a", netName: "unrelated", bus: false },
  ],
  expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
});
// The schematic's own renderer of a pin's full path.
const pathOf = (n: string, p: string) => `top/${n}/${p}`;
const MUX = { target: "top/sink/rst_a", overrideSource: "u_dyn/dfx_rst_scan_n", select: "u_tdr/dfx_scan_mode" };

test("no planned muxes: the SAME graph object, so nothing re-layouts", () => {
  const g0 = g();
  assert.equal(withPlannedMuxes(g0, [], pathOf), g0);
  // …and one that matches nothing in this view is equally a no-op
  assert.equal(withPlannedMuxes(g0, [{ ...MUX, target: "top/elsewhere/x" }], pathOf), g0);
});

test("a planned mux is spliced INTO the net, not hung beside it", () => {
  const out = withPlannedMuxes(g(), [MUX], pathOf);
  const mid = "planmux:top/sink/rst_a";
  assert.ok(out.nodes[mid], "the mux node exists");
  assert.equal(out.nodes[mid].planned, true, "flagged planned — that is what draws it dashed");
  assert.equal(out.nodes[mid].prim, "mux");

  // the functional driver now feeds the mux…
  const func = out.edges.find((e) => e.toNode === mid && e.toPort === "b");
  assert.ok(func && func.fromNode === "drv");
  // …and the mux feeds what the driver used to feed
  const to = out.edges.find((e) => e.fromNode === mid && e.toNode === "sink");
  assert.ok(to && to.toPort === "rst_a");
  // nothing still goes driver -> sink directly
  assert.ok(!out.edges.some((e) => e.fromNode === "drv" && e.toNode === "sink"));
  // the unrelated edge is untouched
  assert.ok(out.edges.some((e) => e.id === "e2" && e.toNode === "other"));

  // the DFT side enters as planned boxes, one per driver
  const src = out.edges.find((e) => e.toNode === mid && e.toPort === "a");
  const sel = out.edges.find((e) => e.toNode === mid && e.toPort === "s");
  assert.ok(src && out.nodes[src.fromNode].planned);
  assert.ok(sel && out.nodes[sel.fromNode].planned);
});

test("the DFT drivers are drawn as their IP MODULES, with the referenced pin on them", () => {
  const ips = [
    { instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", at: "" },
    { instance: "u_tdr", module: "dfx_static_hyper_ctl_tdr", at: "" },
  ];
  const out = withPlannedMuxes(g(), [MUX], pathOf, ips);
  const dyn = out.nodes["planip:u_dyn"];
  const tdr = out.nodes["planip:u_tdr"];
  assert.ok(dyn && tdr, "one box per planned IP");
  assert.equal(dyn.designName, "dfx_dynamic_hyper_ctl");   // the MODULE name, not the pin
  assert.equal(dyn.instanceName, "u_dyn");
  assert.equal(dyn.kind, "module");
  assert.equal(dyn.planned, true);                          // dashed, like the mux
  assert.deepEqual(dyn.ports.map((p) => p.name), ["dfx_rst_scan_n"]);
  assert.deepEqual(tdr.ports.map((p) => p.name), ["dfx_scan_mode"]);
  // wired from the pin, not from an invented one
  assert.ok(out.edges.some((e) => e.fromNode === "planip:u_dyn" && e.fromPort === "dfx_rst_scan_n"));
  assert.ok(out.edges.some((e) => e.fromNode === "planip:u_tdr" && e.fromPort === "dfx_scan_mode"));
});

test("an IP under a scope keeps its full path, and one IP driving both pins is ONE box", () => {
  const ips = [{ instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", at: "PROCESSOR_1" }];
  const m = { target: "top/sink/rst_a", overrideSource: "PROCESSOR_1/u_dyn/dfx_rst_scan_n",
              select: "PROCESSOR_1/u_dyn/dfx_scan_mode" };
  const out = withPlannedMuxes(g(), [m], pathOf, ips);
  const box = out.nodes["planip:PROCESSOR_1/u_dyn"];
  assert.ok(box, "the box is keyed by the full instance path");
  assert.equal(box.designName, "dfx_dynamic_hyper_ctl");
  assert.deepEqual(box.ports.map((p) => p.name).sort(), ["dfx_rst_scan_n", "dfx_scan_mode"]);
  assert.equal(Object.keys(out.nodes).filter((k) => k.startsWith("planip:")).length, 1);
});

test("a driver that belongs to no planned IP still gets a box, named for what holds the pin", () => {
  const out = withPlannedMuxes(g(), [MUX], pathOf);   // no IP list
  const box = out.nodes["planip:u_dyn"];
  assert.ok(box);
  assert.equal(box.designName, "u_dyn");              // module unknown — say the instance
  assert.deepEqual(box.ports.map((p) => p.name), ["dfx_rst_scan_n"]);
});

test("the target may be named by its net instead of its sink pin", () => {
  const out = withPlannedMuxes(g(), [{ ...MUX, target: "rst_a" }], pathOf);
  assert.ok(out.nodes["planmux:rst_a"], "matched on the net name");
});

test("a dotted path and a slashed one name the same target", () => {
  const out = withPlannedMuxes(g(), [{ ...MUX, target: "top.sink.rst_a" }], pathOf);
  assert.ok(out.nodes["planmux:top.sink.rst_a"]);
});

test("recording the same target twice does not double the mux", () => {
  const out = withPlannedMuxes(g(), [MUX, MUX], pathOf);
  assert.equal(Object.keys(out.nodes).filter((k) => k.startsWith("planmux:")).length, 1);
});

// The loop this caused in the real design: a target that names a NET matches both the edge
// arriving at a node and the edge leaving it. Cutting both put that node on both sides of the
// mux — it fed the mux and the mux fed it.
test("a chain on one net is cut ONCE — the mux never ends up in a loop", () => {
  const chain: SchematicGraph = {
    seedId: "s",
    nodes: { a: node("a"), b: node("b"), c: node("c") },
    edges: [
      { id: "e1", fromNode: "a", fromPort: "o", toNode: "b", toPort: "rst_a", netName: "puc_rst", bus: false },
      { id: "e2", fromNode: "b", fromPort: "o", toNode: "c", toPort: "rst_a", netName: "puc_rst", bus: false },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const out = withPlannedMuxes(chain, [{ ...MUX, target: "puc_rst" }], pathOf);
  const mid = "planmux:puc_rst";
  assert.ok(out.nodes[mid]);
  const into = out.edges.filter((e) => e.toNode === mid && e.toPort === "b").map((e) => e.fromNode);
  const outOf = out.edges.filter((e) => e.fromNode === mid).map((e) => e.toNode);
  // no node may be on both sides of the mux — that is exactly the loop
  for (const x of into) assert.ok(!outOf.includes(x), `${x} both feeds and is fed by the mux`);
  assert.equal(into.length, 1, "cut at ONE point on the wire, not two in series");
});

test("the mux lives in the same container as the load it feeds", () => {
  const g2: SchematicGraph = {
    seedId: "s",
    nodes: { drv: node("drv"), sink: { ...node("sink"), parentId: "box" }, box: node("box") },
    edges: [{ id: "e1", fromNode: "drv", fromPort: "o", toNode: "sink", toPort: "rst_a", netName: "rst_a", bus: false }],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const out = withPlannedMuxes(g2, [MUX], pathOf);
  assert.equal(out.nodes["planmux:top/sink/rst_a"].parentId, "box");
});

test("the sink is preferred over the driver when both spellings match", () => {
  // pathOf makes the driver's path top/drv/o and the sink's top/sink/rst_a; targeting the
  // driver must still cut that one edge, and only it.
  const out = withPlannedMuxes(g(), [{ ...MUX, target: "top/drv/o" }], pathOf);
  const mid = "planmux:top/drv/o";
  assert.ok(out.nodes[mid]);
  assert.equal(out.edges.filter((e) => e.toNode === mid && e.toPort === "b").length, 2,
               "both edges leaving that driver are cut");
});

// The picture contradicted itself: 1 into an inverter and 1 out of it. Everything past the mux
// kept its PRE-PLAN value, so the plan's value stopped at the mux output.
test("the planned value is carried downstream, flipping at each inverter", () => {
  const inv = (id: string) => ({
    id, instanceName: id, designName: "~", kind: "logic" as const, prim: "not",
    ports: [{ name: "a", direction: "in" as const, busLabel: "" },
            { name: "y", direction: "out" as const, busLabel: "" }],
  });
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { drv: node("drv"), i1: inv("i1"), sink: node("sink") },
    edges: [
      { id: "e1", fromNode: "drv", fromPort: "o", toNode: "i1", toPort: "a", netName: "rst_a", bus: false, val: "X" },
      { id: "e2", fromNode: "i1", fromPort: "y", toNode: "sink", toPort: "rst_a", netName: "puc_rst", bus: false, val: "X" },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const cons = [{ pin: "u_tdr/dfx_scan_mode", value: "1" },
                { pin: "u_dyn/dfx_rst_scan_n", value: "1" }];
  // patch the driver: mux output = 1, and what comes out of the inverter must be 0
  const out = withPlannedMuxes(gg, [{ ...MUX, target: "top/drv/o" }], pathOf, [], undefined, cons);
  const mid = "planmux:top/drv/o";
  const toInv = out.edges.find((e) => e.fromNode === mid && e.toNode === "i1");
  const afterInv = out.edges.find((e) => e.fromNode === "i1");
  assert.equal(toInv?.val, "1", "the mux passes its test arm");
  assert.equal(afterInv?.val, "0", "…and the inverter flips it — 1 in, 0 out");
});

test("a value is not carried through a gate with a second input", () => {
  const and2 = {
    id: "a1", instanceName: "a1", designName: "&", kind: "logic" as const, prim: "and",
    ports: [{ name: "a", direction: "in" as const, busLabel: "" },
            { name: "b", direction: "in" as const, busLabel: "" },
            { name: "y", direction: "out" as const, busLabel: "" }],
  };
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { drv: node("drv"), a1: and2, sink: node("sink") },
    edges: [
      { id: "e1", fromNode: "drv", fromPort: "o", toNode: "a1", toPort: "a", netName: "rst_a", bus: false },
      { id: "e2", fromNode: "a1", fromPort: "y", toNode: "sink", toPort: "rst_a", netName: "z", bus: false },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const cons = [{ pin: "u_tdr/dfx_scan_mode", value: "1" },
                { pin: "u_dyn/dfx_rst_scan_n", value: "1" }];
  const out = withPlannedMuxes(gg, [{ ...MUX, target: "top/drv/o" }], pathOf, [], undefined, cons);
  // the AND's other input is unknown, so its output is NOT claimed
  assert.equal(out.edges.find((e) => e.fromNode === "a1")?.val, undefined);
});

// The propagation used to stop at the first synthetic hop: the clock/reset views are full of
// net taps and boundary waypoints whose port list carries only an output, so a port-count test
// said "not a pass-through" and the inverter two hops later never flipped anything.
test("the value passes through synthetic hops and still flips at the inverter", () => {
  const tap = (id: string) => ({
    id, instanceName: id, designName: id, kind: "port" as const, netTap: true,
    ports: [{ name: "o", direction: "out" as const, busLabel: "" }],   // NO input port
  });
  const inv = (id: string) => ({
    id, instanceName: id, designName: "~", kind: "logic" as const, prim: "not",
    ports: [{ name: "a", direction: "in" as const, busLabel: "" },
            { name: "y", direction: "out" as const, busLabel: "" }],
  });
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { drv: node("drv"), t1: tap("t1"), i1: inv("i1"), t2: tap("t2"), sink: node("sink") },
    edges: [
      { id: "e1", fromNode: "drv", fromPort: "o", toNode: "t1", toPort: "i", netName: "n1", bus: false, val: "X" },
      { id: "e2", fromNode: "t1", fromPort: "o", toNode: "i1", toPort: "a", netName: "n2", bus: false, val: "X" },
      { id: "e3", fromNode: "i1", fromPort: "y", toNode: "t2", toPort: "i", netName: "puc_rst", bus: false, val: "X" },
      { id: "e4", fromNode: "t2", fromPort: "o", toNode: "sink", toPort: "rst_a", netName: "puc_rst", bus: false, val: "X" },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const cons = [{ pin: "u_tdr/dfx_scan_mode", value: "1" },
                { pin: "u_dyn/dfx_rst_scan_n", value: "1" }];
  const out = withPlannedMuxes(gg, [{ ...MUX, target: "top/drv/o" }], pathOf, [], undefined, cons);
  const val = (id: string) => out.edges.find((e) => e.id === id || e.id === id + ":f")?.val;
  assert.equal(val("e2"), "1", "carried through the tap, unchanged");
  assert.equal(val("e3"), "0", "…flipped by the inverter");
  assert.equal(val("e4"), "0", "…and carried on to the flop");
});

// The clock/reset debug views name their source node with the walk's human tail attached.
// A mux recorded at that source (which is exactly what Fix reset DRC records) has to land on
// it anyway — this is the case where the DRC said "fixed" while the picture showed no mux.
test("a source node whose path carries a human tail still receives the mux", () => {
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { src: node("src"), sink: node("sink") },
    edges: [{ id: "e1", fromNode: "src", fromPort: "o", toNode: "sink", toPort: "rst_a",
              netName: "puc_rst", bus: false }],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  // what realNodePath renders for a term:… source — path plus " <- flop @clk" tail
  const tailPathOf = (n: string, p: string) =>
    n === "src" ? "top/clock_module_0/sync_cell_puc/data_sync <- flop @clk, async reset rst"
                : `top/${n}/${p}`;
  const out = withPlannedMuxes(
    gg, [{ ...MUX, target: "top/clock_module_0/sync_cell_puc/data_sync" }], tailPathOf);
  const mid = "planmux:top/clock_module_0/sync_cell_puc/data_sync";
  assert.ok(out.nodes[mid], "the mux lands on the source despite the tail");
  assert.ok(out.edges.some((e) => e.fromNode === "src" && e.toNode === mid),
            "spliced right after the source — the common-source fix point");
});

// The DRC debug view's sequential source is a `logic:<file>:<line>` node — its id carries no
// net, so path matching lost the mux entirely ("自动fix的电路怎么不存在了"). The node now
// carries realPath, and the splice matches against THAT.
test("a logic-id source node is matched through its realPath", () => {
  const src = {
    id: "logic:top.clock_module_0.sync_cell_puc:omsp_sync_cell.v:72",
    instanceName: "<- flop @clk", designName: "sequential", kind: "logic" as const,
    ports: [{ name: "o", direction: "out" as const, busLabel: "data_out" }],
    realPath: "top.clock_module_0.sync_cell_puc.data_sync",
  };
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { [src.id]: src, sink: node("sink") },
    edges: [{ id: "e1", fromNode: src.id, fromPort: "o", toNode: "sink", toPort: "rst_a",
              netName: "data_out", bus: false }],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  // pathOf resolves the logic id to its SCOPE only — the net name is gone (the real behaviour)
  const scopeOnly = (n: string, p: string) =>
    n.startsWith("logic:") ? "top/clock_module_0/sync_cell_puc/o" : `top/${n}/${p}`;
  const out = withPlannedMuxes(
    gg, [{ ...MUX, target: "top/clock_module_0/sync_cell_puc/data_sync" }], scopeOnly);
  const mid = "planmux:top/clock_module_0/sync_cell_puc/data_sync";
  assert.ok(out.nodes[mid], "the mux lands via realPath");
  assert.ok(out.edges.some((e) => e.fromNode === src.id && e.toNode === mid),
            "spliced right after the sequential source — the common-source fix point");
});

// The IP library's computed port states, drawn as the INPUT CIRCUIT: the IP box carries every
// input port with its per-phase value, the used output pin a computed s()-sac()/asc() label,
// and the mux output composes per phase — sel=1 passes the test arm, sel=0 leaves the
// functional path ('-'), X drives X. This is "trace into the IP and show me" on the canvas.
test("IP port states draw the input circuit and compose per-phase values", () => {
  const ips = [
    { instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", at: "", ports: [
      { port: "dfx_scan_mode", dir: "in", s: "1", sac: "1", asc: "1" },
      { port: "scan_enable", dir: "in", s: "1", sac: "0", asc: "0" },
      { port: "dfx_rst_scan_n", dir: "out", s: "1", sac: "0", asc: "1",
        stuck: "dead:dfx_dynamic_hyper_ctl.persist_inst.Z" },
    ] },
    { instance: "u_tdr", module: "dfx_static_hyper_ctl_tdr", at: "", ports: [
      { port: "tck", dir: "in", s: "X", sac: "X", asc: "X" },
      { port: "dfx_scan_mode", dir: "out", s: "1", sac: "1", asc: "1" },
    ] },
  ];
  const out = withPlannedMuxes(g(), [MUX], pathOf, ips);
  const dyn = out.nodes["planip:u_dyn"];
  assert.ok(dyn, "the dynamic IP box exists");
  // input circuit: every input port on the box, labeled with its three-phase value
  const scanEn = dyn.ports.find((p) => p.name === "scan_enable");
  assert.ok(scanEn && scanEn.direction === "in", "input ports are on the box");
  assert.match(scanEn.busLabel ?? "", /s\(1\)-sac\(0\)\/asc\(0\)/, "…with per-phase labels");
  // the used output pin carries its computed value
  const rstPin = dyn.ports.find((p) => p.name === "dfx_rst_scan_n");
  assert.match(rstPin?.busLabel ?? "", /s\(1\)-sac\(0\)\/asc\(1\)/, "output pin labeled");
  // wires: select shows the TDR's computed value, out composes per phase
  const selEdge = out.edges.find((e) => e.toPort === "s" && e.toNode.startsWith("planmux:"));
  assert.equal(selEdge?.val, "s(1)-sac(1)/asc(1)");
  const outEdge = out.edges.find((e) => e.fromPort === "o" && e.fromNode.startsWith("planmux:"));
  assert.equal(outEdge?.val, "s(1)-sac(0)/asc(1)", "sel=1 every phase -> source value per phase");
});

// A select the circuit computes as 0 in capture leaves the functional path alone there ('-'),
// and an inverter downstream flips each phase of a composite label independently.
test("per-phase mux composition and composite flip through an inverter", () => {
  const ips = [
    { instance: "u_dyn", module: "dfx_dynamic_hyper_ctl", at: "", ports: [
      { port: "dfx_rst_scan_n", dir: "out", s: "1", sac: "0", asc: "1" },
    ] },
    { instance: "u_tdr", module: "dfx_static_hyper_ctl_tdr", at: "", ports: [
      { port: "dfx_scan_mode", dir: "out", s: "1", sac: "0", asc: "X" },
    ] },
  ];
  const inv = { id: "inv", instanceName: "inv", designName: "not", kind: "logic" as const,
                prim: "not",
                ports: [{ name: "i", direction: "in" as const, busLabel: "i" },
                        { name: "z", direction: "out" as const, busLabel: "z" }] };
  const flop = node("flop");
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { drv: node("drv"), sink: node("sink"), inv, flop },
    edges: [
      { id: "e1", fromNode: "drv", fromPort: "o", toNode: "sink", toPort: "rst_a",
        netName: "rst_a", bus: false },
      { id: "e2", fromNode: "sink", fromPort: "o", toNode: "inv", toPort: "i",
        netName: "rst_b", bus: false },
      { id: "e3", fromNode: "inv", fromPort: "z", toNode: "flop", toPort: "rst_a",
        netName: "rst_n_inv", bus: false },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const out = withPlannedMuxes(gg, [MUX], pathOf, ips);
  const outEdge = out.edges.find((e) => e.fromPort === "o" && e.fromNode.startsWith("planmux:"));
  assert.equal(outEdge?.val, "s(1)-sac(-)/asc(X)",
               "sel: 1 passes, 0 functional ('-'), X drives X");
  const invOut = out.edges.find((e) => e.id === "e3");
  assert.equal(invOut?.val, "s(0)-sac(-)/asc(X)", "inverter flips each phase; '-' and X stay");
});

// A source fix targets an OUTPUT: the wire crosses its container boundary and then feeds the
// real load (data_out -> boundary -> inverter -> puc_rst). The mux must land on the
// DOWNSTREAM-most segment — in front of the inverter, outside the source box — per the
// reference sketch; splicing the internal hop climbed into the container and drew wrong.
test("a boundary-crossing chain is cut at its downstream-most segment", () => {
  const bnd = { id: "bnd", instanceName: "sync_cell_puc", designName: "omsp_sync_cell",
                kind: "module" as const, isLeaf: false,
                ports: [{ name: "data_out", direction: "out" as const, busLabel: "data_out" }] };
  const inv = { id: "inv", instanceName: "puc_rst", designName: "not", kind: "logic" as const,
                prim: "not",
                ports: [{ name: "a", direction: "in" as const, busLabel: "a" },
                        { name: "y", direction: "out" as const, busLabel: "y" }] };
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { flop: node("flop"), bnd, inv },
    edges: [
      { id: "e1", fromNode: "flop", fromPort: "o", toNode: "bnd", toPort: "data_out",
        netName: "data_sync", bus: false },
      { id: "e2", fromNode: "bnd", fromPort: "data_out", toNode: "inv", toPort: "a",
        netName: "data_sync", bus: false },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const out = withPlannedMuxes(
    gg, [{ ...MUX, target: "top/clock_module_0/sync_cell_puc/data_sync" }],
    (n, p) => (n === "bnd" ? "top/clock_module_0/sync_cell_puc/" + p : `top/${n}/${p}`));
  const mid = "planmux:top/clock_module_0/sync_cell_puc/data_sync";
  assert.ok(out.nodes[mid], "the mux exists");
  assert.ok(out.edges.some((e) => e.fromNode === "bnd" && e.toNode === mid),
            "fed by the boundary port — after the source leaves its box");
  assert.ok(out.edges.some((e) => e.fromNode === mid && e.toNode === "inv"),
            "…and drives the inverter: data_out ── MUX ── inverter, the sketch exactly");
  assert.ok(out.edges.some((e) => e.fromNode === "flop" && e.toNode === "bnd"),
            "the internal hop stays intact");
});

// The wire keeps going PAST the matched segment under a new net name (data_sync becomes
// data_out at the boundary). Only the internal hop matches the target — the splice must still
// land on the OUTERMOST segment, in front of the real consumer (the sketch: data_out ── MUX ──
// inverter), by following same-port pass-throughs.
test("the splice follows boundary pass-throughs to the outermost segment", () => {
  const bnd = { id: "bnd", instanceName: "sync_cell_puc", designName: "omsp_sync_cell",
                kind: "module" as const, isLeaf: false,
                ports: [{ name: "data_out", direction: "out" as const, busLabel: "data_out" }] };
  const inv = { id: "inv", instanceName: "puc_rst", designName: "not", kind: "logic" as const,
                prim: "not",
                ports: [{ name: "a", direction: "in" as const, busLabel: "a" },
                        { name: "y", direction: "out" as const, busLabel: "y" }] };
  const src = {
    id: "logic:sync:omsp_sync_cell.v:72", instanceName: "<- flop @clk",
    designName: "sequential", kind: "logic" as const,
    ports: [{ name: "o", direction: "out" as const, busLabel: "data_out" }],
    realPath: "top.clock_module_0.sync_cell_puc.data_sync",
  };
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { [src.id]: src, bnd, inv },
    edges: [
      { id: "e1", fromNode: src.id, fromPort: "o", toNode: "bnd", toPort: "data_out",
        netName: "data_sync", bus: false },
      // different net name out here — the boundary renamed the wire
      { id: "e2", fromNode: "bnd", fromPort: "data_out", toNode: "inv", toPort: "a",
        netName: "data_out", bus: false },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const pathOfB = (n: string, p: string) =>
    n === "bnd" ? `top/clock_module_0/sync_cell_puc/${p}` : `top/${n}/${p}`;
  const out = withPlannedMuxes(
    gg, [{ ...MUX, target: "top/clock_module_0/sync_cell_puc/data_sync" }], pathOfB);
  const mid = "planmux:top/clock_module_0/sync_cell_puc/data_sync";
  assert.ok(out.nodes[mid], "the mux exists");
  assert.ok(out.edges.some((e) => e.fromNode === "bnd" && e.toNode === mid),
            "fed by data_out — outside the source box");
  assert.ok(out.edges.some((e) => e.fromNode === mid && e.toNode === "inv"),
            "…and drives the inverter, not the boundary port");
  assert.ok(out.edges.some((e) => e.fromNode === src.id && e.toNode === "bnd"),
            "the internal hop stays intact");
});

// The walk paints the whole path with its FINAL (post-fix) value; after the splice that value
// may only live DOWNSTREAM of the mux. The functional arm (d0/b) is the source register's own
// output — statically unknown — so the inherited label must be stripped ("d0 source 为啥是 0").
test("the functional arm does not inherit the path's post-fix value", () => {
  const gg = g();
  gg.edges = [{ id: "e1", fromNode: "drv", fromPort: "o", toNode: "sink", toPort: "rst_a",
                netName: "rst_a", bus: false, val: "0" }];
  const out = withPlannedMuxes(gg, [MUX], pathOf);
  const funcArm = out.edges.find((e) => e.toPort === "b" && e.toNode.startsWith("planmux:"));
  assert.ok(funcArm, "the functional edge was redirected into the mux");
  assert.equal(funcArm!.val, undefined, "…and its stale post-fix value is gone");
});

// A decomposed block is a CONTAINER whose boundary passes INPUTS through: edges leave
// in-direction ports (data_in/clk/rst). Its realPath names its OUTPUT net — a driver hit
// through realPath must therefore never fire on an in-port edge, or the mux "drives" the
// clock with the reset rail (the reproduced screenshot lie).
test("realPath driver-matching skips container in-port pass-throughs", () => {
  const blk = {
    id: "logic:top.sync:f.v:72", instanceName: "seq", designName: "sequential",
    kind: "logic" as const, realPath: "top.sync.data_sync",
    ports: [
      { name: "o", direction: "out" as const, busLabel: "data_sync" },
      { name: "clk", direction: "in" as const, busLabel: "clk" },
      { name: "rst", direction: "in" as const, busLabel: "rst" },
    ],
  };
  const dff = { id: "dff", instanceName: "c1", designName: "DFFR", kind: "primitive" as const,
    prim: "dff", parentId: blk.id,
    ports: [{ name: "clk", direction: "in" as const, busLabel: "clk" },
            { name: "rst", direction: "in" as const, busLabel: "rst" },
            { name: "o", direction: "out" as const, busLabel: "data_sync" }] };
  const gg: SchematicGraph = {
    seedId: "s",
    nodes: { [blk.id]: blk, dff, sink: node("sink") },
    edges: [
      { id: "e1", fromNode: blk.id, fromPort: "o", toNode: "sink", toPort: "rst_a",
        netName: "data_out", bus: false },
      { id: "e2", fromNode: blk.id, fromPort: "clk", toNode: "dff", toPort: "clk",
        netName: "clk", bus: false },
      { id: "e3", fromNode: blk.id, fromPort: "rst", toNode: "dff", toPort: "rst",
        netName: "rst", bus: false },
    ],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const out = withPlannedMuxes(
    gg, [{ ...MUX, target: "top/sync/data_sync" }], (n, p) => `top/${n}/${p}`.replace(/[.:]/g, "/"));
  const mid = "planmux:top/sync/data_sync";
  assert.ok(out.nodes[mid], "the mux exists");
  assert.ok(out.edges.some((e) => e.fromNode === mid && e.toNode === "sink"),
            "spliced on the block's OUTPUT");
  assert.ok(out.edges.some((e) => e.fromNode === blk.id && e.fromPort === "clk" && e.toNode === "dff"),
            "the clk pass-through is untouched");
  assert.ok(out.edges.some((e) => e.fromNode === blk.id && e.fromPort === "rst" && e.toNode === "dff"),
            "the rst pass-through is untouched");
  assert.ok(!out.edges.some((e) => e.fromNode === mid && (e.toPort === "clk" || e.toPort === "rst")),
            "the mux never drives clk/rst");
});

// A gate built before the daemon reported its RHS reads had one anonymous `a` input; a later
// trace adds the real signal pins beside it, leaving a dangling stub between them. It names no
// signal and nothing can connect to it — an old graph must repair itself on load.
test("placeholder gate pins with no wire are dropped", () => {
  const gate = {
    id: "logic:top:f.v:1008", instanceName: "puc_a", designName: "|",
    kind: "logic" as const, prim: "or",
    ports: [
      { name: "a", direction: "in" as const, busLabel: "" },           // placeholder, no wire
      { name: "por", direction: "in" as const, busLabel: "por" },
      { name: "wdt_reset", direction: "in" as const, busLabel: "wdt_reset" },
      { name: "y", direction: "out" as const, busLabel: "puc_a" },
    ],
  };
  const gg: SchematicGraph = {
    seedId: "s", nodes: { [gate.id]: gate, drv: node("drv") },
    edges: [{ id: "e1", fromNode: "drv", fromPort: "o", toNode: gate.id, toPort: "por",
              netName: "por", bus: false }],
    expanded: {}, empty: {}, inExpanded: {}, inEmpty: {},
  };
  const out = dropPlaceholderGatePins(gg);
  assert.deepEqual(out.nodes[gate.id].ports.map((p) => p.name), ["por", "wdt_reset", "y"]);
  // a placeholder that DOES carry a wire stays (dropping it would orphan the edge)
  const wired = dropPlaceholderGatePins({ ...gg,
    edges: [...gg.edges, { id: "e2", fromNode: "drv", fromPort: "o", toNode: gate.id,
                           toPort: "a", netName: "x", bus: false }] });
  assert.ok(wired.nodes[gate.id].ports.some((p) => p.name === "a"));
});
