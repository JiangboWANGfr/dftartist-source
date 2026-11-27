// Pure B assertions, preserving opaque page/action identities rather than JSON/deep equality.
import { check, equal } from "../pagination/public-model.mjs";
export function bindings(records, navigation, page) {
  const a = records.filter((r) => r.name === "createCandidateAction");
  equal(a.length, 2, "exact two binding calls");
  const byIndex = new Map();
  for (const r of a) {
    equal(r.receiver, navigation, "original binding receiver");
    equal(r.args.length, 2, "exact binding arity");
    equal(r.args[0], page, "original page identity");
    check(r.args[1] === 0 || r.args[1] === 1, "original item index");
    check(!byIndex.has(r.args[1]), "each displayed item bound exactly once");
    byIndex.set(r.args[1], r.value);
    equal(r.status, "returned", "binding returned");
    check(
      r.value !== null && typeof r.value === "object",
      "original opaque action",
    );
  }
  check(a[0].value !== a[1].value, "distinct issued actions");
  return [byIndex.get(0), byIndex.get(1)];
}
export function activation(
  records,
  navigation,
  selection,
  page,
  index,
  count,
  issued,
) {
  const now = bindings(records, navigation, page);
  now.forEach((v, i) =>
    equal(v, issued[i], "no reissue or replacement of original action"),
  );
  const a = records.filter((r) => r.name === "confirmCandidate");
  equal(a.length, count, "exact public confirmation count");
  for (const r of a) {
    equal(r.receiver, navigation, "original confirmation receiver");
    equal(r.args.length, 2, "exact confirmation arity");
    equal(r.args[0], issued[index], "previously bound action identity");
    equal(r.args[1], selection, "original Selection receiver argument");
    equal(r.status, "returned", "confirmation returned");
  }
  equal(records.length, 2 + count, "no other observed public operation");
}
export function keyboardBoundary(
  records,
  navigation,
  selection,
  page,
  index,
  issued,
  event,
) {
  check(
    event && (event.key === "Enter" || event.key === " "),
    "actual supported keydown captured",
  );
  equal(
    event.defaultPrevented,
    true,
    "keydown prevents native extra activation/Space scrolling",
  );
  activation(records, navigation, selection, page, index, 1, issued);
}
