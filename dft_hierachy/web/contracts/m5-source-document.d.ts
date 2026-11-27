/** DESIGN 6.10 proposal; no production export or runtime implementation. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  DefRef,
  ObjectRef,
  ResultOf,
  SnapshotId,
  SourceKind,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

export type SourceDocumentErrorCode =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";

export declare class SourceDocumentError extends Error {
  readonly code: SourceDocumentErrorCode;
  constructor(code: SourceDocumentErrorCode, message: string);
}

export interface SourceDocumentFailure {
  readonly code: SourceDocumentErrorCode | HierError["code"];
  readonly origin: "source" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}

export interface SourceDocumentTarget {
  readonly ref: ObjectRef | DefRef;
  readonly kind: SourceKind;
}

/** UTF-16 units in the unmodified text: zero-based offset, one-based line/column. */
export interface SourceTextPosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

/** Half-open range; neither endpoint splits a code point or CRLF. */
export interface SourceTextRange {
  readonly start: SourceTextPosition;
  readonly end: SourceTextPosition;
}

export type SourceDocumentLocation =
  | { readonly status: "exact"; readonly range: SourceTextRange }
  | { readonly status: "changed"; readonly range?: never };

export interface SourceDocument {
  readonly source: Reply<ResultOf<"obj.source">>;
  readonly content: Reply<ResultOf<"source.read">>;
  readonly location: SourceDocumentLocation;
}

export type SourceDocumentState =
  | {
      readonly status: "idle";
      readonly target: null;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "pending";
      readonly target: SourceDocumentTarget;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "success";
      readonly target: SourceDocumentTarget;
      readonly data: SourceDocument;
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly target: SourceDocumentTarget;
      readonly data?: never;
      readonly error: SourceDocumentFailure;
    };

export declare class SourceDocumentModel {
  /** Borrow one ready SDK; construction performs no queries or subscriptions. */
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: SourceDocumentState;
  readonly disposed: boolean;
  load(ref: ObjectRef | DefRef, kind: SourceKind): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
