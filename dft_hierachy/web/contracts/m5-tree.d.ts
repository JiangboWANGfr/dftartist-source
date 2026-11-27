/** M5-A-02a contract proposal; section 6.6.6 additions await C/B, not production exports. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  Complete,
  Cursor,
  InstInfo,
  ObjectRef,
  SnapshotId,
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

export declare class TreeError extends Error {
  readonly code: TreeErrorCode;
  constructor(code: TreeErrorCode, message: string);
}

/** Owned diagnostic projection; rejected SDK calls retain their original HierError. */
export interface TreeFailure {
  readonly code: TreeErrorCode | HierError["code"];
  readonly origin: "tree" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  /** Proposed in DESIGN 6.6.6; omitted when data capture succeeds. */
  readonly dataIssue?: TreeDiagnosticIssue;
}

/** Owned metadata only: never retains or coerces the arbitrary thrown value. */
export interface TreeDiagnosticIssue {
  readonly code: "data_read_failed";
  readonly operation: "inspect" | "enumerate" | "read";
  readonly path: readonly string[];
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

export declare class TreeModel {
  /** Construct after client.ready; constructor performs no queries. */
  constructor(client: HierClient, options?: TreeOptions);
  readonly snapshotId: SnapshotId;
  readonly showGenerateScopes: boolean;
  readonly rows: readonly TreeRow[];
  readonly rootState: TreePageState;
  readonly revealState: TreeRevealState;
  readonly disposed: boolean;
  loadRoots(): Promise<void>;
  setExpanded(row: RowId, expanded: boolean): Promise<void>;
  loadMore(row: RowId): Promise<void>;
  reload(row: RowId | null): Promise<void>;
  cancel(row: RowId | null): Promise<void>;
  setShowGenerateScopes(show: boolean): Promise<void>;
  reveal(ref: ObjectRef): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
