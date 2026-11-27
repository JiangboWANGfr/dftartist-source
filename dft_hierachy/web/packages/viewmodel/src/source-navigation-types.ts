/** Public document-bound source navigation. Normative behavior: DESIGN 6.13. */
import type {
  SourceDocument,
  SourceDocumentState,
} from "./source-document-types.js";
import type { SourceCandidatesState } from "./source-candidates-types.js";
import { registerModelError } from "./model-error-brand.js";

export interface SourceNavigationCandidates {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly state: Exclude<SourceCandidatesState, { readonly status: "idle" }>;
}
export interface SourceNavigationRefresh {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly completion: Promise<void>;
}
export interface SourceNavigationState {
  readonly document: SourceDocumentState;
  readonly candidates: SourceNavigationCandidates | null;
  readonly refresh: SourceNavigationRefresh | null;
}
export type SourceNavigationErrorCode = "disposed" | "reentrant_change";
export class SourceNavigationError extends Error {
  constructor(
    readonly code: SourceNavigationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceNavigationError";
    registerModelError(this, SourceNavigationError);
  }
}
