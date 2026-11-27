/** Public search results view contract. DESIGN section 6.23. */
import type {
  SearchModel,
  SearchPage,
  SearchQuery,
  SelectionModel,
} from "@hier/viewmodel";

export type SearchResultsViewCommand =
  "loadMore" | "reload" | "cancel" | "select";

export type SearchResultsViewFailure =
  | {
      readonly command: "loadMore" | "reload" | "cancel";
      readonly query: SearchQuery;
      readonly page?: never;
      readonly itemIndex?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly query: SearchQuery;
      readonly page: SearchPage;
      readonly itemIndex: number;
      readonly error: unknown;
    };

export interface SearchResultsViewProps {
  readonly search: SearchModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: SearchResultsViewFailure) => void;
}
