/** Shared original-member display semantics for flat and folded projections. */
import type { Side } from "@hier/protocol-types";
import type { GraphEdgeMember, GraphNodeMember, GraphSessionState } from "./graph-types.js";
import type { ObjectSelection, SelectionBits } from "./selection-types.js";
import { readSelection } from "./selection-input.js";

export function normalized(
  items: readonly ObjectSelection[],
  state: GraphSessionState,
): readonly ObjectSelection[] {
  // Reuse the single selection boundary, including exact deduplication and omission rules.
  return readSelection({ snapshotId: state.snapshotId, origin: "graph", items }, () => false)
    .items as readonly ObjectSelection[];
}
export function nodeItems(member: GraphNodeMember): readonly ObjectSelection[] {
  const node = member.node;
  if (node.kind === "external") return node.target ? [node.target] : [];
  const value = node.value;
  if (value.point) {
    // The GraphSession boundary has already validated TracePoint's Slice schema.
    // Generated Slice1 retains open fields, so narrow only these known schema fields.
    const point = value.point as unknown as {
      readonly slice: ObjectSelection;
      readonly side?: Side;
    };
    return [
      {
        ref: point.slice.ref,
        bits: point.slice.bits!,
        ...(point.side === undefined ? {} : { side: point.side }),
      },
    ];
  }
  return value.ref === undefined ? [] : [{ ref: value.ref }];
}
export function edgeItems(
  member: GraphEdgeMember,
  nodes: ReadonlyMap<string, readonly ObjectSelection[]>,
): readonly ObjectSelection[] {
  const endpoint = (id: string, bits?: SelectionBits): readonly ObjectSelection[] =>
    (nodes.get(id) ?? []).map((item) => (bits === undefined ? item : { ...item, bits }));
  const value = member.edge.kind === "design" ? member.edge.value : undefined;
  return [...endpoint(member.from, value?.fromBits), ...endpoint(member.to, value?.toBits)];
}

export function nodeLabel(member: GraphNodeMember): string {
  const node = member.node;
  return node.kind === "external"
    ? node.label
    : `${node.value.kind}: ${node.value.point?.slice.ref ?? node.value.ref ?? node.value.id}`;
}
export function edgeLabel(member: GraphEdgeMember): string {
  return member.edge.kind === "external"
    ? member.edge.label
    : `${member.edge.value.kind}: ${member.edge.value.fact}`;
}
