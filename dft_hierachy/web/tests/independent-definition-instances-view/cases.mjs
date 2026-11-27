// Finite independent B66 list; expected behavior comes from DESIGN, not implementation.
import { invalid as oldInvalid } from "../independent-properties-panel/cases.mjs";
export const invalid = [
  ...oldInvalid.map(([n, k, v]) => [
    n.replace("properties", "instances"),
    k === "properties" ? "instances" : k,
    v,
  ]),
  ["instances-proxy", "instances", "proxy"],
  ["selection-proxy", "selection", "proxy"],
];
const c = (id, input, expected, section) => ({
  id: "DIV-" + id,
  input,
  expected,
  basis: "DESIGN §6.25." + section + "; inherited §§6.23/6.19",
});
export const cases = [
  ...invalid.map(([n, k, v]) =>
    c(
      "INVALID-" + n,
      { key: k, valueKind: Number.isNaN(v) ? "NaN" : String(v) },
      "render TypeError before subscriptions or commands",
      1,
    ),
  ),
  c(
    "OPTIONAL-undefined",
    "className/onCommandError own undefined",
    "runtime omission accepted, exactOptional types separate",
    1,
  ),
  ...["idle", "pending", "success", "failed", "cancelled"].map((s) =>
    c(
      "STATE-" + s,
      s,
      "original five-state text/operations/prefix, pending busy and disabled rows",
      2,
    ),
  ),
  ...["opaque", "external", "single"].map((x) =>
    c(
      "QUERY-" + x,
      x,
      "original query.def source persists across external selection; even one occurrence needs explicit confirmation",
      2,
    ),
  ),
  ...["hits", "safe", "reasons"].map((x) =>
    c(
      "FIELD-" + x,
      x,
      "all five InstKind fields/path segments/booleans/order/duplicates; text only; original reason code/at/detail/repetitions",
      2,
    ),
  ),
  ...[
    "complete-empty",
    "empty-next",
    "partial-empty",
    "partial-next",
    "mixed-prefix",
  ].map((x) =>
    c(
      "COMPLETE-" + x,
      x,
      "distinguish no-instance, empty loaded page with next, partial and exhausted; explicit eligible actions only",
      2,
    ),
  ),
  ...["more", "reload", "retry", "cancel", "select", "partial-select"].map(
    (x) =>
      c(
        "ACTION-" + x,
        x,
        "one exact public command; every original InstInfo.ref selects whole object, including partial; no hidden queries",
        3,
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
    c(
      "NATIVE-" + x,
      x,
      "native primary/keyboard one selection, actual secondary zero call; no multi-edit",
      3,
    ),
  ),
  ...["namespace", "bits", "passive"].map((x) =>
    c(
      "SELECTION-" + x,
      x,
      "only matching ObjectSelection.ref marks rows; shared def does not; bits/side/multi/history and duplicate marks passive",
      3,
    ),
  ),
  ...[
    "mount",
    "strict",
    "shared",
    "unmount",
    "replace-instances",
    "replace-selection",
  ].map((x) =>
    c(
      "LIFE-" + x,
      x,
      "one subscription per mount/model, zero implicit commands and only own unsubscribe",
      1,
    ),
  ),
  ...[
    "published-state",
    "pointer-append",
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
      "state/page/index/query/session identity guards; stale action/feedback never revived or retargeted",
      3,
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
      "original raw failure/page/index/query and frozen wrapper; latest action/callback capture, late rejection consumed",
      4,
    ),
  ),
  ...["outside", "removed", "tab", "multiple", "scroll"].map((x) =>
    c(
      "AX-" + x,
      x,
      "named region/status, native tab/focus fallback, isolated IDs, whole-region size and local scroll",
      4,
    ),
  ),
  c(
    "FIELD-diagnostic",
    "SDK diagnostic data getter failure",
    "original origin/code/message and dataIssue visible, unknown data not read",
    2,
  ),
  c(
    "PAGE-identity",
    "same-value same-ref rows across original pages",
    "no dedup, select failure retains exact page and itemIndex, not flat position",
    3,
  ),
  c(
    "LIFE-disposed",
    "dispose borrowed instances after mount",
    "old actions no call; no view release of SDK or Selection",
    1,
  ),
  c(
    "CORE-instances-selection",
    "original B tree HDL, real DefinitionInstancesModel/UI/Selection/SDK/Core",
    "literal plain instance and independent children.def/ref; original definition remains until explicit instance-ref choice",
    3,
  ),
];
export const packageCases = ["root", "css", "peer"].map((x) =>
  c(
    "PACK-" + x,
    x,
    "actual outside installed package root/types/CSS seven entries/React peer; no workspace alias",
    5,
  ),
);
