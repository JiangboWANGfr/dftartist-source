import {
  createElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type { HierClient } from "@hier/client";
import type { HitKind, ObjectRef } from "@hier/protocol-types";
import {
  SearchModel,
  SelectionModel,
  type SearchPage,
  type SearchQuery,
} from "@hier/viewmodel";
import {
  SearchResultsView,
  type SearchResultsViewCommand,
  type SearchResultsViewFailure,
  type SearchResultsViewProps,
} from "./search-results-view.js";

// Compile-only composition. The proposed view has no executable module yet.
// The host owns the draft and submits the original literal text explicitly.
async function createSearchHost(client: HierClient) {
  const snapshot = await client.ready;
  const search = new SearchModel(client);
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });

  function SearchHost(filters: {
    readonly kinds?: readonly HitKind[];
    readonly scope?: ObjectRef;
  }): ReactElement {
    const inputId = useId();
    const submission = useRef(0);
    useEffect(
      () => () => {
        submission.current++;
      },
      [],
    );
    const [draft, setDraft] = useState("");
    const [failure, setFailure] = useState<{ readonly error: unknown } | null>(
      null,
    );
    function submit(event: FormEvent<HTMLFormElement>): void {
      event.preventDefault();
      const ticket = ++submission.current;
      setFailure(null);
      const failed = (error: unknown): void => {
        if (submission.current === ticket) setFailure({ error });
      };
      try {
        void search
          .load({
            snapshotId: snapshot.snapshotId,
            text: draft,
            ...(filters.kinds === undefined ? {} : { kinds: filters.kinds }),
            ...(filters.scope === undefined ? {} : { scope: filters.scope }),
          })
          .then(undefined, failed);
      } catch (error) {
        failed(error);
      }
    }
    return createElement(
      "section",
      null,
      createElement(
        "form",
        { onSubmit: submit },
        createElement("label", { htmlFor: inputId }, "搜索文本"),
        createElement("input", {
          id: inputId,
          value: draft,
          onChange: (event) => setDraft(event.currentTarget.value),
        }),
        createElement("button", { type: "submit" }, "搜索"),
        failure ? createElement("p", { role: "status" }, "提交失败") : null,
      ),
      createElement(SearchResultsView, {
        search,
        selection,
        ariaLabel: "全设计搜索结果",
        height: 400,
        className: "search-results",
      }),
    );
  }
  // The host unmounts before disposing borrowed models. The session owns client.
  return { SearchHost, search, selection };
}

function typeBoundary(
  client: HierClient,
  search: SearchModel,
  selection: SelectionModel,
  query: SearchQuery,
  page: SearchPage,
) {
  const props = {
    search,
    selection,
    ariaLabel: "Search results",
    height: 300,
    onCommandError(failure: SearchResultsViewFailure) {
      const command: SearchResultsViewCommand = failure.command;
      const originalQuery: SearchQuery = failure.query;
      const originalError: unknown = failure.error;
      if (failure.command === "select") {
        const originalPage: SearchPage = failure.page;
        const index: number = failure.itemIndex;
        void [originalPage, index];
      }
      void [command, originalQuery, originalError];
    },
  } satisfies SearchResultsViewProps;
  createElement(SearchResultsView, props);
  // @ts-expect-error SRV01: The view consumes its model, not a second SDK path.
  SearchResultsView({ ...props, search: client });
  // @ts-expect-error SRV02: A detached state is not the model.
  SearchResultsView({ ...props, search: search.state });
  // @ts-expect-error SRV03: Selection uses the shared model, not a copied value.
  SearchResultsView({ ...props, selection: selection.current });
  // @ts-expect-error SRV04: An accessible label is required.
  SearchResultsView({ search, selection, height: 300 });
  // @ts-expect-error SRV05: Height is numerical CSS pixels.
  SearchResultsView({ ...props, height: "100%" });
  // @ts-expect-error SRV06: Query input belongs to the model and host form.
  SearchResultsView({ ...props, query });
  // @ts-expect-error SRV07: There is one selection channel.
  SearchResultsView({ ...props, onSelect: () => {} });
  // @ts-expect-error SRV08: Exact optional callback must be omitted.
  SearchResultsView({ ...props, onCommandError: undefined });
  // @ts-expect-error SRV09: Exact optional className must be omitted.
  SearchResultsView({ ...props, className: undefined });
  // @ts-expect-error SRV10: A view does not receive a parallel page source.
  SearchResultsView({ ...props, pages: [page] });
  const selected: SearchResultsViewFailure = {
    command: "select",
    query,
    page,
    itemIndex: 0,
    error: undefined,
  };
  const loadFailure: SearchResultsViewFailure = {
    command: "loadMore",
    query,
    error: null,
  };
  // @ts-expect-error SRV11: A selection failure retains the original page.
  const missingPage: SearchResultsViewFailure = {
    command: "select",
    query,
    itemIndex: 0,
    error: null,
  };
  // @ts-expect-error SRV12: A selection failure retains its page-local index.
  const missingIndex: SearchResultsViewFailure = {
    command: "select",
    query,
    page,
    error: null,
  };
  // @ts-expect-error SRV13: Query actions do not invent a row coordinate.
  const extraPage: SearchResultsViewFailure = {
    command: "reload",
    query,
    page,
    itemIndex: 0,
    error: null,
  };
  // @ts-expect-error SRV14: Clear is an explicit host action, not a view command.
  const clear: SearchResultsViewCommand = "clear";
  // @ts-expect-error SRV15: The captured query is readonly.
  selected.query.text = "replacement";
  // @ts-expect-error SRV16: The raw captured page is readonly.
  selected.page.result.items.push(selected.page.result.items[0]!);
  // @ts-expect-error SRV17: The page-local coordinate is readonly.
  selected.itemIndex = 1;
  // @ts-expect-error SRV18: Unknown failures require host narrowing.
  loadFailure.error.code;
  void [missingPage, missingIndex, extraPage, clear];
}

void [createSearchHost, typeBoundary];
