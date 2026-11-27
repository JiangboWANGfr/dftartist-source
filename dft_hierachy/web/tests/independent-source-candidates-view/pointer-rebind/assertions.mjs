import { check, equal } from "../pagination/public-model.mjs";
export function confirmation(records, n, s, original, stale, count = 1) {
  const calls = records.filter((r) => r.name === "confirmCandidate");
  equal(calls.length, count, "exact expected public confirmation count");
  if (count === 0) return;
  const r = calls[0];
  equal(r.receiver, n, "original confirmation receiver");
  equal(r.args.length, 2, "exact confirmation arity");
  equal(r.args[0], original, "captured original action, never latest/clone");
  equal(r.args[1], s, "original Selection");
  equal(r.status, stale ? "thrown" : "returned", "original command outcome");
  if (stale) {
    check(
      r.error && r.error.code === "stale_action",
      "L6 stale_action, not UI suppression or success",
    );
    check(
      typeof r.error.message === "string" && r.error.message.length > 0,
      "diagnostic",
    );
  }
  return r.error;
}
export function feedback(failures, original, error, stale) {
  equal(
    failures.length,
    stale ? 1 : 0,
    "at most one valid failure, none on success",
  );
  if (!stale) return;
  const f = failures[0];
  check(Object.isFrozen(f), "failure is shallow frozen");
  equal(f.command, "confirm", "original command");
  equal(f.action, original, "failure original action");
  equal(f.error, error, "original thrown value, no clone or conversion");
}
export function rebound(records, n, pages, old, mode) {
  const out = mode === "append" ? [...old] : [],
    seen = new Set(),
    calls = records.filter((r) => r.name === "createCandidateAction");
  for (const r of calls) {
    equal(r.receiver, n, "original issue receiver");
    equal(r.status, "returned", "issued successfully");
    equal(r.args.length, 2, "issue arity");
    const page = pages.indexOf(r.args[0]);
    check(page >= 0, "current original page");
    check(r.args[1] === 0 || r.args[1] === 1, "original page-local index");
    const row = page * 2 + r.args[1];
    check(
      !seen.has(row),
      "each tuple at most once in current successful batch",
    );
    seen.add(row);
    out[row] = r.value;
  }
  for (let row = 0; row < pages.length * 2; row++) {
    check(
      out[row] && typeof out[row] === "object",
      "every current row has an original binding",
    );
    if (mode !== "append" || row >= 2)
      check(seen.has(row), "new-generation/new-tail row must be issued");
    if (mode !== "append")
      check(
        out[row] !== old[row],
        "stale old action cannot be new-generation action",
      );
  }
  equal(
    new Set(out).size,
    pages.length * 2,
    "different occurrences have different original actions",
  );
  return out;
}
