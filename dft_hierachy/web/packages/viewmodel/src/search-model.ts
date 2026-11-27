import type { HierClient, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { readPageSize } from "./page-options.js";
import { PagedQueryModel } from "./paged-query-model.js";
import { registerQueryOwner } from "./query-coordination.js";
import { readSearchQuery } from "./search-input.js";
import { SearchError } from "./search-types.js";
import type {
  SearchErrorCode,
  SearchOptions,
  SearchPage,
  SearchQuery,
  SearchState,
} from "./search-types.js";

function sameQuery(left: SearchQuery, right: SearchQuery): boolean {
  // Inputs are owned and validated: undefined is never an own optional field.
  return (
    left.snapshotId === right.snapshotId &&
    left.text === right.text &&
    left.scope === right.scope &&
    (left.kinds === undefined
      ? right.kinds === undefined
      : right.kinds !== undefined &&
        left.kinds.length === right.kinds.length &&
        left.kinds.every((kind, index) => kind === right.kinds![index]))
  );
}

/** Explicit search pages in one borrowed SDK snapshot; no local search index. */
export class SearchModel {
  readonly #model: PagedQueryModel<
    SearchQuery,
    SearchPage,
    "search",
    SearchErrorCode
  >;
  constructor(client: HierClient, options?: SearchOptions) {
    const snapshotId = client.snapshot.snapshotId;
    const pageSize = readPageSize(options, SearchError, "Search");
    this.#model = new PagedQueryModel(
      client,
      {
        Error: SearchError,
        origin: "search",
        label: "Search",
        replyName: "search",
        invalidPageMessage: "Search page exceeds its limit or repeats a cursor",
        pageSize,
        sameQuery,
        request: (client, query, page, signal) =>
          client.search(
            {
              text: query.text,
              ...(query.kinds === undefined ? {} : { kinds: [...query.kinds] }),
              ...(query.scope === undefined ? {} : { scope: query.scope }),
            },
            page,
            signal,
          ),
      },
      snapshotId,
    );
    registerQueryOwner(this, this.#model);
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): SearchState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  load(query: SearchQuery): Promise<void> {
    return this.#model.load(() =>
      readSearchQuery(query, () => this.disposed, this.snapshotId),
    );
  }
  loadMore(): Promise<void> {
    return this.#model.loadMore();
  }
  reload(): Promise<void> {
    return this.#model.reload();
  }
  cancel(): Promise<void> {
    return this.#model.cancel();
  }
  clear(): Promise<void> {
    return this.#model.clear();
  }
  subscribe(listener: () => void): Unsubscribe {
    return this.#model.subscribe(listener);
  }
  dispose(): void {
    this.#model.dispose();
  }
}
