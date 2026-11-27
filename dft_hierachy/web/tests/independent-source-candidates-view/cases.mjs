// Input/expected/basis are frozen before a production candidate component exists.
const cases = [];
const add = (
  id,
  group,
  input,
  expected,
  basis = "DESIGN §6.18." +
    {
      props: 1,
      display: 2,
      command: 2,
      activation: 3,
      keyboard: 4,
      lifecycle: 5,
      vertical: 6,
    }[group],
) => cases.push({ id, group, input, expected, basis });
for (const [key, value] of [
  ["ariaLabel", "blank"],
  ["ariaLabel", "boxed"],
  ["ariaLabel", "null"],
  ["height", "zero"],
  ["height", "negative"],
  ["height", "nan"],
  ["height", "infinity"],
  ["height", "string"],
  ["className", "undefined"],
  ["className", "null"],
  ["className", "boxed"],
  ["onCommandError", "null"],
  ["navigation", "fake"],
  ["navigation", "proxy"],
  ["navigation", "disposed"],
  ["selection", "fake"],
  ["selection", "proxy"],
  ["selection", "disposed"],
  ["selection", "unbound"],
  ["selection", "other-snapshot"],
])
  add(
    "P-" + key + "-" + value,
    "props",
    { key, value },
    "Host boundary receives TypeError; no query or selection write.",
  );
for (const mode of [
  "idle",
  "complete-empty",
  "partial-empty",
  "success",
  "duplicates",
  "legacy",
  "partial-pages",
  "pending-prefix",
  "failed-prefix",
  "cancelled-prefix",
])
  add(
    "D-" + mode,
    "display",
    { mode },
    "Original ordered text/rows, status and completeness; no implicit selection; diagnostics separate.",
  );
for (const mode of ["object", "definition", "partial", "legacy"])
  add(
    "A-" + mode,
    "activation",
    { mode, event: "trusted-click" },
    "Explicit known-address row selects authoritative ref/def once; legacy row remains inspectable and cannot select.",
  );
for (const key of ["ArrowDown", "ArrowUp", "Home", "End"])
  add(
    "K-" + key,
    "keyboard",
    { key, event: "trusted-key" },
    "Local focus moves/clamps without writing Selection; roving tabindex.",
  );
for (const key of ["Enter", "Space"])
  add(
    "K-confirm-" + key,
    "keyboard",
    { key, event: "trusted-key" },
    "Original row explicitly confirms one item with origin source; no native second activation/history.",
  );
for (const mode of [
  "repeat",
  "composing",
  "control",
  "meta",
  "alt",
  "shift",
  "escape",
  "tab",
])
  add(
    "K-no-confirm-" + mode,
    "keyboard",
    {
      mode,
      event:
        mode === "composing" || mode === "repeat"
          ? "synthetic-edge"
          : "trusted-key",
    },
    "No semantic confirmation; Tab leaves normally; Escape does not cancel.",
  );
for (const mode of ["loadMore", "reloadCandidates", "cancelCandidates"])
  add(
    "C-" + mode,
    "command",
    { mode, event: "trusted-click" },
    "Only public corresponding operation changes model state; no implicit operation.",
  );
for (const mode of [
  "strict-mount",
  "rerender",
  "unmount",
  "selection-aggregate",
])
  add(
    "L-" + mode,
    "lifecycle",
    { mode },
    "Mount/render do not select/query; borrowed resources survive unmount; committed selection is not rolled back after listener AggregateError.",
  );
add(
  "V-source-keyboard-to-selection",
  "vertical",
  { event: "trusted-key", mode: "source-position" },
  "Real SourceView Alt+Enter invokes host locate; real navigation publishes candidates; explicit candidate click alone selects.",
  "DESIGN §6.15 and §6.18.6",
);
export { cases };
