import { invalid as originalInvalid } from "../independent-definition-instances-view/cases.mjs";
export const invalid = originalInvalid.map(([n, k, v]) => [
  n.replace("instances", "resolution"),
  k === "instances" ? "resolution" : k,
  v,
]);
const c = (id, input, expected, section) => ({
  id: "PRV-" + id,
  input,
  expected,
  basis: "DESIGN §6.26." + section + "; inherited §6.25",
});
export const cases = [
  ...invalid.map(([n, k, v]) =>
    c(
      "INVALID-" + n,
      { key: k, valueKind: Number.isNaN(v) ? "NaN" : String(v) },
      "synchronous TypeError before commands/subscriptions",
      3,
    ),
  ),
  c(
    "OPTIONAL-undefined",
    "className/callback own undefined",
    "runtime omission accepted, exactOptional separate",
    3,
  ),
  ...["idle", "pending", "success", "failed", "cancelled"].map((x) =>
    c(
      "STATE-" + x,
      x,
      "five state text/actions, raw query, pending no old reply, independent polite status; no form",
      3,
    ),
  ),
  ...["opaque", "empty", "whitespace", "external", "single"].map((x) =>
    c(
      "QUERY-" + x,
      x,
      "raw query.text/empty/whitespace source; external selection doesn't query, even single result needs confirmation",
      3,
    ),
  ),
  ...["refs", "safe", "reasons"].map((x) =>
    c(
      "FIELD-" + x,
      x,
      "raw array order/duplicates/text safety; original reasons/order/duplicates, no metadata or extension enumeration",
      3,
    ),
  ),
  ...["complete-empty", "partial-empty", "partial-nonempty"].map((x) =>
    c(
      "COMPLETE-" + x,
      x,
      "returned count not total; partial never not-found, no fake pages/loadMore",
      3,
    ),
  ),
  ...["reload", "retry", "cancel", "select", "partial-select"].map((x) =>
    c(
      "ACTION-" + x,
      x,
      "one exact public call; original ref whole-object selection, no implicit queries",
      4,
    ),
  ),
  ...[
    "click",
    "Enter",
    "Space",
    "Control-primary",
    "Shift-primary",
    "right",
    "Control-right",
  ].map((x) =>
    c("NATIVE-" + x, x, "native input once/secondary zero, no multi-edit", 4),
  ),
  ...["namespace", "bits", "passive"].map((x) =>
    c(
      "SELECTION-" + x,
      x,
      "object ref only incl bits/side; definitions don't mark, duplicates passive and no history change",
      4,
    ),
  ),
  ...[
    "mount",
    "strict",
    "shared",
    "unmount",
    "replace-resolution",
    "replace-selection",
  ].map((x) =>
    c(
      "LIFE-" + x,
      x,
      "two subscriptions, zero auto commands, only own unsubscribe and borrowed live",
      3,
    ),
  ),
  ...[
    "published-state",
    "pointer-reply",
    "query-identity",
    "away-back",
    "callback-capture",
    "latest-action",
    "uncommitted",
    "pointer-query",
    "pointer-replace",
  ].map((x) =>
    c(
      "RACE-" + x,
      x,
      "original committed state/query/reply/index/session; no stale action or revived feedback",
      4,
    ),
  ),
  ...[
    "select-sync",
    "reload-async",
    "local",
    "callback",
    "callback-invalidates",
    "unmount",
    "replace",
    "undefined",
  ].map((x) =>
    c(
      "ERROR-" + x,
      x,
      "raw frozen failure/query/reply/index/error, original Promise consumption/latest action/callback",
      4,
    ),
  ),
  ...["outside", "removed", "tab", "multiple", "scroll"].map((x) =>
    c(
      "AX-" + x,
      x,
      "native Tab/focus local fallback, IDs/height/local scroll, no external theft",
      4,
    ),
  ),
  c(
    "FIELD-diagnostic",
    "SDK data getter throws",
    "original diagnostics visible, dataIssue hint, no UI unknown read",
    3,
  ),
  c(
    "REPLY-identity",
    "duplicate ref at array index3",
    "original reply and itemIndex3 in select failure, never deduplicate/replace by value",
    4,
  ),
  c(
    "LIFE-disposed",
    "dispose borrowed model after mount",
    "old DOM calls nothing, Selection/SDK still borrowed",
    3,
  ),
  c(
    "CORE-path-selection",
    "original B tree HDL plain literal/children metadata",
    "actual model/UI/SDK/Core result, definition stays until explicit ref selection with no hidden query",
    4,
  ),
];
export const packageCases = ["root", "css", "peer"].map((x) =>
  c(
    "PACK-" + x,
    x,
    "actual installed model and view roots/types/eight CSS and React peer/no extra runtime dependencies",
    5,
  ),
);
