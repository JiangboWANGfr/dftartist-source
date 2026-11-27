import { check, equal } from "../pagination/public-model.mjs";
// This fixture has two pages / two indices. Display order is specified; issuance call order is not.
export function bindings(records, navigation, pages) {
  const calls = records.filter((r) => r.name === "createCandidateAction");
  equal(calls.length, 4, "exact four original row bindings");
  const found = [new Map(), new Map()];
  for (const r of calls) {
    equal(r.receiver, navigation, "original binding receiver");
    equal(r.args.length, 2, "binding exact arity");
    const p = pages.findIndex((page) => page === r.args[0]),
      i = r.args[1];
    check(p >= 0, "original page identity, not clone/ref/deep equality");
    check(
      i === 0 || i === 1,
      "original per-page item index, not flattened row index",
    );
    check(!found[p].has(i), "each page/index bound exactly once");
    equal(r.status, "returned", "binding returned");
    check(
      r.value !== null && typeof r.value === "object",
      "original returned action",
    );
    found[p].set(i, r.value);
  }
  const issued = found.flatMap((m) => [m.get(0), m.get(1)]);
  equal(
    new Set(issued).size,
    4,
    "four distinct original page/index actions despite equal hit values",
  );
  return issued;
}
export function activation(
  records,
  navigation,
  selection,
  pages,
  row,
  count,
  issued,
) {
  const now = bindings(records, navigation, pages);
  now.forEach((a, i) =>
    equal(
      a,
      issued[i],
      "bindings must not be replaced/reissued during activation",
    ),
  );
  const confirms = records.filter((r) => r.name === "confirmCandidate");
  equal(confirms.length, count, "exact public confirmation count");
  for (const r of confirms) {
    equal(r.receiver, navigation, "original confirmation receiver");
    equal(r.args.length, 2, "confirmation exact arity");
    equal(
      r.args[0],
      issued[row],
      "original displayed occurrence action, never ref/deep/flattened replacement",
    );
    equal(r.args[1], selection, "original Selection argument");
    equal(r.status, "returned", "confirmation returned");
  }
  equal(records.length, 4 + count, "no other observed operation");
}
export function keyboardBoundary(
  records,
  navigation,
  selection,
  pages,
  row,
  issued,
  event,
) {
  check(
    event && (event.key === "Enter" || event.key === " "),
    "supported original keydown event",
  );
  equal(event.defaultPrevented, true, "prevent native duplicate/Space scroll");
  activation(records, navigation, selection, pages, row, 1, issued);
}
