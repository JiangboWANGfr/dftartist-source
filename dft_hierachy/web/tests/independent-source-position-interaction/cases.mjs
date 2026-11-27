// B literal acceptance inventory, DESIGN 6.15. No implementation-derived oracle.
export const text = "\uFEFFA\r\nB😀\tCD\rE\nF end";
export const cases = [];
const add = (id, group, input, expected, basis = "DESIGN §6.15.1–4") =>
  cases.push(
    Object.freeze({ id: "B-SPI-" + id, group, input, expected, basis }),
  );
for (const value of [
  "undefined",
  "null",
  "array",
  "function",
  "missing-locate",
  "missing-onError",
  "bad-locate",
  "bad-onError",
])
  add(
    "config-" + value,
    "config",
    { value },
    "synchronous TypeError at render; callbacks not called",
    "§6.15.1",
  );
add(
  "omitted",
  "config",
  {},
  "old read-only rendering, no interaction hint or calls",
  "§6.15.1",
);
add(
  "config-read-once",
  "config",
  {},
  "locate/onError read once per actual render; no extension getter/enumeration/freeze",
  "§6.15.1",
);
for (const key of ["locate", "onError"])
  add(
    "getter-" + key,
    "config",
    { key },
    "original getter throw reaches React boundary",
    "§6.15.1",
  );
for (const key of ["ariaLabel", "height", "className"])
  add(
    "old-validation-" + key,
    "config",
    { key },
    "old input fails before reading positionQuery fields",
    "§6.15.1",
  );
add(
  "enabled-hint",
  "activation",
  {},
  "visible code-external instruction, body direct aria-describedby adds both descriptions, Alt+Enter advertised",
  "§6.15.2",
);
add(
  "two-instance-instructions",
  "activation",
  { multi: true },
  "instruction descriptions are instance-local; B keyboard action uses B config/document only",
  "§6.15.1–2",
);
for (const status of ["idle", "pending", "failed", "cancelled", "changed"])
  add(
    "disabled-" + status,
    "disabled",
    { status },
    "no locate/interaction instruction/shortcut; no default prevention",
    "§6.15.2",
  );
const points = [
  ["before-mark", 1],
  ["inside-mark", 5],
  ["after-mark", 14],
  ["CRLF-interior", 3],
  ["surrogate-interior", 6],
  ["BOM", 0],
  ["tab-boundary", 7],
  ["EOF", 18],
  ["code-element-start", 0],
  ["code-element-end", 18],
  ["mark-element-start", 4],
  ["mark-element-end", 9],
  ["empty-code", 0],
  ["backward-focus", 1],
  ["collapsed", 8],
  ["owner-document", 8],
];
for (const [name, offset] of points)
  add(
    "key-" + name,
    "key",
    { name, offset },
    "one same-stack locate with original document/raw offset; valid local key prevented; Selection/focus/raw text unchanged",
    "§6.15.2",
  );
for (const name of [
  "repeat",
  "composing",
  "ctrl",
  "meta",
  "shift",
  "without-alt",
  "other-key",
  "no-selection",
  "anchor-outside",
  "focus-outside",
  "target-outside",
  "two-ranges",
  "anchor-other-instance",
  "focus-other-instance",
])
  add(
    "key-ignore-" + name,
    "key-ignore",
    { name },
    "no locate and no preventDefault; raw Selection/focus unchanged",
    "§6.15.2",
  );
for (const name of [
  "click",
  "pointermove",
  "contextmenu",
  "copy",
  "scroll",
  "dragstart",
  "selectionchange",
])
  add(
    "ignore-" + name,
    "ignore",
    { name },
    "ordinary native event does not query",
    "§6.15.2",
  );
for (const scale of [0.5, 1, 1.5])
  add(
    "trusted-mouse-" + scale,
    "trusted-mouse",
    { scale },
    "real browser dblclick uses native caret at event viewport coordinates, one same-stack raw-document call; no component cancellation",
    "§6.15.2",
  );
add(
  "trusted-mouse-scrolled",
  "trusted-mouse",
  { scale: 1, scroll: true },
  "native caret after actual local horizontal/vertical scroll maps to raw code, not viewport character arithmetic",
  "§6.15.2",
);
add(
  "trusted-key",
  "trusted-key",
  {},
  "real browser Alt+Enter uses reverse-selection focus; one query; browser key prevented",
  "§6.15.2",
);
for (const mode of [
  "primary",
  "fallback",
  "unavailable",
  "null",
  "outside",
  "wrong-target",
  "button",
  "ctrl",
  "meta",
  "shift",
  "alt",
])
  add(
    "mouse-" + mode,
    "mouse",
    { mode },
    "native interface branch/target/button/modifiers obey contract; unavailable gives fixed fallback hint, no guessed offset",
    "§6.15.2",
  );
for (const mode of [
  "success",
  "then-nested-first-wins",
  "then-receiver",
  "callback-return-ignored",
  "sync-opaque",
  "sync-undefined",
  "reject-opaque",
  "reject-undefined",
  "reject-aggregate",
  "return-undefined",
  "return-null",
  "return-number",
  "return-object",
  "return-bad-then",
  "then-getter-throw",
  "then-call-throw",
  "then-read-once",
  "thenable-first-wins",
  "foreign-promise",
  "same-data-render",
  "uncommitted-config",
  "new-data",
  "new-config",
  "exit-restore",
  "remove-restore",
  "changed-restore",
  "unmount-remount",
  "sync-unmount",
  "sync-new-config",
  "invalid-click-preserves",
  "latest-action",
  "failure-frozen",
  "callback-throw",
  "callback-reconfigure-throw",
  "callback-unmount-throw",
  "new-action-clears",
  "function-thenable",
  "mouse-hint-clears",
  "failure-config-clears",
  "failure-document-clears",
])
  add(
    "feedback-" + mode,
    "feedback",
    { mode },
    "original return immediately observed; failure timing/identity/frozen shallow record, latest live-session qualification, prompt and callback error rules",
    "§6.15.3",
  );
for (const mode of ["valid", "CRLF", "surrogate", "stale"])
  add(
    "model-" + mode,
    "model",
    { mode },
    "actual SourceNavigationModel+SDK, original document/offset forwarded; pending/reply or original L6 rejection, no UI coordinate repair; controlled Transport NOT Core",
    "§6.15.2–4 / §6.12–13",
  );
Object.freeze(cases);
