/** Isolated API proposal only. Normative behavior: DESIGN 6.17. */
import type {
  SelectionModel,
  SourceCandidatesPage,
  SourceNavigationModel as ProductionNavigation,
} from "@hier/viewmodel";

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
// Inherits the existing constructor, state and commands without duplicating them.
// This declaration is not a runtime subclass or a new production export.
export declare class SourceNavigationModel extends ProductionNavigation {
  createCandidateAction(
    page: SourceCandidatesPage,
    itemIndex: number,
  ): SourceCandidateAction;
  confirmCandidate(
    action: SourceCandidateAction,
    selection: SelectionModel,
  ): void;
}

// Ambient declarations otherwise implicitly export the unexported brand.
export {};
