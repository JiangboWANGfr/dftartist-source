/** Isolated proposal only. Normative behavior: DESIGN section 6.12. */
import { SourceDocumentModel as ProductionSourceDocumentModel } from "@hier/viewmodel";
import type { SourceCandidatesQuery, SourceDocument } from "@hier/viewmodel";

export type SourcePositionErrorCode =
  | "disposed"
  | "stale_document"
  | "changed_document"
  | "invalid_argument";

export declare class SourcePositionError extends Error {
  readonly code: SourcePositionErrorCode;
  constructor(code: SourcePositionErrorCode, message: string);
}

/** Preserves the production constructor and all existing members. */
export declare class SourceDocumentModel extends ProductionSourceDocumentModel {
  /**
   * Synchronously maps an original-text UTF-16 offset in this model's current
   * exact document to a frozen snapshot query with a UTF-8 byte column.
   * Performs no query, notification, selection change or subscription.
   */
  queryAt(
    document: SourceDocument,
    utf16Offset: number,
  ): SourceCandidatesQuery & { readonly col: number };
}
