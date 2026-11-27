// Independent strict consumer: DESIGN 6.22 and its inherited 6.11 public types.
import { SearchModel, SearchError } from "@B/search";
import type {
  SearchQuery,
  SearchOptions,
  SearchPage,
  SearchErrorCode,
  SearchFailure,
  SearchState,
} from "@B/search";
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  HitKind,
  ObjectRef,
  ResultOf,
  SnapshotId,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

declare const client: HierClient;
declare const sdkError: HierError;
declare const snapshotId: SnapshotId;
const kinds = ["port", "signal", "port"] as const;
const query: SearchQuery = {
  snapshotId,
  text: " *?<B搜索> ",
  kinds,
  scope: "B:opaque-scope",
};
const omitted: SearchQuery = { snapshotId, text: "" };
const emptyKinds: SearchQuery = { snapshotId, text: " ", kinds: [] };
const options: SearchOptions = { pageSize: 1 };
const model = new SearchModel(client, options);
const defaultModel = new SearchModel(client);
const undefinedOptions = new SearchModel(client, undefined);
const promises: readonly Promise<void>[] = [
  model.load(query),
  model.load(omitted),
  model.load(emptyKinds),
  model.loadMore(),
  model.reload(),
  model.cancel(),
  model.clear(),
];
const off: Unsubscribe = model.subscribe(() => {});
off();
const disposed: boolean = model.disposed;
const bound: SnapshotId = model.snapshotId;
const allLocalCodes: readonly SearchErrorCode[] = [
  "invalid_options",
  "invalid_argument",
  "snapshot_mismatch",
  "disposed",
  "cancelled",
  "inconsistent_reply",
  "reentrant_change",
];
const localError = new SearchError("invalid_argument", "B local error");
const baseError: Error = localError;
const localCode: SearchErrorCode = localError.code;
const issue: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "read",
  path: ["B", "data"],
};
const localFailure: SearchFailure = {
  code: "inconsistent_reply",
  origin: "search",
  message: "B local diagnostic",
  data: {},
  dataIssue: issue,
};
const sdkFailure: SearchFailure = {
  code: sdkError.code,
  origin: sdkError.origin,
  message: sdkError.message,
  data: sdkError.data,
};
declare const page: SearchPage;
declare const original: Reply<ResultOf<"search">>;
const fromOriginal: SearchPage = original;
const toOriginal: Reply<ResultOf<"search">> = page;
const hitRef: ObjectRef | undefined = page.result.items[0]?.ref;
const hitKind: HitKind | undefined = page.result.items[0]?.kind;
const hitPath: readonly string[] | undefined = page.result.items[0]?.path;
const extension: unknown = page.result.items[0]?.B_extension;
const completeness: "complete" | "partial" = page.completeness.status;
const states: readonly SearchState[] = [
  { status: "idle", query: null, pages: [] },
  { status: "pending", query, pages: [] },
  { status: "success", query, pages: [page] },
  { status: "failed", query, pages: [page], error: localFailure },
  { status: "cancelled", query, pages: [], error: sdkFailure },
];
declare const state: SearchState;
const pendingWithError = {
  status: "pending" as const,
  query,
  pages: [],
  error: localFailure,
};
function unreachable(value: never): never {
  throw value;
}
switch (state.status) {
  case "idle": {
    const idleQuery: null = state.query;
    void idleQuery;
    break;
  }
  case "pending":
  case "success": {
    const activeQuery: SearchQuery = state.query;
    const absentError: undefined = state.error;
    void [activeQuery, absentError];
    break;
  }
  case "failed":
  case "cancelled": {
    const failure: SearchFailure = state.error;
    const failedQuery: SearchQuery = state.query;
    void [failure, failedQuery];
    break;
  }
  default:
    unreachable(state);
}

// @ts-expect-error SEARCH-T01: explicit snapshot binding is mandatory
model.load({ text: "B" });
// @ts-expect-error SEARCH-T02: text is mandatory even though empty text is legal
model.load({ snapshotId });
// @ts-expect-error SEARCH-T03: text must be a primitive string
model.load({ snapshotId, text: 1 });
// @ts-expect-error SEARCH-T04: kinds reuse the closed generated HitKind union
model.load({ snapshotId, text: "B", kinds: ["scope"] });
// @ts-expect-error SEARCH-T05: exact optional kinds cannot be explicitly undefined
model.load({ snapshotId, text: "B", kinds: undefined });
// @ts-expect-error SEARCH-T06: exact optional scope cannot be explicitly undefined
model.load({ snapshotId, text: "B", scope: undefined });
// @ts-expect-error SEARCH-T07: scope is an opaque string, not a numeric address
model.load({ snapshotId, text: "B", scope: 2 });
// @ts-expect-error SEARCH-T08: exact optional pageSize cannot be explicitly undefined
new SearchModel(client, { pageSize: undefined });
// @ts-expect-error SEARCH-T09: pageSize is numeric, without string coercion
new SearchModel(client, { pageSize: "1" });
// @ts-expect-error SEARCH-T10: captured query fields are readonly
query.text = "changed";
// @ts-expect-error SEARCH-T11: captured kinds are a readonly array
query.kinds!.push("instance");
// @ts-expect-error SEARCH-T12: a model cannot be rebound to a snapshot
model.snapshotId = "B-other";
// @ts-expect-error SEARCH-T13: published state is readonly
model.state = { status: "idle", query: null, pages: [] };
// @ts-expect-error SEARCH-T14: disposal state is readonly
model.disposed = false;
// @ts-expect-error SEARCH-T15: committed page prefixes are readonly arrays
state.pages.push(page);
// @ts-expect-error SEARCH-T16: original SearchPage items remain deeply readonly
page.result.items.push(page.result.items[0]!);
// @ts-expect-error SEARCH-T17: original hit fields remain readonly
page.result.items[0]!.kind = "signal";
// @ts-expect-error SEARCH-T18: original hit paths remain readonly arrays
page.result.items[0]!.path.push("B");
// @ts-expect-error SEARCH-T19: the original next cursor is readonly
page.result.next = "B-next";
// @ts-expect-error SEARCH-T20: idle has no query
const badIdle: SearchState = { status: "idle", query, pages: [] };
// @ts-expect-error SEARCH-T21: failed state requires its diagnostic
const badFailure: SearchState = { status: "failed", query, pages: [] };
// @ts-expect-error SEARCH-T22: pending state cannot carry a terminal error
const badPending: SearchState = pendingWithError;
// @ts-expect-error SEARCH-T23: local error codes are closed and distinct from SDK codes
new SearchError("stale_cursor", "B");
// @ts-expect-error SEARCH-T24: failure origin is the declared local or SDK union
const badOrigin: SearchFailure["origin"] = "not-an-origin";
// @ts-expect-error SEARCH-T25: commands return Promise<void>, never synchronous void
const wrongVoid: void = model.loadMore();
// @ts-expect-error SEARCH-T26: diagnostic data is an owned readonly projection
localFailure.data.B = 1;

model.dispose();
void [
  defaultModel,
  undefinedOptions,
  promises,
  disposed,
  bound,
  allLocalCodes,
  baseError,
  localCode,
  fromOriginal,
  toOriginal,
  hitRef,
  hitKind,
  hitPath,
  extension,
  completeness,
  states,
];
