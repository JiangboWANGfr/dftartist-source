// Finite B DOM inputs. No expected outcome is inferred from an implementation.
import { invalid as panelInvalid } from "../independent-properties-panel/cases.mjs";
export const invalid = panelInvalid.map(([name, key, value]) => [
  name.replace("properties", "connections"),
  key === "properties" ? "connections" : key,
  value,
]);
const c = (id, input, expected, section) => ({
  id: "OCV-" + id,
  input,
  expected,
  basis: "DESIGN §6.21." + section + "; explicitly inherited §6.19",
});
export const cases = [
  ...invalid.map(([name, key, value]) =>
    c(
      "INVALID-" + name,
      { key, valueKind: Number.isNaN(value) ? "NaN" : String(value) },
      "render TypeError before own subscriptions or commands",
      1,
    ),
  ),
  c(
    "OPTIONAL-undefined",
    "explicit optional undefined",
    "runtime omission accepted; no command",
    1,
  ),
  ...["idle", "pending", "success", "failed", "cancelled"].map((s) =>
    c("STATE-" + s, s, "exact five-state content/operations, no stale data", 2),
  ),
  ...[
    [
      "target",
      "whole target then explicit bits0/128/inside/local",
      "original ref/reach/bits/side; omitted labels separate from explicit fields",
    ],
    [
      "object",
      "object metadata hostile name/path/kind/inst",
      "original fields, no opaque-ref parsing/extra metadata queries",
    ],
    [
      "endpoints",
      "all nine kinds, duplicate process ref/order",
      "all original rows remain in each group, no ref merge",
    ],
    [
      "coordinates",
      "queried0/3 vs bits6/3 vs at signal",
      "separate labelled query/endpoint/action-position values; 0 retained",
    ],
    [
      "via-source",
      "two ordered map/next items and full source span/hash",
      "raw declared fields and order, no source load/open or computed coordinates",
    ],
    [
      "text-safe",
      "hostile text and 128-bit four-state value",
      "text content intact, no HTML execution/unknown extension display",
    ],
    [
      "missing-empty",
      "const/unconnected/unresolved missing fields; empty via",
      "missing shown not provided; no fabricated endpoint identity; empty route explicitly empty",
    ],
    [
      "diagnostic",
      "real transport HierError data getter fails during L6 projection",
      "code/message/dataIssue shown without re-reading unknown diagnostic",
    ],
  ].map(([id, input, expected]) => c("FIELD-" + id, input, expected, 2)),
  ...[
    "complete-empty",
    "partial-empty",
    "mixed",
    "partial-both",
    "reason-order",
  ].map((id) =>
    c(
      "COMPLETE-" + id,
      id,
      "separate drivers/loads status and original ordered duplicate reasons; incomplete empty not no connections, no implicit retry",
      2,
    ),
  ),
  ...[
    "reload",
    "retry-failed",
    "retry-cancelled",
    "cancel",
    "target-bare",
    "target-sliced",
    "endpoint",
    "no-ref",
  ].map((id) =>
    c(
      "ACTION-" + id,
      id,
      "one exact reload/cancel/select call, action-start target; target preserves request bits/side, endpoint only original ref",
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
  ].map((id) =>
    c(
      "NATIVE-" + id,
      id,
      id.includes("right")
        ? "actual secondary button zero call/state/history/query changes"
        : "native primary/keyboard exactly one target select, no multi-edit",
      3,
    ),
  ),
  ...["exact-target", "endpoint-ref", "passive"].map((id) =>
    c(
      "SELECTION-" + id,
      id,
      "target mark requires exact ref/bits/side; endpoint mark ref only; external selection does not mutate models/history/queries",
      3,
    ),
  ),
  ...[
    "mount",
    "strict",
    "shared",
    "unmount",
    "replace-connections",
    "replace-selection",
  ].map((id) =>
    c(
      "LIFE-" + id,
      id,
      "one own subscription per borrowed model per mount, zero implicit command, own unsubscribe only",
      1,
    ),
  ),
  ...[
    [
      "published-state",
      "old button before new state commits",
      "old published state action no-ops",
    ],
    [
      "pointer-target",
      "native down then target changes before up",
      "gesture never selects new target",
    ],
    [
      "target-identity",
      "action then clear/load field-equal target",
      "old feedback revoked by target object identity",
    ],
    [
      "away-back",
      "A→B→A in one React batch before old rejection",
      "old feedback not revived",
    ],
    [
      "same-target",
      "own reload pending→failure with same original target identity",
      "one original failure delivered",
    ],
    [
      "callback-capture",
      "action then committed callback replacement",
      "old failure goes to callback captured at action start",
    ],
    [
      "latest-action",
      "reload then newer explicit cancel",
      "older settlement consumed, latest feedback wins",
    ],
    [
      "uncommitted",
      "callback prop render suspends before commit",
      "uncommitted callback cannot receive old action error",
    ],
  ].map(([id, input, expected]) => c("RACE-" + id, input, expected, 4)),
  ...[
    "reload",
    "select",
    "cancel",
    "callback",
    "no-callback",
    "unmount",
    "replace",
    "callback-invalidates",
  ].map((id) =>
    c(
      "ERROR-" + id,
      id,
      "original error/cause and frozen failure.target/item, microtask feedback; invalidated session/target wins and late settlement consumed",
      4,
    ),
  ),
  ...["outside", "removed", "tab", "multiple", "scroll"].map((id) =>
    c(
      "AX-" + id,
      id,
      "named region/native table/buttons, local focus/height/scroll, Tab exits, per-mount IDs",
      4,
    ),
  ),
  c(
    "CORE-vertical",
    "original B tree SV plain/d via real SDK/Core→model→UI→target/endpoint selection",
    "real port/ref/queried bits displayed, correct selection source; all owned resources released",
    5,
  ),
];
export const packageCases = ["root", "css", "peer"].map((id) =>
  c(
    "PACK-" + id,
    "original outside tarball consumer",
    "new root/function/types/CSS plus old roots/four CSS and original React peer/dependency boundary preserved",
    5,
  ),
);
