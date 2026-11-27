// Schematic ELK geometry: pins stay in RTL declaration order, on exact
// PIN_ROW0/PIN_PITCH rows (FIXED_POS), stable across traces.
import { test } from "node:test"; import assert from "node:assert/strict";
import {
  addTrace, edgeId, makeNode, makeSourceNode, newSchematic, nodeDims, PIN_PITCH, PIN_ROW0, portId, toElkGraph,
  type SchEdge, type SchNode,
} from "../../src/hierarchy/core/schematic.ts";
import type { PortInfo } from "../../src/hierarchy/core/model.ts";
import { layout, type LaidOutGraph } from "../../src/hierarchy/schematic/elkLayout.ts";
import { anchorTo, boundsOf, fitTransform, PIN_STUB, toLaid } from "../../src/hierarchy/schematic/laid.ts";

const P = (name: string, direction: "in" | "out"): PortInfo =>
  ({ name, direction, width: 1, busLabel: name });

const INS = ["clk", "rstn", "a", "b", "c", "d", "tic"];
const OUTS = ["x", "y"];

function seedGraph(): { seed: SchNode; g: ReturnType<typeof newSchematic> } {
  const seed = makeNode(
    "top.u_tc", "u_tc", "tracking_channel|/rtl/tc.v", "module",
    [...INS.map((n) => P(n, "in")), ...OUTS.map((n) => P(n, "out"))],
  );
  return { seed, g: newSchematic(seed) };
}

/** y-center of each named port of node `id` in the laid-out graph. */
async function portYs(g: ReturnType<typeof newSchematic>, id: string, names: string[]): Promise<number[]> {
  const out = await layout(toElkGraph(g));
  const child = out.children!.find((c) => c.id === id)!;
  return names.map((n) => {
    const p = child.ports!.find((q) => q.id === portId(id, n))!;
    return (p.y ?? 0) + (p.height ?? 6) / 2;
  });
}

/** Trace into pin `tic` (declared LAST among inputs) — the user-reported repro. */
function withTrace(g: ReturnType<typeof newSchematic>): ReturnType<typeof addTrace> {
  const drv = makeNode("top.u_tb", "u_tb", "time_base|/rtl/tb.v", "module", [P("o1", "out")]);
  const e: SchEdge = {
    id: edgeId("top.u_tb", "o1", "top.u_tc", "tic"),
    fromNode: "top.u_tb", fromPort: "o1", toNode: "top.u_tc", toPort: "tic",
    netName: "tic", bus: false,
  };
  return addTrace(g, "top.u_tc", "tic", [drv], [e]);
}

test("pins are laid out in RTL declaration order even with a traced edge", async () => {
  const g = withTrace(seedGraph().g);
  const inYs = await portYs(g, "top.u_tc", INS);
  for (let i = 1; i < inYs.length; i++)
    assert.ok(inYs[i] > inYs[i - 1], `input ${INS[i]} must sit below ${INS[i - 1]} (got ${inYs})`);
  const outYs = await portYs(g, "top.u_tc", OUTS);
  assert.ok(outYs[1] > outYs[0], "outputs keep declaration order too");
});

test("pin order is identical before and after a trace (stability)", async () => {
  const { g } = seedGraph();
  const before = await portYs(g, "top.u_tc", INS);
  const after = await portYs(withTrace(g), "top.u_tc", INS);
  const order = (ys: number[]): string[] =>
    INS.map((n, i) => [n, ys[i]] as const).sort((p, q) => p[1] - q[1]).map(([n]) => n);
  assert.deepEqual(order(after), order(before), "trace must not reshuffle pins");
  assert.deepEqual(order(before), INS, "and the order is declaration order");
});

test("pins sit on exact declaration rows with the title band reserved", async () => {
  const { g } = seedGraph();
  const out = await layout(toElkGraph(g));
  const child = out.children!.find((c) => c.id === "top.u_tc")!;
  const centerY = (name: string): number => {
    const p = child.ports!.find((q) => q.id === portId("top.u_tc", name))!;
    return (p.y ?? 0) + (p.height ?? 6) / 2;
  };
  INS.forEach((n, i) => assert.equal(centerY(n), PIN_ROW0 + i * PIN_PITCH));
  OUTS.forEach((n, i) => assert.equal(centerY(n), PIN_ROW0 + i * PIN_PITCH));
});

