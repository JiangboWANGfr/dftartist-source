import type {
  SelectionModel,
  SourceCandidateAction,
  SourceNavigationModel,
} from "@hier/viewmodel";

export type SourceCandidatesViewCommand =
  | "bindActions"
  | "confirm"
  | "loadMore"
  | "reloadCandidates"
  | "cancelCandidates";

export interface SourceCandidatesViewFailure {
  readonly command: SourceCandidatesViewCommand;
  readonly action: SourceCandidateAction | null;
  readonly error: unknown;
}

/** The host owns both models and consumes automatic navigation refreshes. */
export interface SourceCandidatesViewProps {
  readonly navigation: SourceNavigationModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  /** Finite, positive height of the entire region in CSS pixels. */
  readonly height: number;
  readonly className?: string;
  readonly onCommandError: (failure: SourceCandidatesViewFailure) => void;
}
