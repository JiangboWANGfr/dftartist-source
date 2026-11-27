// Closed finite set from C82-accepted DESIGN 6.29. No implementation-derived oracle.
export const cases = [
  [
    "L01",
    "empty construction/invalid options/borrowed graph",
    "idle, no factory/query, stable identity, synchronous validation",
    "6.29.1",
  ],
  ["L02", "empty projection", "pending then success, zero root geometry, no Worker", "6.29.2/.3"],
  [
    "L03",
    "bad fields/sizes/member sets/ports/identity",
    "atomic invalid_argument or stale_graph; old task remains",
    "6.29.2",
  ],
  [
    "L04",
    "single-read mutable/null-prototype input",
    "owned input, each getter once, original graph unchanged",
    "6.29.2",
  ],
  [
    "L05",
    "getter throws/reenters/changes graph/disposes",
    "cause retained; disposed then stale priority; no partial acceptance",
    "6.29.2/.4",
  ],
  [
    "L06",
    "four directions, local ports, parallel edges and self-loop",
    "independent IDs and canonical reverse mapping; geometry-only output",
    "6.29.2/.4",
  ],
  [
    "L07",
    "bad Worker geometry/sets/endpoints/sections",
    "invalid_result, no partial result, old result retained",
    "6.29.4",
  ],
  [
    "L08",
    "L2 supersedes L1 then L1 succeeds late",
    "L1 waiter superseded promptly; only L2 publishes",
    "6.29.3",
  ],
  [
    "L09",
    "L2 supersedes L1 then L1 rejects late",
    "late failure consumed, L2 unaffected",
    "6.29.3",
  ],
  [
    "L10",
    "cancel pending, repeated cancel, retry",
    "old waiter cancelled without provider; new Worker; old result retained",
    "6.29.3",
  ],
  [
    "L11",
    "factory/postMessage/error/messageerror",
    "worker_failure and fresh retry; no graph/selection changes",
    "6.29.3/.4",
  ],
  [
    "L12",
    "ELK RPC rejects",
    "layout_failure with original cause, stable diagnostic, retry",
    "6.29.3/.4",
  ],
  [
    "L13",
    "controlled deadline wins, then late success",
    "timeout waiter settles, Worker reclaimed, fresh retry",
    "6.29.3",
  ],
  [
    "L14",
    "source pending/failed/success/clear revisions",
    "idle/stale on every revision; old retry stale; new layout recovers",
    "6.29.3",
  ],
  [
    "L15",
    "two services, first cleanup/listener inspects peer",
    "both stale before any cleanup/notification; graph subscriber can layout",
    "6.29.3/.4",
  ],
  [
    "L16",
    "service dispose vs graph dispose, repeated release",
    "all waiters disposed, no release notification, borrowed owners survive",
    "6.29.1/.3",
  ],
  [
    "L17",
    "duplicate/add/remove/throwing subscriptions",
    "notification snapshot and AggregateError, committed result retained",
    "6.29.4",
  ],
  [
    "L18",
    "pending/cancel/stale listener errors and disposal",
    "correct command causes; stale waiter distinct from graph command",
    "6.29.4",
  ],
  [
    "L19",
    "mutable result/getter changes graph during capture",
    "deep ownership/frozen history; no stale success",
    "6.29.2/.4",
  ],
  [
    "L20",
    "non-native cleanup throws on success/failure/dispose",
    "all resources attempted; worker_failure or original code/cause retained",
    "6.29.4",
  ],
  [
    "L21",
    "factory/result callback reentry and dispose takeover",
    "reentrant_change for mutation; disposal wins; no new Worker afterward",
    "6.29.4",
  ],
  [
    "L22",
    "original B RTL/real SDK/Core trace into actual GraphSession",
    "controlled geometry retains actual fact/side/bits/partial identity",
    "6.29.2/.5",
  ],
].map(([id, input, expected, basis]) => ({ id, input, expected, basis }));
export const packageCase = {
  id: "P01",
  input:
    "outside tarballs; native classic Worker under same-origin CSP; real/missing/crash/stall URLs",
  expected:
    "real ELK geometry/reverse mapping; loading/error/timeout/cancel/retry/dispose settle; owned resources close",
  basis: "6.29.5; not a canvas/Electron/heap/performance acceptance",
};
