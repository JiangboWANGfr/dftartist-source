import type { HierClient, PageReq, Reply, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { registerQueryOwner } from "./query-coordination.js";
import { QueryDataModel } from "./query-data-model.js";
import type { QueryDataPolicy, QueryFailure } from "./query-data-model.js";

type Page = Reply<{ items: readonly unknown[]; next?: string }>;
interface PageRequest<Query, Result> {
  readonly query: Query;
  readonly pages: readonly Result[];
}
type PagedState<Query, Result, Origin extends string, Code extends string> =
  | {
      readonly status: "idle";
      readonly query: null;
      readonly pages: readonly Result[];
      readonly error?: never;
    }
  | {
      readonly status: "pending" | "success";
      readonly query: Query;
      readonly pages: readonly Result[];
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly query: Query;
      readonly pages: readonly Result[];
      readonly error: QueryFailure<Origin, Code>;
    };
interface PagePolicy<
  Query,
  Result,
  Origin extends string,
  Code extends string,
> {
  readonly Error: QueryDataPolicy<
    unknown,
    unknown,
    Origin,
    unknown,
    Code
  >["Error"];
  readonly origin: Origin;
  readonly label: string;
  readonly replyName: string;
  readonly invalidPageMessage: string;
  readonly pageSize: number;
  sameQuery(left: Query, right: Query): boolean;
  request(
    client: HierClient,
    query: Query,
    page: PageReq,
    signal: AbortSignal,
  ): Promise<Result>;
  firstRequest?(): void;
}
const emptyPages: readonly never[] = Object.freeze([]);
const idle = Object.freeze({
  status: "idle",
  query: null,
  pages: emptyPages,
} as const);

/** Shared original-page policy; QueryDataModel remains the only task owner. */
export class PagedQueryModel<
  Query,
  Result extends Page,
  Origin extends string,
  Code extends string,
> {
  // Derived from this chain's committed pages only; never owns replies/items.
  // QueryDataModel alone decides which task can publish and when chains reset.
  readonly #cursors = new Set<string>();
  readonly #model: QueryDataModel<
    PageRequest<Query, Result>,
    readonly Result[],
    Origin,
    PagedState<Query, Result, Origin, Code>,
    Code
  >;

  constructor(
    client: HierClient,
    policy: PagePolicy<Query, Result, Origin, Code>,
    snapshotId: SnapshotId,
  ) {
    this.#model = new QueryDataModel<
      PageRequest<Query, Result>,
      readonly Result[],
      Origin,
      PagedState<Query, Result, Origin, Code>,
      Code
    >(
      client,
      {
        Error: policy.Error,
        origin: policy.origin,
        label: policy.label,
        replyName: policy.replyName,
        sameTarget: (left, right) => policy.sameQuery(left.query, right.query),
        begin: (task) => {
          const { query, pages } = task.target;
          const cursor = pages.at(-1)?.result.next;
          task.observe(
            (client, signal) =>
              policy.request(
                client,
                query,
                {
                  limit: policy.pageSize,
                  ...(cursor === undefined ? {} : { cursor }),
                },
                signal,
              ),
            (reply) => {
              // SDK validates and owns immutable replies. Only chain consistency
              // is checked here; an invalid page never enters the prefix.
              const next = reply.result.next;
              if (
                reply.result.items.length > policy.pageSize ||
                (next !== undefined &&
                  (next === cursor || this.#cursors.has(next)))
              )
                throw new policy.Error(
                  "inconsistent_reply",
                  policy.invalidPageMessage,
                );
              task.complete(Object.freeze([...pages, reply]));
            },
          );
        },
        retainFailure: (error) => error.code === "stale_cursor",
        states: {
          idle,
          status: (state) => state.status,
          target: (state) =>
            state.query === null
              ? null
              : { query: state.query, pages: emptyPages },
          pending: (target) => {
            // Runs only after accepting a new task, before publishing pending.
            // Joins and no-ops never change the source confirmation provenance.
            if (target.pages === emptyPages) {
              this.#cursors.clear();
              policy.firstRequest?.();
            }
            return Object.freeze({
              status: "pending",
              query: target.query,
              pages: target.pages,
            });
          },
          success: (target, pages) => {
            // Only accepted, validated pages enter the history. Record before
            // notification so listener errors do not roll back a committed page.
            const next = pages.at(-1)!.result.next;
            if (next !== undefined) this.#cursors.add(next);
            return Object.freeze({ status: "success", query: target.query, pages });
          },
          failure: (target, error, previous) =>
            Object.freeze({
              status: error.code === "cancelled" ? "cancelled" : "failed",
              query: target.query,
              pages: previous.pages,
              error,
            }),
        },
      },
      snapshotId,
    );
    registerQueryOwner(this, this.#model);
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): PagedState<Query, Result, Origin, Code> {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  load(readQuery: () => Query): Promise<void> {
    return this.#model.load(() => ({ query: readQuery(), pages: emptyPages }));
  }
  loadMore(): Promise<void> {
    return this.#model.continue((state, failure) => {
      if (state.query === null) return undefined;
      if (failure?.code === "stale_cursor") throw failure;
      const last = state.pages.at(-1);
      if (
        last &&
        (last.completeness.status === "partial" ||
          last.result.next === undefined)
      )
        return undefined;
      return { query: state.query, pages: state.pages };
    });
  }
  reload(): Promise<void> {
    return this.#model.reload();
  }
  cancel(): Promise<void> {
    return this.#model.cancel();
  }
  clear(): Promise<void> {
    const result = this.#model.clear();
    // Publication is synchronous; a rejected reentrant clear must keep the
    // current chain, while listener failure after accepted clear is still idle.
    if (this.#model.state.status === "idle") this.#cursors.clear();
    return result;
  }
  subscribe(listener: () => void): Unsubscribe {
    return this.#model.subscribe(listener);
  }
  dispose(): void {
    this.#model.dispose();
    this.#cursors.clear();
  }
}
