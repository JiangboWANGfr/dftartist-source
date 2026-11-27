/** Public snapshot source candidates. Normative behavior: DESIGN section 6.11. */
import type { HierError, Reply } from "@hier/client";
import type { FileRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { registerModelError } from "./model-error-brand.js";

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

export class SourceCandidatesError extends Error {
  constructor(
    readonly code: SourceCandidatesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceCandidatesError";
    registerModelError(this, SourceCandidatesError);
  }
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
