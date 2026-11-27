// Finite B inputs, normative DESIGN 6.19; no implementation-derived expected values.
const c = (id, input, expected, section) => ({
  id,
  input,
  expected,
  basis: "DESIGN §6.19." + section,
});
export const invalid = [
  ["height-zero", "height", 0],
  ["height-negative", "height", -1],
  ["height-nan", "height", NaN],
  ["height-infinity", "height", Infinity],
  ["height-string", "height", "20"],
  ["height-null", "height", null],
  ["aria-empty", "ariaLabel", ""],
  ["aria-blank", "ariaLabel", " \t"],
  ["aria-number", "ariaLabel", 3],
  ["class-null", "className", null],
  ["callback-number", "onCommandError", 9],
  ["properties-fake", "properties", "fake"],
  ["properties-disposed", "properties", "disposed"],
  ["selection-fake", "selection", "fake"],
  ["selection-disposed", "selection", "disposed"],
  ["selection-unbound", "selection", "unbound"],
  ["selection-mismatch", "selection", "mismatch"],
];
export const cases = [
  ...invalid.map(([name, key, value]) =>
    c(
      "P-INVALID-" + name,
      { key, valueKind: Number.isNaN(value) ? "NaN" : String(value) },
      "synchronous Boundary TypeError; zero model commands and subscriptions",
      1,
    ),
  ),
  c(
    "P-OPTIONAL-undefined",
    "className/onCommandError explicitly undefined",
    "legal runtime omission, no query or selection",
    1,
  ),
  ...["idle", "pending", "success", "failed", "cancelled"].map((s) =>
    c(
      "P-STATE-" + s,
      s,
      "exact current target/status; specified operations only; no old/partial success",
      2,
    ),
  ),
  c(
    "P-FIELD-instance",
    "Core name/pathText/kind/defName/childCount=3/hasParamOverrides=false",
    "all original values visible; select uses original ref, not display text",
    2,
  ),
  c(
    "P-FIELD-ports",
    "duplicate names; direct/unresolved/interface/multi; width8/0/absent; false signed and ordered dims",
    "four original rows/order/ref; missing width unknown, optional fields missing not provided; dimensions retain order",
    2,
  ),
  c(
    "P-FIELD-params",
    "duplicate W, 128-bit/four-state/type text and all boolean flags",
    "four original rows/order and verbatim text; parameters have no selection",
    2,
  ),
  c(
    "P-FIELD-safe-empty",
    "empty ports/params then hostile text reload",
    "no ports/no params messages; raw text survives, no injected img/script nodes",
    2,
  ),
  c(
    "P-FIELD-diagnostic",
    "real transport HierError data getter fails while L6 builds diagnostic",
    "stable code/message and incomplete diagnostic notice; L7 does not inspect raw error/data again",
    2,
  ),
  ...[
    "reload",
    "retry-failed",
    "retry-cancelled",
    "cancel",
    "select-instance",
    "select-port",
  ].map((a) =>
    c(
      "P-ACTION-" + a,
      a,
      "one exact public call; correct target/ref/snapshot/origin; no extra load/reveal/selection",
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
  ].map((a) =>
    c(
      "P-NATIVE-" + a,
      a,
      a.includes("right")
        ? "native secondary input zero command/state/history/query changes"
        : "native primary/keyboard one select, exact original instance ref",
      3,
    ),
  ),
  c(
    "P-SELECTION-mark",
    "external ordered multiselect with bits/side/definition",
    "matching refs marked without modifying original selection/history; no automatic load",
    3,
  ),
  c(
    "P-SELECTION-port",
    "external sliced/side port then explicit full-port activation",
    "replace with original bare port ref/origin props; no internal signal or stale bits",
    3,
  ),
  c(
    "P-SELECTION-passive",
    "external definition/port/multiselect while panel idle",
    "no automatic target, first-item guessing or queries",
    1,
  ),
  ...[
    "mount",
    "strict",
    "shared",
    "unmount",
    "replace-properties",
    "replace-selection",
  ].map((a) =>
    c(
      "P-LIFE-" + a,
      a,
      "one own subscription per model while mounted; no implicit commands, own unsubscribe only; borrowed models/SDK remain live",
      1,
    ),
  ),
  c(
    "P-RACE-published-state",
    "capture old button; new model state published before React commit; click old button",
    "zero calls, no retry against current/new target",
    3,
  ),
  c(
    "P-RACE-pointer-target",
    "native pointerdown old instance; target changes and new DOM commits before pointerup",
    "gesture must not select or query new target",
    3,
  ),
  c(
    "P-RACE-away-back",
    "reload action failure after target A→B→A",
    "consume old rejection, suppress old callback/local feedback",
    4,
  ),
  c(
    "P-RACE-same-target",
    "reload same target pending→failed with Core error",
    "current failure delivered once with action-start target and original rejection",
    4,
  ),
  c(
    "P-RACE-latest-action",
    "real reload followed by explicit cancel; cancelled old reload settlement",
    "only latest action feedback, both settlements consumed",
    4,
  ),
  c(
    "P-RACE-callback-capture",
    "start pending reload, same-session committed callback change",
    "failure goes once to original committed callback, not new callback",
    4,
  ),
  ...[
    [
      "reload",
      "real reload fails via Core",
      "one callback, original target/error, state diagnostic remains",
    ],
    [
      "select",
      "real Selection listener throws undefined",
      "committed selection not rolled back; original AggregateError identity forwarded in microtask",
    ],
    [
      "cancel",
      "real cancelled-state observer throws",
      "cancel callback receives original rejection; original load not mislabeled cancel failure",
    ],
    [
      "callback",
      "callback throws a second raw value",
      "next render Boundary AggregateError [original rejection, callback thrown value]",
    ],
    [
      "no-callback",
      "failing real reload with no callback",
      "fixed operation failed feedback, no unknown error serialization",
    ],
    [
      "unmount",
      "unmount before pending action rejects",
      "consume result, zero callback/local feedback and owned subscriptions",
    ],
    [
      "replace",
      "replace one model before pending action rejects",
      "consume result, zero old-session callback/new-session feedback",
    ],
  ].map(([id, input, expected]) => c("P-ERROR-" + id, input, expected, 4)),
  c(
    "P-AX-outside",
    "external focused input plus data/selection updates",
    "no focus theft; named region and native table/header/button/status semantics",
    4,
  ),
  c(
    "P-AX-removed",
    "focus cancel button then actual success removes it",
    "focus falls back to this region, not another panel",
    4,
  ),
  c(
    "P-AX-tab",
    "native Tab sequence starting before panel",
    "buttons reachable once in native order; can leave panel",
    4,
  ),
  c(
    "P-AX-multiple",
    "same models mounted twice with independent labels",
    "DOM ids isolated; interaction/removed-focus confined to own panel",
    4,
  ),
  c(
    "P-AX-scroll",
    "narrow host and long raw label/value with height160",
    "whole region height bounded; local scroll preserves full text and original identity",
    4,
  ),
  c(
    "P-CORE-vertical",
    "original B b_tree_navigation.sv plain leaf via real Core SDK then select port",
    "original reply fields displayed; d/y widths1 and actual port ref selected; models/transport/core released",
    5,
  ),
];
export const packageCases = [
  c(
    "P-PACK-root",
    "original B outside tarball consumer",
    "native new root function/types and old roots preserved; no Node/Electron/ReactDOM root dependency",
    5,
  ),
  c(
    "P-PACK-css",
    "outside installed @hier/views/properties-panel.css",
    "nonempty valid CSS resolves inside consumer; three old CSS exports retain",
    5,
  ),
  c(
    "P-PACK-peer",
    "original offline strict peer tarball gate",
    "one original React peer installation, no new runtime dependency",
    5,
  ),
];