test("toLaid: diamonds sit PIN_STUB outside the box edge; bus/net pass through", () => {
  const node = makeNode("t.u", "u", "m|/rtl/m.v", "module", [P("i", "in"), P("o", "out")]);
  const g = newSchematic(node);
  g.edges.push({ id: "e1", fromNode: "t.u", fromPort: "o", toNode: "t.u", toPort: "i", netName: "loop", bus: true });
  g.edges.push({ id: "e3", fromNode: "t.u", fromPort: "o", toNode: "t.u", toPort: "i", netName: "loop", bus: false });
  g.edges.push({ id: "e4", fromNode: "t.u", fromPort: "o", toNode: "t.u", toPort: "i", netName: "fan", bus: false });
  const elkOut = {
    id: "root",
    children: [{
      id: "t.u", x: 100, y: 50, width: 130, height: 72,
      ports: [
        { id: portId("t.u", "i"), x: -3, y: 20, width: 6, height: 6 },   // west, centered on border
        { id: portId("t.u", "o"), x: 127, y: 20, width: 6, height: 6 },  // east, centered on border
      ],
    }],
    edges: [
      { id: "e1", sections: [{ startPoint: { x: 0, y: 0 }, bendPoints: [{ x: 5, y: 5 }], endPoint: { x: 9, y: 9 } }] },
      { id: "e2", sections: [{ startPoint: { x: 1, y: 1 }, endPoint: { x: 2, y: 2 } }] },
      { id: "e3", sections: [{ startPoint: { x: 3, y: 0 }, endPoint: { x: 9, y: 9 } }] },
      { id: "e4", sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 5, y: 9 } }] },
    ],
  } as unknown as LaidOutGraph;
  const laid = toLaid(elkOut, g.nodes, g.edges);
  assert.equal(laid.boxes[0].ports[portId("t.u", "i")].x, 100 - PIN_STUB);        // border 100 -> 10px outside (left)
  assert.equal(laid.boxes[0].ports[portId("t.u", "o")].x, 100 + 130 + PIN_STUB);  // border 230 -> 10px outside (right)
  assert.equal(laid.boxes[0].ports[portId("t.u", "i")].y, 50 + 23);
  assert.deepEqual(laid.wires[0].points, [0, 0, 5, 5, 9, 9]);
  assert.equal(laid.wires[0].bus, true, "bus flag must come from the SchEdge, not hardcoded false");
  assert.equal(laid.wires[1].bus, false, "unknown edge falls back to bus=false");
  assert.equal(laid.wires[1].net, "", "unknown edge falls back to net=''");
  assert.equal(laid.wires[2].net, "", "same END point -> only the first keeps its label");
  assert.equal(laid.wires[3].net, "fan", "same start, different end (fanout) -> keeps its label");
  assert.equal(laid.wires[0].net, "loop");
});

test("nodeDims: behavioral sources are compact, module boxes unchanged", () => {
  const port = makeSourceNode({ id: "port:top.clk", kind: "port", label: "clk", detail: "input port", file: "/rtl/top.v", line: 3, bus: false });
  const logic = makeSourceNode({ id: "logic:/rtl/top.v:214", kind: "logic", label: "always_ff", detail: "always_ff", file: "/rtl/top.v", line: 214, bus: false });
  assert.equal(nodeDims(port).height, 20);
  assert.equal(nodeDims(port).width, 60, "short label takes the 60px floor");
  const wide = makeSourceNode({ id: "port:top.carrier_i_mag", kind: "port", label: "carrier_i_mag[15:0]", detail: "input port", file: "/rtl/top.v", line: 9, bus: false });
  assert.equal(nodeDims(wide).width, "carrier_i_mag[15:0]".length * 6.5 + 24, "long label drives the width");
  assert.deepEqual(nodeDims(logic), { width: 150, height: 38 });
  const mod = makeNode("t.u", "u", "m|/rtl/m.v", "module", INS.map((n) => P(n, "in")));
  assert.equal(nodeDims(mod).height, 46 + INS.length * 22 + 12, "module formula untouched (post-Task-3b geometry)");

  const srcGraph = newSchematic(logic);
  const srcElk = toElkGraph(srcGraph);
  assert.equal(srcElk.children[0].ports[0].y, 38 / 2 - 3, "source pins anchor at the symbol midline");
  const portElk = toElkGraph(newSchematic(port));
  assert.equal(portElk.children[0].ports[0].y, 20 / 2 - 3, "port symbol pins anchor at its midline");
});

