// Reuse B87 legal Schema7 DTOs, not A consumers or implementation.
import { content as original, expected, edgeItems } from "../independent-schematic-view/input.mjs";
export { expected, edgeItems };
const ext = (key, from, to) => ({
  kind: "external",
  key,
  label: "edge " + key,
  from: {
    node: {
      kind: from.startsWith("B-") ? "design" : "external",
      ...(from.startsWith("B-") ? { id: from } : { key: from }),
    },
  },
  to: {
    node: {
      kind: to.startsWith("B-") ? "design" : "external",
      ...(to.startsWith("B-") ? { id: to } : { key: to }),
    },
  },
});
export function content(snapshotId) {
  const f = original(snapshotId),
    reverse = structuredClone(f.edges[0]);
  Object.assign(reverse.value, {
    id: "B-reverse",
    fact: "B93:reverse",
    from: "B-y",
    to: "B-x",
    fromBits: { lsb: 0, width: 2 },
    toBits: { lsb: 2, width: 2 },
    map: [{ from: 0, to: 2, width: 2 }],
  });
  f.edges.push(
    reverse,
    ext("boundary-y", "ext", "B-y"),
    ext("other-from", "no-target", "B-x"),
    ext("parallel-x", "ext", "B-x"),
    ext("reverse-external", "B-x", "ext"),
    ext("nil-loop", "no-target", "no-target"),
  );
  return f;
}
export const nodeKey = (m) => (m.node.kind === "design" ? m.node.value.id : m.node.key);
export const edgeKey = (m) => (m.edge.kind === "design" ? m.edge.value.id : m.edge.key);
export const node = (g, key) => g.state.nodes.find((m) => nodeKey(m) === key);
export const edge = (g, key) => g.state.edges.find((m) => edgeKey(m) === key);
export const hierarchy = (g, key = "H", keys = ["B-x", "B-y"], label = " group <&> ") => ({
  kind: "hierarchy",
  key,
  label,
  nodes: keys.map((k) => node(g, k).id),
});
export const bus = (
  g,
  key = "BUS",
  keys = ["external-edge", "boundary-y", "parallel-x", "other-from", "reverse-external", "B-low"],
  label = " bus <&> ",
) => ({ kind: "bus", key, label, edges: keys.map((k) => edge(g, k).id) });
export const fullOptions = (g) => ({ groups: [hierarchy(g), bus(g)], collapsed: ["H", "BUS"] });
export function expectedItems(m) {
  if (m.edge?.kind === "design") {
    if (m.edge.value.id === "B-reverse") return [...edgeItems("B-low")].reverse();
    return edgeItems(m.edge.value.id);
  }
  if (m.edge) {
    const external = { ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" };
    const x = expected["B-x"],
      y = expected["B-y"];
    return {
      "external-edge": [external, ...x],
      "boundary-y": [external, ...y],
      "parallel-x": [external, ...x],
      "other-from": x,
      "reverse-external": [...x, external],
      "nil-loop": [],
    }[m.edge.key];
  }
  return m.node.kind === "design"
    ? expected[m.node.value.id]
    : m.node.key === "ext"
      ? [{ ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" }]
      : [];
}
export const unique = (items) => [...new Map(items.map((x) => [JSON.stringify(x), x])).values()];
