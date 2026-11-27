/** Lossless display projection types. Normative behavior: DESIGN section 6.32. */
import type { GraphNodeId, GraphEdgeId, GraphNodeMember, GraphEdgeMember } from "./graph-types.js";
import type { ObjectSelection } from "./selection-types.js";

declare const projectionBrand: unique symbol;
declare const nodeBrand: unique symbol;
declare const edgeBrand: unique symbol;
export type FoldProjectionId = string & { readonly [projectionBrand]: true };
export type DisplayNodeId = string & { readonly [nodeBrand]: true };
export type DisplayEdgeId = string & { readonly [edgeBrand]: true };

export interface HierarchyFoldGroup {
  readonly kind: "hierarchy";
  readonly key: string;
  readonly label: string;
  readonly nodes: readonly GraphNodeId[];
}
export interface BusFoldGroup {
  readonly kind: "bus";
  readonly key: string;
  readonly label: string;
  readonly edges: readonly GraphEdgeId[];
}
export type GraphFoldGroup = HierarchyFoldGroup | BusFoldGroup;
export interface GraphFoldOptions {
  readonly groups: readonly GraphFoldGroup[];
  readonly collapsed: readonly string[];
}
export interface FoldedGraphNodeTarget {
  readonly projectionId: FoldProjectionId;
  readonly kind: "node";
  readonly id: DisplayNodeId;
}
export interface FoldedGraphEdgeTarget {
  readonly projectionId: FoldProjectionId;
  readonly kind: "edge";
  readonly id: DisplayEdgeId;
}
export type FoldedGraphTarget = FoldedGraphNodeTarget | FoldedGraphEdgeTarget;

interface NodeBase {
  readonly target: FoldedGraphNodeTarget;
  readonly label: string;
  readonly items: readonly ObjectSelection[];
  readonly internalEdges: readonly GraphEdgeMember[];
}
export type FoldedGraphNode = NodeBase &
  (
    | {
        readonly kind: "member";
        readonly groupKey?: never;
        readonly members: readonly [GraphNodeMember];
      }
    | {
        readonly kind: "hierarchy";
        readonly groupKey: string;
        readonly members: readonly GraphNodeMember[];
      }
  );
interface EdgeBase {
  readonly target: FoldedGraphEdgeTarget;
  readonly label: string;
  readonly from: DisplayNodeId;
  readonly to: DisplayNodeId;
  readonly items: readonly ObjectSelection[];
}
export type FoldedGraphEdge = EdgeBase &
  (
    | {
        readonly kind: "member";
        readonly groupKey?: never;
        readonly members: readonly [GraphEdgeMember];
      }
    | {
        readonly kind: "bus";
        readonly groupKey: string;
        readonly members: readonly GraphEdgeMember[];
      }
  );

export type FoldProjectionErrorCode =
  "invalid_argument" | "disposed" | "stale_graph" | "snapshot_mismatch" | "not_selectable";
export class FoldProjectionError extends Error {
  constructor(
    readonly code: FoldProjectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FoldProjectionError";
  }
}
