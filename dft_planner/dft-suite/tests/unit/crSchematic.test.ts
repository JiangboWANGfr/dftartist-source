// buildCrSchematic: the exact-circuit clock/reset schematic. Elems modeled 1:1 on the shapes
// the real design produced (verified 2026-07-27 on processor_core: xup/xdn crossings, RTL
// buf/inv aliases, cell elems with |net/|in/|out/|mod tails).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCrSchematic, displayElems } from "../../src/hierarchy/core/crSchematic.ts";
import type { CrPathItem } from "../../src/core-bridge/model.ts";

const base: CrPathItem = {
  kind: "clock", owner: "", net: "", edge: "posedge", path: [], elems: [],
  terminus: "pi", detail: "", clockName: "", rootValue: "010", value: "010",
  inactive: "", ok: true, flopCount: 1, file: "", line: 0,
};

// The real dco_clk path (GPIO_1 sync cell), verbatim from the backend walk.
const clkItem: CrPathItem = {
  ...base,
  owner: "top.GPIO_1.sync_cell_p1in_0", net: "clk", flopCount: 2,
  clockName: "dco_clk", detail: "top.dco_clk",
  path: ["top.GPIO_1.sync_cell_p1in_0:clk", "top.GPIO_1:mclk", "top:mclk",
         "top.PROCESSOR_1:mclk", "top.PROCESSOR_1.clock_module_0:mclk",
         "top.PROCESSOR_1.clock_module_0:nodiv_mclk",
         "top.PROCESSOR_1.clock_module_0:dco_clk", "top.PROCESSOR_1:dco_clk", "top:dco_clk"],
  elems: [   // flop -> source order, exactly as the walk records them
    "xup@top.GPIO_1.sync_cell_p1in_0:clk",
    "xup@top.GPIO_1:mclk",
    "xdn@top.PROCESSOR_1:mclk",
    "xdn@top.PROCESSOR_1.clock_module_0:mclk",
    "buf@top.PROCESSOR_1.clock_module_0:mclk|file=/d/omsp_clock_module.v|line=618",
    "buf@top.PROCESSOR_1.clock_module_0:nodiv_mclk|file=/d/omsp_clock_module.v|line=560",
    "xup@top.PROCESSOR_1.clock_module_0:dco_clk",
    "xup@top.PROCESSOR_1:dco_clk",
  ],
};

test("real containers, real boundary ports, no invented symbols", () => {
  const g = buildCrSchematic([clkItem], { seedId: "s", roots: ["top"] });

  // Containers = the real instance hierarchy (harden top excluded), nested by parentId.
  const cm = g.nodes["top.PROCESSOR_1.clock_module_0"];
  assert.ok(cm, "clock_module_0 container");
  assert.equal(cm.parentId, "top.PROCESSOR_1");
  assert.equal(g.nodes["top.PROCESSOR_1"].parentId, undefined);

  // Boundary ports are the REAL crossing pins with real directions.
  assert.deepEqual(
    cm.ports.map((p) => `${p.direction}:${p.name}`).sort(),
    ["in:dco_clk", "out:mclk"]);
  const gpio = g.nodes["top.GPIO_1"];
  assert.deepEqual(gpio.ports.map((p) => `${p.direction}:${p.name}`), ["in:mclk"]);

  // buf aliases are wires, not boxes: no node for nodiv_mclk/mclk assigns.
  assert.ok(!Object.keys(g.nodes).some((id) => id.startsWith("g:")), "no gate nodes for aliases");

  // One DFF group with the real bit count, inside its real owner container.
  const ff = g.nodes["ff:clock:top.GPIO_1.sync_cell_p1in_0:clk"];
  assert.ok(ff && ff.prim === "dff");
  assert.equal(ff.parentId, "top.GPIO_1.sync_cell_p1in_0");
  assert.equal(ff.instanceName, "×2");

  // The wire threads source -> PROCESSOR_1.dco_clk -> clock_module_0.dco_clk ->
  // clock_module_0.mclk -> PROCESSOR_1.mclk -> GPIO_1.mclk -> sync.clk -> DFF, with the
  // net renamed by the alias chain (dco_clk -> nodiv_mclk -> mclk) reflected on labels.
  const hop = (f: string, fp: string, t: string, tp: string) =>
    g.edges.find((e) => e.fromNode === f && e.fromPort === fp && e.toNode === t && e.toPort === tp);
  assert.ok(hop("clk:dco_clk", "o", "top.PROCESSOR_1", "dco_clk"));
  assert.ok(hop("top.PROCESSOR_1", "dco_clk", "top.PROCESSOR_1.clock_module_0", "dco_clk"));
  // The alias chain INSIDE clock_module_0 (dco_clk -> nodiv_mclk -> mclk) is a PASS-THROUGH:
  // drawn as a net waypoint inside the container. A direct in-port -> out-port edge would be
  // a container SELF-EDGE, which ELK drops or routes AROUND the open frame — the "mclk /
  // dbg_clk boundary pins float unconnected inside clock_module_0" bug.
  const thruId = Object.keys(g.nodes)
    .find((id) => id.startsWith("thru:top.PROCESSOR_1.clock_module_0:"));
  assert.ok(thruId, "pass-through waypoint inside clock_module_0");
  const thru = g.nodes[thruId!];
  assert.equal(thru.parentId, "top.PROCESSOR_1.clock_module_0");
  assert.ok(thru.netTap, "renders as a net waypoint, not a box");
  assert.equal(thru.instanceName, "mclk", "named by the alias chain's final net");
  const seg1 = hop("top.PROCESSOR_1.clock_module_0", "dco_clk", thruId!, "i");
  const seg2 = hop(thruId!, "o", "top.PROCESSOR_1.clock_module_0", "mclk");
  assert.ok(seg1 && seg2, "two ordinary segments through the waypoint");
  assert.equal(seg1!.netName, "mclk", "alias chain renames the net to mclk");
  // The alias statements have no box, so the WIRE carries the nearest assign's location for
  // the net menu's Show HDL Definition (needed to audit an OCC point against real source).
  assert.deepEqual(seg1!.loc, { file: "/d/omsp_clock_module.v", line: 618 });
  assert.ok(!g.edges.some((e) => e.fromNode === e.toNode), "no container self-edges anywhere");
  assert.ok(hop("top.GPIO_1", "mclk", "top.GPIO_1.sync_cell_p1in_0", "clk"));
  assert.ok(hop("top.GPIO_1.sync_cell_p1in_0", "clk", "ff:clock:top.GPIO_1.sync_cell_p1in_0:clk", "clk"));
});