test("toElkGraph emits the widened spacing set (no stability options without prev)", () => {
  const lo = toElkGraph(seedGraph().g).layoutOptions;
  assert.equal(lo["elk.spacing.nodeNode"], "60");
  assert.equal(lo["elk.layered.spacing.nodeNodeBetweenLayers"], "150");
  assert.equal(lo["elk.spacing.edgeEdge"], "16");
  // 40, not 20: wires must stay clear of box edges AND of the pin-NAME labels drawn inside
  // them (the "no line may overlap text" layout requirement). See schematic.ts toElkGraph.
  assert.equal(lo["elk.spacing.edgeNode"], "40");
  assert.equal(lo["elk.layered.spacing.edgeEdgeBetweenLayers"], "16");
  assert.equal(lo["elk.layered.spacing.edgeNodeBetweenLayers"], "40");
  assert.equal(lo["elk.layered.crossingMinimization.semiInteractive"], undefined);
});

test("toElkGraph with prev injects positions + semiInteractive", () => {
  const g = withTrace(seedGraph().g); // u_tc + u_tb
  const elk = toElkGraph(g, { "top.u_tc": { x: 120, y: 30 } });
  assert.equal(elk.layoutOptions["elk.layered.crossingMinimization.semiInteractive"], "true");
  const tc = elk.children.find((c) => c.id === "top.u_tc")!;
  const tb = elk.children.find((c) => c.id === "top.u_tb")!;
  assert.equal(tc.layoutOptions["elk.position"], "(120,30)");
  assert.equal(tb.layoutOptions["elk.position"], undefined, "nodes without prev carry no hint");
});

test("stability: semiInteractive follows the previous in-layer order (discriminating fixture)", async () => {
  // one driver PIN fanning out to three identical loads: every load permutation has
  // equal crossings, so ordering is a pure tie — prev positions must decide it.
  const d = makeNode("t.d", "d", "d|/r.v", "module", [P("o", "out")]);
  const loads = ["l1", "l2", "l3"].map((n) => makeNode(`t.${n}`, n, "l|/r.v", "module", [P("i", "in")]));
  let g = newSchematic(d);
  g = addTrace(g, "t.d", "o", loads, loads.map((l) => ({
    id: edgeId("t.d", "o", l.id, "i"),
    fromNode: "t.d", fromPort: "o", toNode: l.id, toPort: "i", netName: "n", bus: false,
  })));
  const out1 = await layout(toElkGraph(g));
  const pos = Object.fromEntries(out1.children!.map((c) => [c.id, { x: c.x!, y: c.y! }]));
  const natural = ["t.l1", "t.l2", "t.l3"].sort((p, q) => pos[p].y - pos[q].y);
  // swap the first and last loads' remembered positions -> layout must follow the SWAP
  const prev = { ...pos, [natural[0]]: pos[natural[2]], [natural[2]]: pos[natural[0]] };
  const out2 = await layout(toElkGraph(g, prev));
  const y2 = Object.fromEntries(out2.children!.map((c) => [c.id, c.y!]));
  const got = ["t.l1", "t.l2", "t.l3"].sort((p, q) => y2[p] - y2[q]);
  assert.deepEqual(got, [natural[2], natural[1], natural[0]], "order follows prev, not the natural order");
});

test("stability smoke: relayout of an unchanged graph is deterministic (no drift)", async () => {
  // linear chain: no in-layer ties — this checks determinism, not the tie-break mechanism
  const g = withTrace(seedGraph().g);
  const out1 = await layout(toElkGraph(g));
  const prev = Object.fromEntries(out1.children!.map((c) => [c.id, { x: c.x!, y: c.y! }]));
  const out2 = await layout(toElkGraph(g, prev));
  for (const c of out2.children!) {
    assert.ok(Math.abs(c.x! - prev[c.id].x) < 0.5, `${c.id} x drift`);
    assert.ok(Math.abs(c.y! - prev[c.id].y) < 0.5, `${c.id} y drift`);
  }
});

