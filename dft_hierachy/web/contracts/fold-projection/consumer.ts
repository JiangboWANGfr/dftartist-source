import { createElement } from "react";
import {
  createGraphProjection,
  selectGraphElement,
  resolveObjectAnnotations,
  type AnnotationLayer,
  type GraphSession,
  type GraphNodeId,
  type GraphEdgeId,
  type GraphNodeMember,
  type GraphEdgeMember,
  type LayoutProjection,
  type LayoutService,
  type SelectionModel,
  type ObjectSelection,
} from "@hier/viewmodel";
import { SchematicView, type SchematicViewProps } from "@hier/views";
import {
  FoldedGraphProjection,
  createFoldedGraphProjection,
  selectFoldedGraphElement,
  type GraphFoldGroup,
  type GraphFoldOptions,
  type FoldedGraphTarget,
  type FoldedGraphNode,
  type FoldedGraphEdge,
  type FoldProjectionErrorCode,
  type DisplayNodeId,
  type DisplayEdgeId,
} from "./proposal.js";

// Compile-only host composition. Models and layers are borrowed real published
// types; no proposal.js runtime, fake graph, selection, or layout is supplied.
export function inspectFoldedGraph(
  graph: GraphSession,
  selection: SelectionModel,
  options: GraphFoldOptions,
  annotations: readonly AnnotationLayer[],
) {
  const projection = createFoldedGraphProjection(graph, options);
  return {
    projection,
    // The host explicitly chooses a new immutable projection when its intent changes.
    withCollapsed: (collapsed: readonly string[]) =>
      createFoldedGraphProjection(graph, { groups: projection.options.groups, collapsed }),
    expanded: () =>
      createFoldedGraphProjection(graph, { groups: projection.options.groups, collapsed: [] }),
    select: (target: FoldedGraphTarget) =>
      selectFoldedGraphElement(graph, selection, projection, target),
    nodes: projection.nodes.map((node) => {
      const originals: readonly GraphNodeMember[] = node.members;
      const hiddenEdges: readonly GraphEdgeMember[] = node.internalEdges;
      const exactObjects: readonly ObjectSelection[] = node.items;
      return {
        target: node.target,
        originals,
        hiddenEdges,
        exactObjects,
        marks: resolveObjectAnnotations(
          projection.state.snapshotId,
          exactObjects.map((item) => item.ref),
          annotations,
        ),
      };
    }),
    edges: projection.edges.map((edge) => {
      const originals: readonly GraphEdgeMember[] = edge.members;
      return {
        target: edge.target,
        from: edge.from,
        to: edge.to,
        originals,
        marks: resolveObjectAnnotations(
          projection.state.snapshotId,
          edge.items.map((item) => item.ref),
          annotations,
        ),
      };
    }),
  };
}

// Caller supplies actual member IDs, without decoding ObjectRef or display IDs.
export function explicitGroups(nodes: readonly GraphNodeId[], edges: readonly GraphEdgeId[]) {
  const groups: readonly GraphFoldGroup[] = [
    { kind: "hierarchy", key: "block", label: "Block", nodes },
    { kind: "bus", key: "bus", label: "Bus", edges },
  ];
  return groups;
}

// Existing flat public interfaces and annotations keep their original call shapes.
export async function existingFlatConsumer(props: SchematicViewProps) {
  const flat = createGraphProjection(props.graph, props.direction);
  await props.layout.layout(flat.layout);
  const node = flat.nodes.find((value) => value.items.length > 0);
  if (node) selectGraphElement(props.graph, props.selection, node.target);
  return createElement(SchematicView, props);
}

// Finite A compile witnesses, not B's runtime oracle.
declare const graph: GraphSession;
declare const selection: SelectionModel;
declare const layout: LayoutService;
declare const projection: FoldedGraphProjection;
declare const node: FoldedGraphNode;
declare const edge: FoldedGraphEdge;
declare const graphNodeId: GraphNodeId;
declare const graphEdgeId: GraphEdgeId;
declare const displayNodeId: DisplayNodeId;
declare const displayEdgeId: DisplayEdgeId;
declare const fake: Pick<FoldedGraphProjection, keyof FoldedGraphProjection>;
const options: GraphFoldOptions = { groups: [], collapsed: [] };
createFoldedGraphProjection(graph, options);
selectFoldedGraphElement(graph, selection, projection, node.target);
selectFoldedGraphElement(graph, selection, projection, edge.target);
const nodeTarget: FoldedGraphTarget = {
  projectionId: projection.id,
  kind: "node",
  id: displayNodeId,
};
void nodeTarget;

// @ts-expect-error F01: display nodes are not semantic graph members.
const semanticNode: GraphNodeId = displayNodeId;
// @ts-expect-error F02: display edges are not semantic graph members.
const semanticEdge: GraphEdgeId = displayEdgeId;
// @ts-expect-error F03: targets distinguish node and edge identity namespaces.
const wrongTarget: FoldedGraphTarget = {
  projectionId: projection.id,
  kind: "node",
  id: displayEdgeId,
};
// @ts-expect-error F04: stale-hit fence requires an explicit projection identity.
selectFoldedGraphElement(graph, selection, projection, { kind: "node", id: displayNodeId });
// @ts-expect-error F05: public-shaped substitutes cannot mint projection authority.
selectFoldedGraphElement(graph, selection, fake, node.target);
// @ts-expect-error F06: only the factory constructs a projection.
new FoldedGraphProjection();
// @ts-expect-error F07: captured inputs are immutable.
projection.options.collapsed.push("block");
// @ts-expect-error F08: reverse membership is immutable.
node.members.push(projection.state.nodes[0]!);
// @ts-expect-error F09: hidden edges keep the original readonly representation.
node.internalEdges[0]!.from = graphNodeId;
// @ts-expect-error F10: folding is not a fake flat layout projection.
const oldLayout: LayoutProjection = projection;
// @ts-expect-error F11: the old service is not bypassed with a folded projection.
layout.layout(projection);
createFoldedGraphProjection(graph, {
  // @ts-expect-error F12: a hierarchy group requires original node IDs, not edge IDs.
  groups: [{ kind: "hierarchy", key: "h", label: "H", nodes: [graphEdgeId] }],
  collapsed: [],
});
// @ts-expect-error F13: explicit undefined is not a collapsed list.
createFoldedGraphProjection(graph, { groups: [], collapsed: undefined });
// @ts-expect-error F14: old semantic selection targets cannot be replaced by display targets.
selectGraphElement(graph, selection, node.target);
// @ts-expect-error F15: projections do not own disposable model resources.
projection.dispose();
// @ts-expect-error F16: visible edge endpoints are display node identities.
const wrongEndpoint: DisplayNodeId = edge.members[0]!.from;
// @ts-expect-error F17: selection semantics are provided by the mapped original objects.
edge.items[0]!.ref = "invented-group-ref";
// @ts-expect-error F18: no implicit geometry/async error surface is added to the projection.
const wrongError: FoldProjectionErrorCode = "worker_failure";
