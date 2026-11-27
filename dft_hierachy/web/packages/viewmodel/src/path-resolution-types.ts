/** Single path lookup in one snapshot. Normative behavior: DESIGN section 6.26. */
import type { HierError, Reply } from "@hier/client";
import type { ResultOf, SnapshotId } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { registerModelError } from "./model-error-brand.js";

export interface PathResolutionQuery {
  readonly snapshotId: SnapshotId;
  readonly text: string;
}
export type PathResolutionReply = Reply<ResultOf<"path.resolve">>;
export type PathResolutionErrorCode =
  | "invalid_argument"
  | "snapshot_mismatch"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";
export class PathResolutionError extends Error {
  constructor(
    readonly code: PathResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PathResolutionError";
    registerModelError(this, PathResolutionError);
  }
}
export interface PathResolutionFailure {
  readonly code: PathResolutionErrorCode | HierError["code"];
  readonly origin: "path_resolution" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}
export type PathResolutionState =
  | {
      readonly status: "idle";
      readonly query: null;
      readonly reply?: never;
      readonly error?: never;
    }
  | {
      readonly status: "pending";
      readonly query: PathResolutionQuery;
      readonly reply?: never;
      readonly error?: never;
    }
  | {
      readonly status: "success";
      readonly query: PathResolutionQuery;
      readonly reply: PathResolutionReply;
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly query: PathResolutionQuery;
      readonly reply?: never;
      readonly error: PathResolutionFailure;
    };
