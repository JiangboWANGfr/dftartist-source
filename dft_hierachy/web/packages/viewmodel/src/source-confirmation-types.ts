import type { SourceCandidatesPage } from "./source-candidates-types.js";
import { registerModelError } from "./model-error-brand.js";

declare const sourceCandidateActionBrand: unique symbol;

/** An issued row action; only its owning navigation model may confirm it. */
export interface SourceCandidateAction {
  readonly page: SourceCandidatesPage;
  readonly itemIndex: number;
  readonly [sourceCandidateActionBrand]: true;
}

export type SourceConfirmationErrorCode =
  | "disposed"
  | "reentrant_change"
  | "not_ready"
  | "invalid_page"
  | "invalid_index"
  | "invalid_action"
  | "stale_action"
  | "address_unavailable"
  | "invalid_selection_model";

export class SourceConfirmationError extends Error {
  constructor(
    readonly code: SourceConfirmationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceConfirmationError";
    registerModelError(this, SourceConfirmationError);
  }
}

// Keep the brand private in the emitted ambient declaration, too.
export {};
