/** Compile-only proposal; not a production export. DESIGN section 6.26. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type { ResultOf, SnapshotId } from "@hier/protocol-types";
import type { SelectionModel, TreeDiagnosticIssue } from "@hier/viewmodel";
import type { ReactElement } from "react";

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
export declare class PathResolutionError extends Error {
  readonly code: PathResolutionErrorCode;
  constructor(code: PathResolutionErrorCode, message: string);
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
export declare class PathResolutionModel {
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: PathResolutionState;
  readonly disposed: boolean;
  load(query: PathResolutionQuery): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
export type PathResolutionViewCommand = "reload" | "cancel" | "select";
export type PathResolutionViewFailure =
  | {
      readonly command: "reload" | "cancel";
      readonly query: PathResolutionQuery;
      readonly reply?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: PathResolutionQuery;
      readonly reply: PathResolutionReply;
      readonly itemIndex: number;
      readonly error: unknown;
    };
export interface PathResolutionViewProps {
  readonly resolution: PathResolutionModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: PathResolutionViewFailure) => void;
}
export declare function PathResolutionView(
  props: PathResolutionViewProps,
): ReactElement;

// B compile-only alias forwards existing real public viewmodel dependencies.
export * from "@hier/existing-viewmodel";
