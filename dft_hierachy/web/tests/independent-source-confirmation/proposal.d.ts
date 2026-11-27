// B-only declaration derived from DESIGN §6.17, never a runtime substitute.
import { SourceNavigationModel as Prior } from "@hier/viewmodel";
import type { SelectionModel, SourceCandidatesPage } from "@hier/viewmodel";
declare const sourceCandidateActionBrand: unique symbol;
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
export declare class SourceConfirmationError extends Error {
  readonly code: SourceConfirmationErrorCode;
  constructor(code: SourceConfirmationErrorCode, message: string);
}
export declare class SourceNavigationModel extends Prior {
  createCandidateAction(
    page: SourceCandidatesPage,
    itemIndex: number,
  ): SourceCandidateAction;
  confirmCandidate(
    action: SourceCandidateAction,
    selection: SelectionModel,
  ): void;
}
// Explicit export boundary: ambient .d.ts defaults must not expose the brand.
export {};
