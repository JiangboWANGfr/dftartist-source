/** Public definition occurrence pages. Normative behavior: DESIGN section 6.24. */
import type { HierError, Reply } from "@hier/client";
import type { DefRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { registerModelError } from "./model-error-brand.js";

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
export class DefinitionInstancesError extends Error {
  constructor(
    readonly code: DefinitionInstancesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DefinitionInstancesError";
    registerModelError(this, DefinitionInstancesError);
  }
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
