import { content } from "../independent-schematic-view/input.mjs";

export async function setup(M, size) {
  const graph = new M.GraphSession({ snapshot: { snapshotId: "A-selection-lookup" } });
  const selection = new M.SelectionModel({ snapshotId: graph.snapshotId, historyLimit: 8 });
  const source = graph.registerSource({ label: "A selection source", origin: "analysis" });
  const fragment = size === undefined ? content(graph.snapshotId) : {
    snapshotId: graph.snapshotId,
    nodes: Array.from({ length: size }, (_, i) => ({ kind: "external", key: `n/${i}`, label: `node ${i}`, ports: [], target: { ref: `A/ref/${i}`, bits: { lsb: i, width: i % 2 }, ...(i % 2 ? { side: "inside" } : {}) } })),
    edges: size ? [{ kind: "external", key: "tail", label: "tail edge", from: { node: { kind: "external", key: `n/${Math.max(0, size - 2)}` } }, to: { node: { kind: "external", key: `n/${size - 1}` } } }] : [],
    completeness: { status: "complete", reasons: [] }, frontier: [], hasConservative: false,
  };
  await source.replace(fragment);
  return { graph, selection, source, fragment, target(kind, id) { return { sessionId: graph.id, graphRevision: graph.state.revision, kind, id }; }, close() { graph.dispose(); selection.dispose(); } };
}

export function countLookups(graph, run) {
  const originalFind = Array.prototype.find, originalMap = Array.prototype.map;
  const nodes = graph.state.nodes, edges = graph.state.edges;
  const counts = { nodeFind: 0, edgeFind: 0, nodeMap: 0, edgeMap: 0 };
  const wrap = (method, key) => function (fn, self) {
    const name = this === nodes ? `node${key}` : this === edges ? `edge${key}` : undefined;
    return method.call(this, name ? function (...args) { counts[name]++; return fn.apply(this, args); } : fn, self);
  };
  Array.prototype.find = wrap(originalFind, "Find"); Array.prototype.map = wrap(originalMap, "Map");
  try { run(); } finally { Array.prototype.find = originalFind; Array.prototype.map = originalMap; }
  return counts;
}