test("RTL inverter becomes a real NOT gate; violation flop and lost point are flagged", () => {
  const rst: CrPathItem = {
    ...base,
    kind: "reset", owner: "top.GPIO_1.sync_cell_p1in_0", net: "rst", edge: "posedge",
    value: "X", inactive: "0", ok: false, clockName: "", terminus: "instance",
    detail: "top.PROCESSOR_1.clock_module_0.sync_cell_puc",
    path: ["top.GPIO_1.sync_cell_p1in_0:rst", "top.PROCESSOR_1.clock_module_0:puc_rst",
           "top.PROCESSOR_1.clock_module_0:puc"],
    elems: [
      "xup@top.GPIO_1.sync_cell_p1in_0:rst",
      "xup@top.GPIO_1:puc_rst",
      "xdn@top.PROCESSOR_1:puc_rst",
      "xdn@top.PROCESSOR_1.clock_module_0:puc_rst",
      "inv@top.PROCESSOR_1.clock_module_0:puc_rst|file=/d/omsp_clock_module.v|line=1047",
      "xdn@top.PROCESSOR_1.clock_module_0.sync_cell_puc:data_out",
    ],
  };
  const g = buildCrSchematic([rst], { seedId: "s", roots: ["top"], isBad: () => true });

  // The point where the walk stopped is a red source box placed in its real scope.
  const term = g.nodes["term:top.PROCESSOR_1.clock_module_0.sync_cell_puc"];
  assert.ok(term && term.alert, "terminus node flagged");
  assert.equal(term.parentId, "top.PROCESSOR_1.clock_module_0");

  // RTL `assign puc_rst = ~...` renders as a real NOT gate inside clock_module_0.
  const inv = g.nodes["g:top.PROCESSOR_1.clock_module_0:puc_rst"];
  assert.ok(inv && inv.prim === "not");
  assert.equal(inv.parentId, "top.PROCESSOR_1.clock_module_0");
  // Show HDL Definition must land on the `assign` itself, not just its module. (Measured on
  // the real design: omsp_clock_module.v:1047 is `assign puc_rst = ~puc_noscan_n;`.)
  assert.deepEqual(inv.loc, { file: "/d/omsp_clock_module.v", line: 1047 });

  // Violating flop group is flagged for the DRC debug drawer.
  const ff = g.nodes["ff:reset:top.GPIO_1.sync_cell_p1in_0:rst"];
  assert.ok(ff && ff.alert, "violating flop flagged red");
});

test("cell elems use their real pin names from the |in/|out tail", () => {
  const it: CrPathItem = {
    ...base,
    owner: "top", net: "g2", clockName: "CLKA", detail: "top.clk_a",
    path: ["top:g2", "top:g1", "top:clk_a"],
    elems: [
      "icg@top.u_icg2#TE=1|net=g2|in=CK|out=GCK|mod=cgand",
      "icg@top.u_icg1#TE=1|net=g1|in=CK|out=GCK|mod=cgand",
    ],
  };
  const g = buildCrSchematic([it], { seedId: "s", roots: ["top"] });
  const c = g.nodes["top.u_icg2"];
  assert.ok(c, "cell instance node");
  assert.equal(c.designName, "cgand");
  assert.deepEqual(c.ports.map((p) => `${p.direction}:${p.name}`).sort(),
                   ["in:CK", "in:TE", "out:GCK"]);
  // source -> u_icg1.CK, u_icg1.GCK -> u_icg2.CK (net g1), u_icg2.GCK -> DFF (net g2)
  const mid = g.edges.find((e) => e.fromNode === "top.u_icg1" && e.toNode === "top.u_icg2");
  assert.ok(mid && mid.fromPort === "GCK" && mid.toPort === "CK" && mid.netName === "g1");

  // displayElems strips the structured tail and crossing records for the abstract views.
  assert.deepEqual(displayElems(it.elems), ["icg@top.u_icg2#TE=1", "icg@top.u_icg1#TE=1"]);
  assert.deepEqual(displayElems(["xup@a:b", "buf@a:n|x=1"]), ["buf@a:n"]);
});
