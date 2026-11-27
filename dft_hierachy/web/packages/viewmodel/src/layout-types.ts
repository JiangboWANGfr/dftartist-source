/** Geometry and lifecycle types. Normative behavior: DESIGN section 6.29. */
import type { SnapshotId } from "@hier/protocol-types";
import type { GraphEdgeId, GraphNodeId, GraphSessionId } from "./graph-types.js";
import { registerModelError } from "./model-error-brand.js";

declare const taskBrand: unique symbol;
export type LayoutTaskId = string & { readonly [taskBrand]: true };
export type LayoutDirection = "RIGHT" | "DOWN" | "LEFT" | "UP";
export type LayoutPortSide = "NORTH" | "EAST" | "SOUTH" | "WEST";

/** Display anchors, not new Core port or connection facts. Keys are node-local. */
export interface LayoutPortInput {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly side: LayoutPortSide;
}
export interface LayoutNodeInput {
  readonly id: GraphNodeId;
  readonly width: number;
  readonly height: number;
  readonly ports: readonly LayoutPortInput[];
}
export interface LayoutEdgeInput {
  readonly id: GraphEdgeId;
  readonly fromPort?: string;
  readonly toPort?: string;
}
/** Flat, complete projection of one published graph revision. No semantic DTO copies. */
export interface LayoutProjection {
  readonly sessionId: GraphSessionId;
  readonly graphRevision: number;
  readonly direction: LayoutDirection;
  readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[];
}
export interface LayoutIdentity {
  readonly sessionId: GraphSessionId;
  readonly snapshotId: SnapshotId;
  readonly graphRevision: number;
  readonly taskId: LayoutTaskId;
}
export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}
export interface LayoutPortGeometry extends LayoutPoint {
  readonly key: string;
  readonly width: number;
  readonly height: number;
}
export interface LayoutNodeGeometry extends LayoutPoint {
  readonly id: GraphNodeId;
  readonly width: number;
  readonly height: number;
  /** Coordinates relative to this node; negative positions can be valid. */
  readonly ports: readonly LayoutPortGeometry[];
}
export interface LayoutEdgeGeometry {
  readonly id: GraphEdgeId;
  /** Copied from the captured GraphSession members, never inferred from ELK output. */
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly fromPort?: string;
  readonly toPort?: string;
  /** Each section contains start, zero or more bend points, and end, in root coordinates. */
  readonly sections: readonly (readonly LayoutPoint[])[];
}
export interface LayoutResult extends LayoutIdentity {
  readonly direction: LayoutDirection;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly LayoutNodeGeometry[];
  readonly edges: readonly LayoutEdgeGeometry[];
}
export type LayoutErrorCode =
  | "invalid_argument"
  | "stale_graph"
  | "cancelled"
  | "superseded"
  | "disposed"
  | "reentrant_change"
  | "worker_failure"
  | "layout_failure"
  | "timeout"
  | "invalid_result"
  | "identity_exhausted";
export class LayoutError extends Error {
  constructor(
    readonly code: LayoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LayoutError";
    registerModelError(this, LayoutError);
  }
}
export interface LayoutFailure {
  readonly code: LayoutErrorCode;
  readonly origin: "layout_service";
  readonly message: string;
}
interface LayoutStateBase {
  readonly sessionId: GraphSessionId;
  readonly snapshotId: SnapshotId;
  /** Current graph revision. A retained result can have a different revision. */
  readonly graphRevision: number;
}
/** Shared internal lifecycle shape; public graph/display identities stay separate. */
export type LayoutStateOf<
  Identity extends LayoutIdentity,
  Result extends LayoutIdentity,
> = LayoutStateBase &
  (
    | {
        readonly status: "idle" | "stale";
        readonly request: null;
        readonly result: Result | null;
        readonly error?: never;
      }
    | {
        readonly status: "pending";
        readonly request: Identity;
        readonly result: Result | null;
        readonly error?: never;
      }
    | {
        readonly status: "success";
        readonly request: Identity;
        readonly result: Result;
        readonly error?: never;
      }
    | {
        readonly status: "failed" | "cancelled";
        readonly request: Identity;
        readonly result: Result | null;
        readonly error: LayoutFailure;
      }
    | {
        readonly status: "disposed";
        readonly request: null;
        readonly result: null;
        readonly error?: never;
      }
  );
export type LayoutState = LayoutStateOf<LayoutIdentity, LayoutResult>;
export interface LayoutServiceOptions {
  /** Returns a fresh dedicated native Worker running the pinned ELK worker asset. */
  readonly workerFactory: () => Worker;
  /** Required host deadline, integer 1..2147483647; includes Worker startup. */
  readonly timeoutMs: number;
}
