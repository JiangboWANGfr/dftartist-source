/** Compile-only proposal; no runtime export. DESIGN section 6.24. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type { DefRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

export interface DefinitionInstancesQuery {
  readonly snapshotId: SnapshotId;
  readonly def: DefRef;
}
export interface DefinitionInstancesOptions {
  readonly pageSize?: number;
}
export type DefinitionInstancesPage = Reply<ResultOf<"def.instances">>;
export type DefinitionInstancesErrorCode =
  | "invalid_options"
  | "invalid_argument"
  | "snapshot_mismatch"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";
export declare class DefinitionInstancesError extends Error {
  readonly code: DefinitionInstancesErrorCode;
  constructor(code: DefinitionInstancesErrorCode, message: string);
}
export interface DefinitionInstancesFailure {
  readonly code: DefinitionInstancesErrorCode | HierError["code"];
  readonly origin: "definition_instances" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}
export type DefinitionInstancesState =
  | {
      readonly status: "idle";
      readonly query: null;
      readonly pages: readonly DefinitionInstancesPage[];
      readonly error?: never;
    }
  | {
      readonly status: "pending" | "success";
      readonly query: DefinitionInstancesQuery;
      readonly pages: readonly DefinitionInstancesPage[];
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly query: DefinitionInstancesQuery;
      readonly pages: readonly DefinitionInstancesPage[];
      readonly error: DefinitionInstancesFailure;
    };
export declare class DefinitionInstancesModel {
  constructor(client: HierClient, options?: DefinitionInstancesOptions);
  readonly snapshotId: SnapshotId;
  readonly state: DefinitionInstancesState;
  readonly disposed: boolean;
  load(query: DefinitionInstancesQuery): Promise<void>;
  loadMore(): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
