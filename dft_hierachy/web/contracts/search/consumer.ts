/** Compile-only host. There is no executable SearchModel behind this proposal. */
import type { HierClient, Reply } from "@hier/client";
import type { ResultOf } from "@hier/protocol-types";
import type { SelectionModel } from "@hier/viewmodel";
import {
  SearchError,
  SearchModel,
  type SearchQuery,
  type SearchState,
  type SearchPage,
} from "./search.js";

export async function host(
  client: HierClient,
  query: SearchQuery,
  publish: (state: SearchState) => void,
): Promise<void> {
  await client.ready;
  const model = new SearchModel(client, { pageSize: 50 });
  const unsubscribe = model.subscribe(() => publish(model.state));
  try {
    await model.load(query);
    // One explicit request at a time. Each original page keeps its completeness.
    const page: Reply<ResultOf<"search">> | undefined =
      model.state.pages.at(-1);
    if (
      page?.completeness.status === "complete" &&
      page.result.next !== undefined
    )
      await model.loadMore();
    await model.reload();
    await model.cancel();
    await model.clear();
  } finally {
    unsubscribe();
    model.dispose();
    // client is borrowed and remains owned by the caller.
  }
}

/** Explicit host intent only. This is not a production selection coordinator. */
export function selectKnownHit(
  model: SearchModel,
  selection: SelectionModel,
  hit: SearchPage["result"]["items"][number],
): void {
  selection.select({
    snapshotId: model.snapshotId,
    origin: "external",
    items: [hit.kind === "definition" ? { def: hit.ref } : { ref: hit.ref }],
  });
}

export function typeBoundaries(
  client: HierClient,
  model: SearchModel,
  query: SearchQuery,
  state: SearchState,
): void {
  void model.load({ snapshotId: model.snapshotId, text: "" });
  void model.load({ snapshotId: model.snapshotId, text: "A*", kinds: [] });
  void model.load({ ...query, kinds: ["signal", "port", "signal"] as const });
  // @ts-expect-error S01 explicit snapshot is required
  void model.load({ text: "a" });
  // @ts-expect-error S02 text is required
  void model.load({ snapshotId: model.snapshotId });
  // @ts-expect-error S03 snapshot is a string
  void model.load({ snapshotId: 3, text: "a" });
  // @ts-expect-error S04 text is literal input, not a RegExp
  void model.load({ snapshotId: model.snapshotId, text: /a/ });
  // @ts-expect-error S05 authoritative generated kind union
  void model.load({ ...query, kinds: ["module"] });
  // @ts-expect-error S06 own undefined kinds is not omission
  void model.load({ ...query, kinds: undefined });
  // @ts-expect-error S07 scope is an opaque string
  void model.load({ ...query, scope: 0 });
  // @ts-expect-error S08 own undefined scope is not omission
  void model.load({ ...query, scope: undefined });
  // @ts-expect-error S09 page size is a number
  new SearchModel(client, { pageSize: "5" });
  // @ts-expect-error S10 own undefined pageSize is not omission
  new SearchModel(client, { pageSize: undefined });
  // @ts-expect-error S11 captured text is readonly
  query.text = "other";
  if (query.kinds) {
    // @ts-expect-error S12 captured kinds array is readonly
    query.kinds.push("port");
  }
  // @ts-expect-error S13 snapshot binding is readonly
  model.snapshotId = "other";
  // @ts-expect-error S14 model error code is a closed union
  new SearchError("timeout", "unsupported local code");
  // @ts-expect-error S15 page sequence is readonly
  state.pages.push({});
  const page = state.pages[0];
  if (page) {
    // @ts-expect-error S16 original SDK page items are deeply readonly
    page.result.items.push({});
    const hit = page.result.items[0];
    if (hit) {
      // @ts-expect-error S17 path segments are deeply readonly
      hit.path.push("invented");
    }
    // @ts-expect-error S18 task success does not imply complete results
    const complete: "complete" = page.completeness.status;
    void complete;
  }
  if (state.status === "idle") {
    // @ts-expect-error S19 idle has no query
    void state.query.text;
  }
  if (state.status === "success") {
    // @ts-expect-error S20 success has no failure
    void state.error.code;
  }
}
