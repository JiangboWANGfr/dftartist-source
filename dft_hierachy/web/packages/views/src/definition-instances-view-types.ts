import type {
  DefinitionInstancesModel,
  DefinitionInstancesPage,
  DefinitionInstancesQuery,
  SelectionModel,
} from "@hier/viewmodel";

export type DefinitionInstancesViewCommand =
  "loadMore" | "reload" | "cancel" | "select";

export type DefinitionInstancesViewFailure =
  | {
      readonly command: "loadMore" | "reload" | "cancel";
      readonly query: DefinitionInstancesQuery;
      readonly page?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: DefinitionInstancesQuery;
      readonly page: DefinitionInstancesPage;
      readonly itemIndex: number;
      readonly error: unknown;
    };

export interface DefinitionInstancesViewProps {
  readonly instances: DefinitionInstancesModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: DefinitionInstancesViewFailure) => void;
}
