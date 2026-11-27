// B independent consumer of DESIGN 6.23, not an A consumer or runtime fixture.
import type { ReactElement } from "react";
import { SearchResultsView } from "@hier/views";
import type {
  SearchResultsViewProps as Props,
  SearchResultsViewCommand as Command,
  SearchResultsViewFailure as Failure,
} from "@hier/views";
import type {
  SearchModel,
  SearchQuery,
  SearchPage,
  SelectionModel,
} from "@hier/viewmodel";

declare const search: SearchModel,
  selection: SelectionModel,
  page: SearchPage,
  base: Props,
  f: Failure,
  sf: Extract<Failure, { command: "select" }>;

const q: SearchQuery = {
  snapshotId: "B62:opaque-snapshot",
  text: " raw *? ",
  kinds: ["definition", "port", "definition"],
  scope: "B62:opaque-scope",
};
const good: Props = {
  search,
  selection,
  ariaLabel: "B search results",
  height: 180,
};
const goodWith: Props = {
  ...good,
  className: "",
  onCommandError(value) {
    const query: SearchQuery = value.query;
    const raw: unknown = value.error;
    if (value.command === "select") {
      const originalPage: SearchPage = value.page;
      const itemIndex: number = value.itemIndex;
      void [originalPage, itemIndex];
    } else {
      const absentPage: undefined = value.page;
      const absentIndex: undefined = value.itemIndex;
      void [absentPage, absentIndex];
    }
    void [query, raw];
  },
};
const callerOwnedPromise: Props = {
  ...good,
  onCommandError: () => Promise.resolve(),
};
const rendered: ReactElement = SearchResultsView(goodWith);
const commands: readonly Command[] = ["loadMore", "reload", "cancel", "select"];
const failures: readonly Failure[] = [
  { command: "loadMore", query: q, error: undefined },
  { command: "reload", query: q, error: 0 },
  { command: "cancel", query: q, error: null },
  { command: "select", query: q, page, itemIndex: 0, error: Symbol("raw") },
];
const modelPromises: readonly Promise<void>[] = [
  search.loadMore(),
  search.reload(),
  search.cancel(),
];
const missingPage = {
  command: "select" as const,
  query: q,
  itemIndex: 0,
  error: 0,
};
const missingIndex = { command: "select" as const, query: q, page, error: 0 };
const wrongQueryPage = {
  command: "loadMore" as const,
  query: q,
  page,
  error: 0,
};
const explicitQueryIndex = {
  command: "cancel" as const,
  query: q,
  itemIndex: undefined,
  error: 0,
};
const missingQuery = { command: "reload" as const, error: 0 };
const missingError = {
  command: "select" as const,
  query: q,
  page,
  itemIndex: 0,
};
const stringIndex = {
  command: "select" as const,
  query: q,
  page,
  itemIndex: "0",
  error: 0,
};

// @ts-expect-error V01: a fake structural object is not the real SearchModel
const v01: Props = { ...base, search: {} };
// @ts-expect-error V02: selection must be the real public SelectionModel
const v02: Props = { ...base, selection: {} };
// @ts-expect-error V03: the borrowed search model is mandatory
const v03: Props = { selection, ariaLabel: "B", height: 1 };
// @ts-expect-error V04: the shared selection model is mandatory
const v04: Props = { search, ariaLabel: "B", height: 1 };
// @ts-expect-error V05: a label is mandatory
const v05: Props = { search, selection, height: 1 };
// @ts-expect-error V06: the region height is mandatory
const v06: Props = { search, selection, ariaLabel: "B" };
// @ts-expect-error V07: height is numeric without string coercion
const v07: Props = { ...base, height: "180" };
// @ts-expect-error V08: optional className follows exactOptionalPropertyTypes
const v08: Props = { ...base, className: undefined };
// @ts-expect-error V09: optional callback follows exactOptionalPropertyTypes
const v09: Props = { ...base, onCommandError: undefined };
// @ts-expect-error V10: a supplied error callback must be callable
const v10: Props = { ...base, onCommandError: 1 };
// @ts-expect-error V11: the four command names are closed
const v11: Command = "load";
// @ts-expect-error V12: a select failure must preserve its original page
const v12: Failure = missingPage;
// @ts-expect-error V13: a select failure must preserve its page-local index
const v13: Failure = missingIndex;
// @ts-expect-error V14: loadMore failure cannot carry a selected page
const v14: Failure = wrongQueryPage;
// @ts-expect-error V15: nonselect itemIndex is forbidden, even as undefined
const v15: Failure = explicitQueryIndex;
// @ts-expect-error V16: every failure preserves the action-start query
const v16: Failure = missingQuery;
// @ts-expect-error V17: every failure carries unknown error, including undefined
const v17: Failure = missingError;
// @ts-expect-error V18: the page-local item index is numeric
const v18: Failure = stringIndex;
// @ts-expect-error V19: public props are readonly
base.height = 2;
// @ts-expect-error V20: failure query retains readonly declared fields
f.query.text = "changed";
// @ts-expect-error V21: failure query keeps its readonly kinds array
f.query.kinds!.push("instance");
// @ts-expect-error V22: original page items remain deeply readonly
sf.page.result.items.push(sf.page.result.items[0]!);
// @ts-expect-error V23: the captured item index is readonly
sf.itemIndex = 1;
// @ts-expect-error V24: raw unknown errors cannot be inspected without narrowing
f.error.message;
// @ts-expect-error V25: the component returns ReactElement, not a Promise
const v25: Promise<ReactElement> = SearchResultsView(good);
// @ts-expect-error V26: the view does not accept model options as root props
SearchResultsView({ ...good, pageSize: 2 });

void [rendered, commands, failures, modelPromises, callerOwnedPromise];
