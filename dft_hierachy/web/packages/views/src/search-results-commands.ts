import type { SearchPage, SearchQuery, SearchState } from "@hier/viewmodel";
import { useViewCommands } from "./view-commands.js";
import type {
  SearchResultsViewFailure,
  SearchResultsViewProps,
} from "./search-results-view-types.js";

import { permitsPageAction, type PageAction } from "./paged-result-actions.js";

export type SearchResultsAction = PageAction<SearchPage>;

function queryOf(state: SearchState): SearchQuery | null {
  return state.query;
}

export function useSearchResultsCommands(props: SearchResultsViewProps) {
  const { search, selection } = props;
  return useViewCommands<
    SearchQuery,
    SearchState,
    SearchResultsAction,
    SearchResultsViewFailure
  >(
    search,
    selection,
    props.onCommandError,
    queryOf,
    permitsPageAction<SearchPage>,
    (action) => {
      if (action.command !== "select") return search[action.command]();
      const hit = action.page.result.items[action.itemIndex]!;
      selection.select({
        snapshotId: search.snapshotId,
        origin: "external",
        items: [
          hit.kind === "definition" ? { def: hit.ref } : { ref: hit.ref },
        ],
      });
    },
    (action, query, error) =>
      Object.freeze(
        action.command === "select"
          ? {
              command: action.command,
              query,
              page: action.page,
              itemIndex: action.itemIndex,
              error,
            }
          : { command: action.command, query, error },
      ),
  );
}
