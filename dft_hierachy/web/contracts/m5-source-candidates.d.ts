/** DESIGN 6.11 proposal; no production export or implementation. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type { FileRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

export interface SourceCandidatesQuery {
  readonly snapshotId: SnapshotId;
  readonly file: FileRef;
  readonly line: number;
  readonly col?: number;
}
export interface SourceCandidatesOptions {
  readonly pageSize?: number;
}
export type SourceCandidatesPage = Reply<ResultOf<"source.resolve">>;
export type SourceCandidatesErrorCode =
  | "invalid_options"
  | "invalid_argument"
  | "snapshot_mismatch"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";
export declare class SourceCandidatesError extends Error {
  readonly code: SourceCandidatesErrorCode;
  constructor(code: SourceCandidatesErrorCode, message: string);
}
export interface SourceCandidatesFailure {
  readonly code: SourceCandidatesErrorCode | HierError["code"];
  readonly origin: "source_candidates" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}
export type SourceCandidatesState =
  | {
      readonly status: "idle";
      readonly query: null;
      readonly pages: readonly SourceCandidatesPage[];
      readonly error?: never;
    }
  | {
      readonly status: "pending" | "success";
      readonly query: SourceCandidatesQuery;
      readonly pages: readonly SourceCandidatesPage[];
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly query: SourceCandidatesQuery;
      readonly pages: readonly SourceCandidatesPage[];
      readonly error: SourceCandidatesFailure;
    };
export declare class SourceCandidatesModel {
  constructor(client: HierClient, options?: SourceCandidatesOptions);
  readonly snapshotId: SnapshotId;
  readonly state: SourceCandidatesState;
  readonly disposed: boolean;
  load(query: SourceCandidatesQuery): Promise<void>;
  loadMore(): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
