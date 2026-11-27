/** Pure display projection. Normative behavior: DESIGN section 6.30. */
import type {
  GraphEdgeId,
  GraphEdgeMember,
  GraphNodeId,
  GraphNodeMember,
  GraphSessionId,
  GraphSessionState,
} from "./graph-types.js";
import type { LayoutProjection } from "./layout-types.js";
import type { ObjectSelection } from "./selection-types.js";

interface GraphTargetBase {
  readonly sessionId: GraphSessionId;
  readonly graphRevision: number;
}
export interface GraphNodeTarget extends GraphTargetBase {
  readonly kind: "node";
  readonly id: GraphNodeId;
}
export interface GraphEdgeTarget extends GraphTargetBase {
  readonly kind: "edge";
  readonly id: GraphEdgeId;
}
export type GraphElementTarget = GraphNodeTarget | GraphEdgeTarget;

export interface ProjectedGraphNode {
  readonly target: GraphNodeTarget;
  /** The original immutable member, not a second semantic DTO. */
  readonly member: GraphNodeMember;
  readonly label: string;
  readonly items: readonly ObjectSelection[];
}
export interface ProjectedGraphEdge {
  readonly target: GraphEdgeTarget;
  readonly member: GraphEdgeMember;
  readonly label: string;
  readonly items: readonly ObjectSelection[];
}
export interface GraphProjection {
  /** The captured GraphSession.state reference. */
  readonly state: GraphSessionState;
  readonly nodes: readonly ProjectedGraphNode[];
  readonly edges: readonly ProjectedGraphEdge[];
  readonly layout: LayoutProjection;
}

export type GraphProjectionErrorCode =
  "invalid_argument" | "disposed" | "snapshot_mismatch" | "stale_graph" | "not_selectable";
export class GraphProjectionError extends Error {
  constructor(
    readonly code: GraphProjectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GraphProjectionError";
  }
}
