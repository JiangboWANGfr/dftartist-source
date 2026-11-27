/** Compile-only proposal. DESIGN 6.18 is normative; not a production export. */
import type { ReactElement } from "react";
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
export interface SourceCandidatesViewProps {
  readonly navigation: SourceNavigationModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError: (failure: SourceCandidatesViewFailure) => void;
}
export declare function SourceCandidatesView(
  props: SourceCandidatesViewProps,
): ReactElement;