test("stability smoke: fanin prepend shifts the cone rigidly (zero residual after anchoring)", async () => {
  // linear chain: no in-layer ties — this checks determinism, not the tie-break mechanism
  const seed = makeNode("top.u_tc", "u_tc", "tc|/r.v", "module", [P("a", "in"), P("x", "out")]);
  const drv = makeNode("top.u_tb", "u_tb", "tb|/r.v", "module", [P("i0", "in"), P("o1", "out")]);
  let g = newSchematic(seed);
  g = addTrace(g, "top.u_tc", "a", [drv], [{
    id: edgeId("top.u_tb", "o1", "top.u_tc", "a"),
    fromNode: "top.u_tb", fromPort: "o1", toNode: "top.u_tc", toPort: "a", netName: "n", bus: false,
  }]);
  const out1 = await layout(toElkGraph(g));
  const prev = Object.fromEntries(out1.children!.map((c) => [c.id, { x: c.x!, y: c.y! }]));
  const src = makeSourceNode({ id: "port:top.p", kind: "port", label: "p", detail: "input port", file: "/r.v", line: 1, bus: false });
  const g2 = addTrace(g, "top.u_tb", "i0", [src], [{
    id: edgeId("port:top.p", "o", "top.u_tb", "i0"),
    fromNode: "port:top.p", fromPort: "o", toNode: "top.u_tb", toPort: "i0", netName: "p", bus: false,
  }]);
  const out2 = await layout(toElkGraph(g2, prev));
  const posOf = (id: string) => { const c = out2.children!.find((q) => q.id === id)!; return { x: c.x!, y: c.y! }; };
  const dx = prev["top.u_tc"].x - posOf("top.u_tc").x;
  const dy = prev["top.u_tc"].y - posOf("top.u_tc").y;
  for (const id of ["top.u_tc", "top.u_tb"]) {
    const p2 = posOf(id);
    assert.ok(Math.abs(p2.x + dx - prev[id].x) < 0.5, `${id} x still (anchored)`);
    assert.ok(Math.abs(p2.y + dy - prev[id].y) < 0.5, `${id} y still (anchored)`);
  }
});

test("boundsOf covers boxes and wire points with padding; empty -> null", () => {
  const node = makeNode("t.u", "u", "m|/rtl/m.v", "module", [P("i", "in")]);
  const g = newSchematic(node);
  const elkOut = {
    id: "root",
    children: [{ id: "t.u", x: 100, y: 50, width: 130, height: 80,
      ports: [{ id: portId("t.u", "i"), x: -3, y: 43, width: 6, height: 6 }] }],
    edges: [],
  } as unknown as LaidOutGraph;
  const laid = toLaid(elkOut, g.nodes, g.edges);
  laid.wires.push({ id: "w", points: [0, 0, 300, 200], bus: false, net: "" });
  assert.deepEqual(boundsOf(laid), { x: -20, y: -20, w: 340, h: 240 });
  assert.equal(boundsOf({ boxes: [], wires: [] }), null);
});

test("fitTransform fits and centers; never zooms in past 1x; scale floor 0.05", () => {
  const vp = { w: 800, h: 600 };
  const big = fitTransform({ x: 0, y: 0, w: 1440, h: 520 }, vp);
  assert.equal(big.scale, 0.5); // (800-80)/1440
  const small = fitTransform({ x: 100, y: 100, w: 200, h: 100 }, vp);
  assert.equal(small.scale, 1, "small content stays 1:1");
  assert.equal(small.x + 200 * small.scale, 400, "content center -> viewport center (x)");
  assert.equal(small.y + 150 * small.scale, 300, "content center -> viewport center (y)");
  assert.equal(fitTransform({ x: 0, y: 0, w: 100000, h: 100 }, vp).scale, 0.05, "floor");
});

test("anchorTo keeps the anchor box at its previous on-screen position", () => {
  const node = makeNode("t.u", "u", "m|/rtl/m.v", "module", [P("i", "in")]);
  const g = newSchematic(node);
  const elkOut = {
    id: "root",
    children: [{ id: "t.u", x: 100, y: 50, width: 130, height: 80,
      ports: [{ id: portId("t.u", "i"), x: -3, y: 43, width: 6, height: 6 }] }],
    edges: [],
  } as unknown as LaidOutGraph;
  const laid = toLaid(elkOut, g.nodes, g.edges);
  laid.wires.push({ id: "w", points: [0, 0, 10, 10], bus: false, net: "" });
  const anchored = anchorTo(laid, { "t.u": { x: 160, y: 90 } }, "t.u");
  assert.equal(anchored.boxes[0].x, 160);
  assert.equal(anchored.boxes[0].y, 90);
  assert.equal(anchored.boxes[0].ports[portId("t.u", "i")].x, 150, "port anchor shifted with the box"); // 90 + 60
  assert.equal(anchored.boxes[0].ports[portId("t.u", "i")].y, 136); // 96 + 40
  assert.deepEqual(anchored.wires[0].points, [60, 40, 70, 50]);
  assert.equal(anchorTo(laid, null, "t.u"), laid, "no prev -> unchanged");
  assert.equal(anchorTo(laid, { other: { x: 0, y: 0 } }, "t.u"), laid, "anchor not in prev -> unchanged");
});
