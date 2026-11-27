export const invalidTags = [
  null,
  0,
  1,
  false,
  true,
  {},
  [],
  ["object"],
  "",
  "DEFINITION",
  "unknown",
  " object",
];
const basis =
  "DESIGN §6.16.1–2 and existing SDK schema7 protocol-error/ownership contract";
const row = (id, input, expected) => ({
  id: "B-RK-SDK-" + id,
  input,
  expected,
  basis,
});
export const cases = [
  row(
    "legacy",
    { mode: "legacy" },
    "schema7 no tag remains a frozen ordinary page; no guessing/extra requests",
  ),
  row(
    "definition-opaque",
    { mode: "definition" },
    "statement kind, object-looking ref and inst can carry authoritative definition",
  ),
  row(
    "object-opaque",
    { mode: "object" },
    "definition kind and definition-looking ref without inst can carry object",
  ),
  row(
    "mixed-page",
    { mode: "mixed" },
    "legacy/definition/object and unknown extensions retained; no inferred defaults",
  ),
  row(
    "partial",
    { mode: "partial" },
    "tagged partial page/reasons/cursor preserved and frozen",
  ),
  row(
    "empty",
    { mode: "empty" },
    "empty schema7 page remains legal; no fabricated label",
  ),
  row(
    "concurrent",
    { mode: "concurrent" },
    "out-of-order independent requests preserve original labels/pages without extra lookup",
  ),
  row(
    "model-pages",
    { mode: "model-pages" },
    "real CandidatesModel preserves the first page identity and old/new labels across pagination; no synthesized Selection",
  ),
  ...invalidTags.map((value, i) =>
    row(
      "invalid-" + i,
      { mode: "invalid", value },
      "explicit invalid refKind produces client protocol_error, closes connection and settles all pending, never accepted as absent",
    ),
  ),
  row(
    "invalid-second-item",
    { mode: "invalid-item" },
    "one bad tag in otherwise legal page invalidates whole response and connection",
  ),
  row(
    "invalid-second-page",
    { mode: "invalid-page" },
    "legacy first page remains immutable; later bad tag fails pending and closes",
  ),
  row(
    "invalid-model",
    { mode: "invalid-model" },
    "real candidate model exposes SDK protocol_error instead of publishing malformed page",
  ),
];
