/** Synchronous document-to-query errors; separate from document task failures. */
export type SourcePositionErrorCode =
  | "disposed"
  | "stale_document"
  | "changed_document"
  | "invalid_argument";

export class SourcePositionError extends Error {
  constructor(
    readonly code: SourcePositionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourcePositionError";
  }
}
