// Finite new boundary only; preserve all original B oracle files.
export const layoutCases = [
  [
    "FL01",
    "default/folded constructor and invalid third arguments/options",
    "fixed mode, no Worker or graph/selection mutation",
    "6.33.1",
  ],
  [
    "FL02",
    "empty genuine projection",
    "pending→success, zero dimensions, captured identity, no Worker",
    "6.33.2",
  ],
  [
    "FL03",
    "visible collapsed members, self loops and four directions",
    "exact display IDs/order/endpoints/edge-end anchors/sizes, no internal edges",
    "6.33.2",
  ],
  [
    "FL04",
    "pending valid task then fake/proxy/foreign/stale projection or invalid direction",
    "LayoutError classification/priority, no fake getter reads or cancellation",
    "6.33.1",
  ],
  [
    "FL05",
    "same-revision different and repeated projections",
    "superseded waiter, fresh task ID, late old output ignored",
    "6.33.1/.2",
  ],
  [
    "FL06",
    "cancel/retry with same projection and LEFT direction",
    "captured projection ID/direction, fresh task and Worker, retained one result",
    "6.33.2",
  ],
  [
    "FL07",
    "two services pending when source revision publishes",
    "both stale before notifications, old waiters settle stale_graph; retry rejects",
    "6.33.2/6.29",
  ],
  [
    "FL08",
    "deterministic timeout and Worker factory failure",
    "original layout errors/cause, cleanup once, retry captured input",
    "6.33.2/6.29",
  ],
  [
    "FL09",
    "missing/extra/duplicate/member IDs/endpoints/invalid geometry",
    "invalid_result, no partial publication, preserve previous success",
    "6.33.2",
  ],
  [
    "FL10",
    "disposed service and reentrant command during Worker creation",
    "disposed/reentrant priority, no fake reads, borrowed graph stays live",
    "6.33.1/.2",
  ],
  [
    "FL11",
    "collapsed layout then fully open projection on unchanged graph",
    "original members/connectivity/facts/owners and shared selection remain unchanged",
    "6.33.2/.4",
  ],
  [
    "FL12",
    "unchanged original graph-mode layout input",
    "old state/result shape and original Graph IDs still work",
    "6.33.5",
  ],
].map(([id, input, expected, basis]) => ({ id, input, expected, basis }));
export const uiCases = [
  [
    "FU01",
    "StrictMode mount, direction rerender, idle fold control",
    "no implicit layout, ordered accessible controls including nested groups; sync controlled intent only",
    "6.33.3",
  ],
  [
    "FU02",
    "fold/unfold while parent collapsed and host declines update",
    "append/remove one key, keep order/groups reference, frozen options; no optimistic state or source/selection mutation",
    "6.33.3",
  ],
  [
    "FU03",
    "hierarchy/bus hit after layout",
    "all original members/internal edges and raw fact/bit/side/map/owners remain readable; text-safe labels",
    "6.33.4",
  ],
  [
    "FU04",
    "display target selection and shared annotation change",
    "exact original item union/history/highlights and original-ref annotation; no internal endpoints added",
    "6.33.4/6.32/6.31",
  ],
  [
    "FU05",
    "same graph revision, fresh equivalent projection object",
    "hide old geometry/details, explicit changed-fold message, no auto cancel/layout",
    "6.33.4",
  ],
  [
    "FU06",
    "same-projection pending/cancelled/failed and retry",
    "retained geometry read-only, cancel/retry only matching projection; once raw feedback",
    "6.33.4",
  ],
  [
    "FU07",
    "different projection while old task pending",
    "old task not auto cancelled; explicit new layout supersedes; old feedback/DOM cannot revive",
    "6.33.4",
  ],
  [
    "FU08",
    "source publishes newer graph with old projection",
    "stale message, hidden geometry/details, disabled commands, current partial/error source visible",
    "6.33.3/.4",
  ],
  [
    "FU09",
    "sync fold throw / host publishes then throws / feedback throws",
    "microtask once raw error; replaced frame suppresses feedback; AggregateError preserves both raw values",
    "6.33.4",
  ],
  [
    "FU10",
    "remove focused old display DOM and replace models/unmount pending task",
    "only own focus fallback; stale detached hit ignored; borrowed models/task not disposed/cancelled",
    "6.33.4",
  ],
  [
    "FU11",
    "forged projection/default service/missing callback/snapshot mismatch",
    "TypeError before subscriptions, no Worker; accepted later disposal disabled",
    "6.33.3",
  ],
  [
    "FU12",
    "same projection new task; invalid old selection event; empty/no-object display",
    "full task fence, empty/no-object never fabricates selection; active native controls",
    "6.33.4",
  ],
].map(([id, input, expected, basis]) => ({ id, input, expected, basis }));
export const nativeCase = {
  id: "FN01",
  input: "collapsed hierarchy+bus then all groups expanded using actual shipped ELK Worker",
  expected:
    "display identity matches; every raw member and original endpoints/facts/owners recovered, finite geometry, no pixel assertion",
  basis: "6.33.2/.4",
};
