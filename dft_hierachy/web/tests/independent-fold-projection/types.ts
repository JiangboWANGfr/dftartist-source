import {
  createFoldedGraphProjection,
  selectFoldedGraphElement,
  FoldedGraphProjection,
  FoldProjectionError,
} from "@B/fold";
import type {
  FoldProjectionId,
  DisplayNodeId,
  DisplayEdgeId,
  FoldedGraphNodeTarget,
  FoldedGraphEdgeTarget,
  FoldedGraphNode,
  FoldedGraphEdge,
  GraphFoldOptions,
  GraphFoldGroup,
  FoldProjectionErrorCode,
} from "@B/fold";
import {
  createGraphProjection,
  selectGraphElement,
  resolveObjectAnnotations,
} from "@hier/viewmodel";
import type {
  GraphSession,
  SelectionModel,
  GraphNodeId,
  GraphEdgeId,
  GraphNodeMember,
  GraphEdgeMember,
  LayoutService,
  GraphProjectionErrorCode,
  AnnotationLayer,
} from "@hier/viewmodel";
declare const graph: GraphSession, selection: SelectionModel, n: GraphNodeId, e: GraphEdgeId;
declare const layout: LayoutService, layers: readonly AnnotationLayer[];
const options: GraphFoldOptions = {
  groups: [
    { kind: "hierarchy", key: "H", label: "H", nodes: [n] },
    { kind: "bus", key: "B", label: "B", edges: [e, e] },
  ],
  collapsed: ["H"],
};
const p: FoldedGraphProjection = createFoldedGraphProjection(graph, options);
const generation: FoldProjectionId = p.id;
const nodes: readonly FoldedGraphNode[] = p.nodes,
  edges: readonly FoldedGraphEdge[] = p.edges;
for (const node of nodes) {
  const target: FoldedGraphNodeTarget = node.target;
  const display: DisplayNodeId = target.id;
  const members: readonly GraphNodeMember[] = node.members;
  const internal: readonly GraphEdgeMember[] = node.internalEdges;
  if (node.kind === "member") {
    const singleton: readonly [GraphNodeMember] = node.members;
    void singleton;
  } else {
    const group: string = node.groupKey;
    void group;
  }
  resolveObjectAnnotations(
    graph.state.snapshotId,
    node.items.map((i) => i.ref),
    layers,
  );
  selectFoldedGraphElement(graph, selection, p, target);
  void [display, members, internal];
}
for (const edge of edges) {
  const target: FoldedGraphEdgeTarget = edge.target;
  const id: DisplayEdgeId = target.id,
    from: DisplayNodeId = edge.from,
    to: DisplayNodeId = edge.to;
  const members: readonly GraphEdgeMember[] = edge.members;
  if (edge.kind === "member") {
    const singleton: readonly [GraphEdgeMember] = edge.members;
    void singleton;
  } else {
    const group: string = edge.groupKey;
    void group;
  }
  selectFoldedGraphElement(graph, selection, p, target);
  void [id, from, to, members];
}
const codes: readonly FoldProjectionErrorCode[] = [
  "invalid_argument",
  "disposed",
  "stale_graph",
  "snapshot_mismatch",
  "not_selectable",
];
new FoldProjectionError(codes[0]!, "B93");
const old = createGraphProjection(graph);
selectGraphElement(graph, selection, old.nodes[0]!.target);
layout.layout(old.layout);
declare const dn: DisplayNodeId, de: DisplayEdgeId;
// @ts-expect-error T01: display node is not original graph identity
const originalNode: GraphNodeId = dn;
// @ts-expect-error T02: display edge is not original graph identity
const originalEdge: GraphEdgeId = de;
// @ts-expect-error T03: original node is not display node
const displayNode: DisplayNodeId = n;
// @ts-expect-error T04: node and edge display namespaces are nominal
const displayEdge: DisplayEdgeId = dn;
// @ts-expect-error T05: generation is not display node identity
const wrongGeneration: FoldProjectionId = dn;
// @ts-expect-error T06: target needs projection generation
const missing: FoldedGraphNodeTarget = { kind: "node", id: dn };
// @ts-expect-error T07: target discriminant enforces node identity
const wrongKind: FoldedGraphEdgeTarget = { projectionId: generation, kind: "edge", id: dn };
// @ts-expect-error T08: factory owns private constructor
new FoldedGraphProjection();
// @ts-expect-error T09: readonly shape is not a privately branded projection
const fake: FoldedGraphProjection = {
  id: p.id,
  state: p.state,
  options: p.options,
  nodes: p.nodes,
  edges: p.edges,
};
// @ts-expect-error T10: readonly option capture
p.options.collapsed.push("H");
// @ts-expect-error T11: readonly original member list
p.nodes[0]!.members.push(graph.state.nodes[0]!);
// @ts-expect-error T12: readonly hidden edge list
p.nodes[0]!.internalEdges.push(graph.state.edges[0]!);
// @ts-expect-error T13: hierarchy members require original node IDs
const badHierarchy: GraphFoldGroup = { kind: "hierarchy", key: "x", label: "x", nodes: [e] };
// @ts-expect-error T14: bus members require original edge IDs
const badBus: GraphFoldGroup = { kind: "bus", key: "x", label: "x", edges: [n, n] };
// @ts-expect-error T15: member branch has no group key
const badMember: FoldedGraphNode = {
  kind: "member",
  target: { projectionId: generation, kind: "node", id: dn },
  label: "x",
  items: [],
  internalEdges: [],
  members: [graph.state.nodes[0]!],
  groupKey: "x",
};
// @ts-expect-error T16: display projection is not old layout input
layout.layout(p);
// @ts-expect-error T17: display target cannot enter original selection API
selectGraphElement(graph, selection, p.nodes[0]!.target);
// @ts-expect-error T18: original target lacks fold generation and display identity
selectFoldedGraphElement(graph, selection, p, old.nodes[0]!.target);
// @ts-expect-error T19: new errors must not expand original error union
const oldCode: GraphProjectionErrorCode = "new_fold_error";
// @ts-expect-error T20: pure fold is not an asynchronous layout task
new FoldProjectionError("timeout", "B93");
void [
  options,
  p,
  originalNode,
  originalEdge,
  displayNode,
  displayEdge,
  wrongGeneration,
  missing,
  wrongKind,
  fake,
  badHierarchy,
  badBus,
  badMember,
  oldCode,
];
