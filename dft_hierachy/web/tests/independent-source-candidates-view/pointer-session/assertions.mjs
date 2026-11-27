import { equal } from "../pagination/public-model.mjs";
export function noConfirm(records) {
  equal(
    records.filter((r) => r.name === "confirmCandidate").length,
    0,
    "no public confirmation, including no-op/throw",
  );
}
export function currentConfirm(records, n, s, action) {
  const calls = records.filter((r) => r.name === "confirmCandidate");
  equal(calls.length, 1, "independent AT exactly one confirmation");
  const r = calls[0];
  equal(r.receiver, n, "current navigation receiver");
  equal(r.args.length, 2, "public arity");
  equal(r.args[0], action, "current committed original action");
  equal(r.args[1], s, "new Selection identity");
  equal(r.status, "returned", "successful original confirmation");
}
export function selectionSnapshot(s) {
  return {
    current: s.current,
    back: s.canGoBack,
    forward: s.canGoForward,
    disposed: s.disposed,
  };
}
export function unchanged(s, before) {
  equal(s.current, before.current, "original selection identity");
  equal(s.canGoBack, before.back, "history back unchanged");
  equal(s.canGoForward, before.forward, "history forward unchanged");
  equal(s.disposed, before.disposed, "borrowed Selection not disposed");
}
