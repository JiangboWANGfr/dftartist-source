/** Isolated proposal; normative behavior lives in DESIGN section 6.30. */
import type { ReactElement } from "react";
import type {
  GraphEdgeId,
  GraphEdgeMember,
  GraphNodeId,
  GraphNodeMember,
  GraphSession,
  GraphSessionId,
  GraphSessionState,
  LayoutDirection,
  LayoutIdentity,
  LayoutProjection,
  LayoutService,
  ObjectSelection,
  SelectionModel,
} from "@hier/viewmodel";

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
export declare class GraphProjectionError extends Error {
  readonly code: GraphProjectionErrorCode;
  constructor(code: GraphProjectionErrorCode, message: string);
}

/** Pure, complete, flat projection. Default direction is RIGHT. No subscription or I/O. */
export declare function createGraphProjection(
  graph: GraphSession,
  direction?: LayoutDirection,
): GraphProjection;

/** Revalidates the current member and replaces the shared object selection once. */
export declare function selectGraphElement(
  graph: GraphSession,
  selection: SelectionModel,
  target: GraphElementTarget,
): void;

export type SchematicViewCommand = "layout" | "retry" | "cancel" | "select";
export type SchematicViewFailure =
  | {
      readonly command: "layout" | "retry" | "cancel";
      readonly sessionId: GraphSessionId;
      readonly graphRevision: number;
      readonly target?: never;
      readonly layoutIdentity?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly sessionId: GraphSessionId;
      readonly graphRevision: number;
      readonly target: GraphElementTarget;
      readonly layoutIdentity: LayoutIdentity;
      readonly error: unknown;
    };

export interface SchematicViewProps {
  readonly graph: GraphSession;
  readonly layout: LayoutService;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  /** Used by the next explicit layout command; does not schedule an effect. */
  readonly direction?: LayoutDirection;
  readonly className?: string;
  readonly onCommandError?: (failure: SchematicViewFailure) => void;
}
export declare function SchematicView(props: SchematicViewProps): ReactElement;
