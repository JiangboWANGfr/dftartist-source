import type { HierClient, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { PagedQueryModel } from "./paged-query-model.js";
import { registerQueryOwner } from "./query-coordination.js";
import {
  readSourceCandidatesOptions,
  readSourceCandidatesQuery,
} from "./source-candidates-input.js";
import { SourceCandidatesError } from "./source-candidates-types.js";
import type {
  SourceCandidatesErrorCode,
  SourceCandidatesOptions,
  SourceCandidatesPage,
  SourceCandidatesQuery,
  SourceCandidatesState,
} from "./source-candidates-types.js";

// Internal provenance only: no duplicate query, page or task state.
const pageChains = new WeakMap<SourceCandidatesModel, object>();
/** Not a package export. Tokens change only when a new first request starts. */
export function getSourceCandidatePageChain(
  model: SourceCandidatesModel,
): object {
  return pageChains.get(model)!;
}
function sameQuery(
  left: SourceCandidatesQuery,
  right: SourceCandidatesQuery,
): boolean {
  // Only owned, validated inputs reach this comparison. Undefined cannot be owned col.
  return (
    left.snapshotId === right.snapshotId &&
    left.file === right.file &&
    left.line === right.line &&
    left.col === right.col
  );
}

/** Paged raw candidates at one explicit position in a borrowed SDK snapshot. */
export class SourceCandidatesModel {
  readonly #model: PagedQueryModel<
    SourceCandidatesQuery,
    SourceCandidatesPage,
    "source_candidates",
    SourceCandidatesErrorCode
  >;

  constructor(client: HierClient, options?: SourceCandidatesOptions) {
    // Ready errors take precedence over any caller option getter.
    const snapshotId = client.snapshot.snapshotId;
    const pageSize = readSourceCandidatesOptions(options);
    pageChains.set(this, {});
    this.#model = new PagedQueryModel(
      client,
      {
        Error: SourceCandidatesError,
        origin: "source_candidates",
        label: "Source candidates",
        replyName: "source candidates",
        invalidPageMessage:
          "Source candidate page exceeds its limit or repeats a cursor",
        pageSize,
        sameQuery,
        firstRequest: () => {
          pageChains.set(this, {});
        },
        request: (client, query, page, signal) =>
          client.resolveSource(
            {
              file: query.file,
              line: query.line,
              ...(query.col === undefined ? {} : { col: query.col }),
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
  get state(): SourceCandidatesState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }

  load(query: SourceCandidatesQuery): Promise<void> {
    return this.#model.load(() =>
      readSourceCandidatesQuery(query, () => this.disposed, this.snapshotId),
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
