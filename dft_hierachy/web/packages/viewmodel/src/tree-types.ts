/** Public remote-tree state. Normative behavior: DESIGN section 6.6. */
import type { HierError, Reply } from "@hier/client";
import type {
  Complete,
  Cursor,
  InstInfo,
  ObjectRef,
} from "@hier/protocol-types";

declare const rowIdBrand: unique symbol;
export type RowId = string & { readonly [rowIdBrand]: true };
export type TreeInstance = Reply<InstInfo>["result"];
/** Navigation replies are Complete under the current method-specific Schema. */
export type TreeCompleteness = Reply<Complete>["result"];

export type TreeErrorCode =
  | "invalid_options"
  | "invalid_argument"
  | "invalid_row"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";

export class TreeError extends Error {
  constructor(
    readonly code: TreeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TreeError";
  }
}

export interface TreeDiagnosticIssue {
  readonly code: "data_read_failed";
  readonly operation: "inspect" | "enumerate" | "read";
  readonly path: readonly string[];
}

/** Owned diagnostic projection; rejected SDK calls retain their original HierError. */
export interface TreeFailure {
  readonly code: TreeErrorCode | HierError["code"];
  readonly origin: "tree" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}

interface TreePageData {
  readonly loadedCount: number;
  readonly next?: Cursor;
  readonly completeness?: TreeCompleteness;
}

export type TreePageState = TreePageData &
  (
    | {
        readonly status: "idle" | "pending" | "success";
        readonly error?: never;
      }
    | { readonly status: "failed" | "cancelled"; readonly error: TreeFailure }
  );

interface TreeRowBase {
  readonly id: RowId;
  readonly parentId: RowId | null;
  readonly depth: number;
}

export interface InstanceTreeRow extends TreeRowBase {
  readonly kind: "instance";
  readonly instance: TreeInstance;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly children: TreePageState;
}

export interface ScopeTreeRow extends TreeRowBase {
  readonly kind: "scope";
  readonly owner: ObjectRef;
  readonly scopePath: readonly string[];
  readonly label: string;
  readonly expanded: boolean;
}

export interface StatusTreeRow extends TreeRowBase {
  readonly kind: "status";
  readonly owner: RowId | null;
  readonly state: TreePageState;
}

export type TreeRow = InstanceTreeRow | ScopeTreeRow | StatusTreeRow;

export type TreeRevealState =
  | { readonly status: "idle" }
  | { readonly status: "pending"; readonly ref: ObjectRef }
  | {
      readonly status: "success";
      readonly ref: ObjectRef;
      readonly rowId: RowId;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly ref: ObjectRef;
      readonly error: TreeFailure;
    };

export interface TreeOptions {
  readonly showGenerateScopes?: boolean;
  readonly pageSize?: number;
}
