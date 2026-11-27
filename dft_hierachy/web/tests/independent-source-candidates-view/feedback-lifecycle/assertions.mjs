import { check, equal, failure } from "../sync-feedback/assertions.mjs";
import { bindings } from "../actions/assertions.mjs";
export { check, equal, failure };
export function confirmations(records, n, s, page, indices, issued) {
  const current = bindings(records, n, page);
  current.forEach((a, i) =>
    equal(a, issued[i], "original issued action retained"),
  );
  const calls = records.filter((r) => r.name === "confirmCandidate");
  equal(
    calls.length,
    indices.length,
    "one confirmation per explicit activation",
  );
  calls.forEach((r, i) => {
    equal(r.receiver, n, "original receiver");
    equal(r.args.length, 2, "exact arity");
    equal(r.args[0], issued[indices[i]], "original action");
    equal(r.args[1], s, "original Selection argument");
    equal(r.status, "thrown", "actual synchronous throw");
  });
  equal(
    records.length,
    2 + indices.length,
    "bindings and explicit confirmations only",
  );
  return calls.map((r) => r.error);
}
export function latestFeedback(calls, action, error) {
  equal(calls.length, 1, "only latest callback once");
  failure(calls[0], action, error);
}
export function noGlobal(events) {
  equal(events.errors.length, 0, "no native global error");
  equal(events.rejections.length, 0, "no unhandled rejection");
}
