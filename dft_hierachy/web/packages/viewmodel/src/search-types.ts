/** Public snapshot search pages. Normative behavior: DESIGN section 6.22. */
import type { HierError, Reply } from "@hier/client";
import type {
  HitKind,
  ObjectRef,
  ResultOf,
  SnapshotId,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";

import { registerModelError } from "./model-error-brand.js";

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
export class SearchError extends Error {
  constructor(
    readonly code: SearchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SearchError";
    registerModelError(this, SearchError);
  }
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
