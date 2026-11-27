// B independent oracle: DESIGN 6.14, never A output.
export const cases = [];
const add = (id, kind, input, expected, section) =>
  cases.push({
    id: "B-SV-" + id,
    kind,
    input,
    expected,
    basis: "DESIGN §6.14." + section,
  });
for (const status of ["idle", "pending", "success", "failed", "cancelled"])
  add(
    "state-" + status,
    "state",
    { status },
    "one named region; current status, busy and text/diagnostic only; no stale content",
    2,
  );
for (const status of ["idle", "pending", "failed", "cancelled"])
  add(
    "replace-" + status,
    "transition",
    { status },
    "success content/mark disappears atomically; only new state diagnostic/status remains",
    2,
  );
export const texts = {
  lf: "module a;\nendmodule\n",
  crlf: "a\r\nb\r\n",
  cr: "a\rb\r",
  bom: "\uFEFFmodule b;",
  tabs: "\talpha\t\tend",
  trailing: "end\n\n",
  astral: "a😀中e\u0301",
  html: '<img src="/BAD" onerror="window.injected=1">&<script>window.injected=1</script>',
  empty: "",
  mixed: "\uFEFF\t😀\r\nx\rz\n",
};
for (const [name, text] of Object.entries(texts))
  add(
    "text-" + name,
    "text",
    { name, text },
    "code.textContent identical UTF-16 units; no HTML parsing, line-number or newline normalization",
    2,
  );
for (const name of ["astral", "crlf", "multiline"])
  add(
    "range-" + name,
    "range",
    { name },
    "one mark is exact half-open slice; prefix+mark+suffix preserve raw text; L6 position described outside code",
    3,
  );
for (const name of ["file", "middle", "eof", "trailing-eof"])
  add(
    "empty-" + name,
    "empty",
    { name },
    "empty exact range has no adjacent-character highlight/fake text; textless anchors allowed; remains success and says 空范围 with start position",
    3,
  );
for (const name of ["short", "empty", "different"])
  add(
    "changed-" + name,
    "changed",
    { name },
    "current raw text and warning only; no exact mark, old coordinate or guessed/clamped snapshot span",
    3,
  );
for (const status of ["failed", "cancelled", "failure-html"])
  add(
    "diagnostic-" + status,
    "diagnostic",
    { status },
    "only origin/code/message as text; no data/dataIssue/cause/extension getter/enumeration/JSON probing",
    2,
  );
export const invalid = {
  ariaLabel: [
    "empty",
    "blank",
    "null",
    "undefined",
    "number",
    "boxed",
    "symbol",
  ],
  height: [
    "zero",
    "negative-zero",
    "negative",
    "nan",
    "infinity",
    "negative-infinity",
    "boxed",
    "string",
    "undefined",
  ],
  className: ["null", "number", "boxed", "array", "symbol"],
};
for (const [field, values] of Object.entries(invalid))
  for (const value of values)
    add(
      "invalid-" + field + "-" + value,
      "invalid",
      { field, value },
      "React error boundary receives synchronous TypeError; no coercion or SourceDocumentFailure",
      1,
    );
for (const name of ["raw-label", "empty-class", "small-height"])
  add(
    "props-" + name,
    "props",
    { name },
    "legal primitive props accepted, raw aria label preserved, total component height follows finite positive input",
    1,
  );
for (const name of [
  "initial",
  "cross-screen",
  "long-line",
  "empty-eof",
  "changed-top",
  "new-data",
  "same-wrapper",
  "same-label",
  "same-class",
  "same-height",
  "return-idle",
  "return-pending",
  "return-failed",
  "return-cancelled",
  "remount",
  "hidden",
  "zero-viewport",
  "css-only-before-commit",
  "two-instances",
  "strict",
])
  add(
    "scroll-" + name,
    "scroll",
    { name },
    "local measured layout positioning/identity rules; preserve completed same-data scroll; no parent/page/other-view scroll or focus change",
    4,
  );
for (const name of [
  "focus",
  "tab",
  "keyboard",
  "selection",
  "clipboard",
  "unique-description",
])
  add(
    "access-" + name,
    "access",
    { name },
    "named region/status and source relation, native keyboard/selection/clipboard, no focus stealing or cross-instance ID collision",
    2,
  );
for (const name of ["sdk-owned", "no-layout-watchers"])
  add(
    "lifecycle-" + name,
    "lifecycle",
    { name },
    "borrowed SDK/L6 remain live with no extra request/subscription/dispose; no timer/ResizeObserver or global keyboard ownership",
    1,
  );
export const ambiguities = [
  {
    id: "B-SOURCEVIEW-Q1",
    input: "className present undefined",
    expected: "unresolved runtime behavior; not a product case",
  },
  {
    id: "B-SOURCEVIEW-Q2",
    input: "empty/EOF aria-describedby and exact source-area target",
    expected:
      "unresolved; no fixed DOM ancestry or empty-description requirement",
  },
];
add(
  "replace-success",
  "transition",
  { status: "success" },
  "new successful text/range replaces prior success even at same target",
  2,
);
for (const status of ["idle", "pending", "success"])
  add(
    "old-error-to-" + status,
    "transition-error",
    { status },
    "new state atomically clears old diagnostic; no old message/body leakage",
    2,
  );
add(
  "base-no-css",
  "base-layout",
  { css: false },
  "without optional visual CSS raw text/exact state/height/no-wrap/scroll layout still work",
  5,
);
