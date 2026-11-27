/** Isolated proposal only. Normative behavior: DESIGN section 6.28. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  Completeness,
  NodeId,
  SnapshotId,
  TraceEdge,
  TraceFrontier,
  TraceNode,
} from "@hier/protocol-types";
import type { ObjectSelection, TreeDiagnosticIssue } from "@hier/viewmodel";

type Immutable<T> = T extends readonly (infer V)[]
  ? readonly Immutable<V>[]
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T;

declare const sessionBrand: unique symbol;
declare const sourceBrand: unique symbol;
declare const nodeBrand: unique symbol;
declare const edgeBrand: unique symbol;
export type GraphSessionId = string & { readonly [sessionBrand]: true };
export type GraphSourceId = string & { readonly [sourceBrand]: true };
export type GraphNodeId = string & { readonly [nodeBrand]: true };
export type GraphEdgeId = string & { readonly [edgeBrand]: true };
export type GraphOrigin = "design" | "analysis" | "plan";

export interface GraphPort {
  readonly key: string;
  readonly label: string;
}
export type GraphNodeInput =
  | { readonly kind: "design"; readonly value: Immutable<TraceNode> }
  | {
      readonly kind: "external";
      readonly key: string;
      readonly label: string;
      readonly ports: readonly GraphPort[];
      readonly target?: ObjectSelection;
    };
export type GraphNodeKey =
  | { readonly kind: "design"; readonly id: NodeId }
  | { readonly kind: "external"; readonly key: string };
export interface GraphEndpoint {
  readonly node: GraphNodeKey;
  readonly port?: string;
}
export type GraphEdgeInput =
  | { readonly kind: "design"; readonly value: Immutable<TraceEdge> }
  | {
      readonly kind: "external";
      readonly key: string;
      readonly label: string;
      readonly from: GraphEndpoint;
      readonly to: GraphEndpoint;
    };
export interface GraphFragment {
  readonly snapshotId: SnapshotId;
  readonly nodes: readonly GraphNodeInput[];
  readonly edges: readonly GraphEdgeInput[];
  readonly completeness: Immutable<Completeness>;
  readonly frontier: readonly Immutable<TraceFrontier>[];
  readonly hasConservative: boolean;
}

export interface GraphNodeMember {
  readonly id: GraphNodeId;
  readonly node: GraphNodeInput;
  readonly owners: readonly GraphSourceId[];
}
export interface GraphEdgeMember {
  readonly id: GraphEdgeId;
  readonly edge: GraphEdgeInput;
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly owners: readonly GraphSourceId[];
}
export interface GraphSourceContent {
  readonly sourceRevision: number;
  readonly nodes: readonly GraphNodeId[];
  readonly edges: readonly GraphEdgeId[];
  readonly completeness: Immutable<Completeness>;
  readonly frontier: readonly Immutable<TraceFrontier>[];
  readonly hasConservative: boolean;
}
export type GraphSessionErrorCode =
  | "invalid_argument"
  | "snapshot_mismatch"
  | "conflicting_fact"
  | "disposed"
  | "source_disposed"
  | "cancelled"
  | "source_failure"
  | "reentrant_change"
  | "revision_exhausted";
export declare class GraphSessionError extends Error {
  readonly code: GraphSessionErrorCode;
  constructor(code: GraphSessionErrorCode, message: string);
}
export interface GraphSourceFailure {
  readonly code: GraphSessionErrorCode | HierError["code"];
  readonly origin: "graph_session" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}
interface GraphSourceStateBase {
  readonly id: GraphSourceId;
  readonly label: string;
  readonly origin: GraphOrigin;
  readonly revision: number;
  readonly content: GraphSourceContent | null;
}
export type GraphSourceState = GraphSourceStateBase &
  (
    | { readonly status: "idle" | "pending" | "success"; readonly error?: never }
    | {
        readonly status: "failed" | "cancelled";
        readonly error: GraphSourceFailure;
      }
    | { readonly status: "disposed"; readonly error?: never; readonly content: null }
  );
export interface GraphSessionState {
  readonly sessionId: GraphSessionId;
  readonly snapshotId: SnapshotId;
  readonly revision: number;
  readonly sources: readonly GraphSourceState[];
  readonly nodes: readonly GraphNodeMember[];
  readonly edges: readonly GraphEdgeMember[];
}
export interface GraphSourceOptions {
  readonly label: string;
  readonly origin: GraphOrigin;
}
export interface GraphLoadContext {
  readonly sessionId: GraphSessionId;
  readonly snapshotId: SnapshotId;
  readonly sourceId: GraphSourceId;
  readonly sourceRevision: number;
  readonly signal: AbortSignal;
}
export type GraphLoader = (context: GraphLoadContext) => GraphFragment | Promise<GraphFragment>;

/** Allocated only by GraphSession; no public constructor or caller-chosen ID. */
export interface GraphSource {
  readonly id: GraphSourceId;
  readonly state: GraphSourceState;
  readonly disposed: boolean;
  replace(fragment: GraphFragment): Promise<void>;
  refresh(loader: GraphLoader): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  dispose(): Promise<void>;
}
export declare class GraphSession {
  constructor(client: HierClient);
  readonly id: GraphSessionId;
  readonly snapshotId: SnapshotId;
  readonly state: GraphSessionState;
  readonly disposed: boolean;
  registerSource(options: GraphSourceOptions): GraphSource;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
