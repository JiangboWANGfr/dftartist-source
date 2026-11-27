/** Public source document data. Normative behavior: DESIGN section 6.10. */
import type { HierError, Reply } from "@hier/client";
import type {
  DefRef,
  ObjectRef,
  ResultOf,
  SourceKind,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { registerModelError } from "./model-error-brand.js";

export type SourceDocumentErrorCode =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";

export class SourceDocumentError extends Error {
  constructor(
    readonly code: SourceDocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceDocumentError";
    registerModelError(this, SourceDocumentError);
  }
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
