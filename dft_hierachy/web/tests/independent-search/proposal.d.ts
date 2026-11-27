/** Compile-only proposal; no runtime or production export. DESIGN section 6.22. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  HitKind,
  ObjectRef,
  ResultOf,
  SnapshotId,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

export interface SearchQuery {
  readonly snapshotId: SnapshotId;
  readonly text: string;
  readonly kinds?: readonly HitKind[];
  readonly scope?: ObjectRef;
}
export interface SearchOptions {
  readonly pageSize?: number;
}
export type SearchPage = Reply<ResultOf<"search">>;
export type SearchErrorCode =
  | "invalid_options"
  | "invalid_argument"
  | "snapshot_mismatch"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";
export declare class SearchError extends Error {
  readonly code: SearchErrorCode;
  constructor(code: SearchErrorCode, message: string);
}
export interface SearchFailure {
  readonly code: SearchErrorCode | HierError["code"];
  readonly origin: "search" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}
export type SearchState =
  | {
      readonly status: "idle";
      readonly query: null;
      readonly pages: readonly SearchPage[];
      readonly error?: never;
    }
  | {
      readonly status: "pending" | "success";
      readonly query: SearchQuery;
      readonly pages: readonly SearchPage[];
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly query: SearchQuery;
      readonly pages: readonly SearchPage[];
      readonly error: SearchFailure;
    };
export declare class SearchModel {
  constructor(client: HierClient, options?: SearchOptions);
  readonly snapshotId: SnapshotId;
  readonly state: SearchState;
  readonly disposed: boolean;
  load(query: SearchQuery): Promise<void>;
  loadMore(): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
