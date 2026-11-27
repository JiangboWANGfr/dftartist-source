import { groups } from "./fixture.mjs";
export function layoutInput(graph) {
  return {
    sessionId: graph.sessionId,
    graphRevision: graph.revision,
    direction: "RIGHT",
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      width: 140,
      height: 64,
      ports: [
        { key: "in", width: 6, height: 6, side: "WEST" },
        { key: "out", width: 6, height: 6, side: "EAST" },
        { key: "in-high", width: 6, height: 6, side: "WEST" },
        { key: "out-high", width: 6, height: 6, side: "EAST" },
      ],
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      fromPort: e.edge.value.id === "xy-high" ? "out-high" : "out",
      toPort: e.edge.value.id === "xy-high" ? "in-high" : "in",
    })),
  };
}
export const path = (sections) =>
  sections
    .map((points) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "))
    .join(" ");
const item = (member) => ({
  ...member.node.value.point.slice,
  ...(member.node.value.point.side ? { side: member.node.value.point.side } : {}),
});
export function project(graph, layout, selection, folded) {
  const geometry = layout.result;
  if (!geometry)
    return { nodes: [], edges: [], hits: [], width: 900, height: 460, interactive: false };
  const members = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const selected = selection.items;
  const has = (i) =>
    selected.some(
      (s) =>
        s.ref === i.ref &&
        s.bits?.lsb === i.bits.lsb &&
        s.bits?.width === i.bits.width &&
        s.side === i.side,
    );
  let nodes = geometry.nodes
    .filter((n) => members.has(n.id))
    .map((n) => {
      const m = members.get(n.id),
        items = [item(m)];
      return { ...n, label: m.node.value.id, memberIds: [m.id], items, selected: items.every(has) };
    });
  let routes = geometry.edges
    .filter((e) => edges.has(e.id))
    .map((e) => {
      const m = edges.get(e.id),
        fact = m.edge.value;
      const items = [
        { ...item(members.get(m.from)), bits: fact.fromBits },
        { ...item(members.get(m.to)), bits: fact.toBits },
      ];
      return {
        ...e,
        label: fact.id,
        memberIds: [m.id],
        facts: [fact],
        items,
        selected: items.every(has),
      };
    });
  if (folded.bus) {
    const bus = routes.filter((e) => groups.bus.edges.includes(e.label));
    if (bus.length === 2) {
      routes = routes.filter((e) => !bus.includes(e));
      routes.push({
        ...bus[0],
        id: `display:bus:${groups.bus.key}`,
        label: "bus ×2",
        memberIds: bus.flatMap((e) => e.memberIds),
        facts: bus.flatMap((e) => e.facts),
        items: bus.flatMap((e) => e.items),
        selected: bus.every((e) => e.selected),
      });
    }
  }
  if (folded.hierarchy) {
    const children = nodes.filter((n) => groups.hierarchy.nodes.includes(n.label));
    if (children.length === 2) {
      const ids = children.flatMap((n) => n.memberIds);
      const internal = routes.filter((e) => ids.includes(e.from) && ids.includes(e.to));
      routes = routes.filter((e) => !internal.includes(e));
      const x = Math.min(...children.map((n) => n.x)),
        y = Math.min(...children.map((n) => n.y));
      const items = children.flatMap((n) => n.items);
      nodes = nodes.filter((n) => !children.includes(n));
      nodes.push({
        id: `display:hierarchy:${groups.hierarchy.key}`,
        label: "stage · 2 nodes / 1 edge",
        x,
        y,
        width: Math.max(...children.map((n) => n.x + n.width)) - x,
        height: Math.max(...children.map((n) => n.y + n.height)) - y,
        ports: [],
        memberIds: [...ids, ...internal.flatMap((e) => e.memberIds)],
        facts: internal.flatMap((e) => e.facts),
        items,
        selected: items.every(has),
      });
    }
  }
  return {
    nodes,
    edges: routes,
    hits: [...nodes, ...routes],
    width: Math.max(900, geometry.width + 40),
    height: Math.max(460, geometry.height + 40),
    interactive: layout.status === "success" && geometry.graphRevision === graph.revision,
  };
}
