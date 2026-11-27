// One-off smoke: build the exact-circuit schematic from the REAL design's walk output
// (/tmp/crt.json produced by `hdl serve` on processor_core). Not part of the test suite.
import { readFileSync } from "node:fs";
import { buildCrSchematic, collapseHierarchy } from "../src/hierarchy/core/crSchematic.ts";
import type { CrPathItem } from "../src/core-bridge/model.ts";

let items: CrPathItem[] = [];
for (const line of readFileSync("/tmp/crt.json", "utf8").split("\n")) {
  if (!line.trim()) continue;
  const o = JSON.parse(line);
  if (o.result?.items) items = o.result.items;
}
const roots = ["processor_core"];
for (const kind of ["clock", "reset"] as const) {
  const sub = items.filter((i) => i.kind === kind);
  const bad = (i: CrPathItem) => (i.kind === "reset" ? !i.ok : i.value !== "010" && i.value !== "101");
  const g = buildCrSchematic(sub, { seedId: "s", roots, isBad: bad });
  const ns = Object.values(g.nodes);
  const containers = ns.filter((n) => ns.some((m) => m.parentId === n.id)).length;
  const orphanEdges = g.edges.filter((e) => !g.nodes[e.fromNode] || !g.nodes[e.toNode]).length;
  const badPort = g.edges.filter((e) =>
    !g.nodes[e.fromNode]?.ports.some((p) => p.name === e.fromPort) ||
    !g.nodes[e.toNode]?.ports.some((p) => p.name === e.toPort)).length;
  console.log(`${kind}: items=${sub.length} nodes=${ns.length} (containers=${containers}, ` +
    `dff=${ns.filter((n) => n.prim === "dff").length}, gates=${ns.filter((n) => n.prim && n.prim !== "dff").length}, ` +
    `cells=${ns.filter((n) => n.kind === "blackbox").length}, alerts=${ns.filter((n) => n.alert).length}) ` +
    `edges=${g.edges.length} orphanEdges=${orphanEdges} edgesMissingPort=${badPort}`);

  // Progressive disclosure: closed top view, then one level opened.
  for (const open of [new Set<string>(), new Set(["processor_core.PROCESSOR_1"])]) {
    const c = collapseHierarchy(g, open);
    const cn = Object.values(c.nodes);
    const bad2 = c.edges.filter((e) =>
      !c.nodes[e.fromNode]?.ports.some((p) => p.name === e.fromPort) ||
      !c.nodes[e.toNode]?.ports.some((p) => p.name === e.toPort)).length;
    console.log(`  collapsed(open=[${[...open].join(",") || "-"}]): nodes=${cn.length} edges=${c.edges.length} ` +
      `alerts=${cn.filter((n) => n.alert).length} badPortEdges=${bad2} ` +
      `top=[${cn.filter((n) => !n.parentId).map((n) => n.instanceName).join(" | ")}]`);
  }
}
