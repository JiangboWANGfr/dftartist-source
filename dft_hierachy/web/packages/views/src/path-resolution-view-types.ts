import type {
  PathResolutionModel,
  PathResolutionQuery,
  PathResolutionReply,
  SelectionModel,
} from "@hier/viewmodel";

export type PathResolutionViewCommand = "reload" | "cancel" | "select";
export type PathResolutionViewFailure =
  | {
      readonly command: "reload" | "cancel";
      readonly query: PathResolutionQuery;
      readonly reply?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: PathResolutionQuery;
      readonly reply: PathResolutionReply;
      readonly itemIndex: number;
      readonly error: unknown;
    };
export interface PathResolutionViewProps {
  readonly resolution: PathResolutionModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: PathResolutionViewFailure) => void;
}
