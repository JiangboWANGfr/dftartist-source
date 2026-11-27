// Literal B expectations from DESIGN 6.16 + unchanged public schema shapes.
// No validator/product output is consulted when constructing this inventory.
export const span = {
  file: "opaque B file",
  path: "/B/ref-kind 空格 中文.sv",
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 4, line: 1, column: 5 },
  contentHash: "7".repeat(64),
};
const base = () => ({
  ref: "B opaque address",
  kind: "statement",
  span: structuredClone(span),
});
const hit = (tag) => ({
  ...base(),
  ...(tag === undefined ? {} : { refKind: tag }),
});
const wrappers = [
  ["SourceHit", (value) => value],
  ["SourceHitPage", (value) => ({ items: [value] })],
  ["SourceResolveResult", (value) => ({ items: [value] })],
  [
    "SourceResolveResponse",
    (value) => ({
      id: 1,
      ok: true,
      result: { items: [value] },
      completeness: { status: "complete", reasons: [] },
    }),
  ],
];
export const invalidTags = [
  ["null", null],
  ["false", false],
  ["true", true],
  ["zero", 0],
  ["number", 1],
  ["empty", ""],
  ["capital", "Definition"],
  ["upper", "OBJECT"],
  ["category", "instance"],
  ["space", "object "],
  ["unknown", "future"],
  ["object", {}],
  ["array", []],
  ["array-value", ["object"]],
  ["wrapped", { value: "object" }],
];
const rows = [];
function add(
  id,
  definition,
  input,
  expected,
  legacyExpected,
  basis = "DESIGN §6.16.1–2; existing SourceHit/SourceHitPage/SourceResolveResponse schema",
) {
  rows.push({
    id: "B-RK-" + id,
    definition,
    input,
    expected,
    legacyExpected,
    basis,
  });
}
for (const [name, value, expected] of [
  ["omitted", undefined, true],
  ["definition", "definition", true],
  ["object", "object", true],
  ...invalidTags.map(([name, value]) => ["invalid-" + name, value, false]),
])
  for (const [definition, wrap] of wrappers)
    add(
      "tag-" + name + "-" + definition,
      definition,
      wrap(hit(value)),
      expected,
      true,
    );
for (const [name, value, expected] of [
  ["definition", "definition", true],
  ["object", "object", true],
  ...invalidTags.map(([name, value]) => ["invalid-" + name, value, false]),
])
  add("enum-" + name, "SourceRefKind", value, expected, null);
for (const [ri, ref] of [
  "def:looks-definition",
  "obj:looks-object",
  "space /中文?#",
  "no-prefix-at-all",
].entries())
  for (const kind of ["definition", "instantiation", "statement"])
    for (const hasInst of [false, true])
      for (const tag of [undefined, "definition", "object"]) {
        const value = {
          ...hit(tag),
          ref,
          kind,
          ...(hasInst ? { inst: "unrelated context 中" } : {}),
        };
        add(
          "axes-" + ri + "-" + kind + "-" + hasInst + "-" + (tag ?? "omitted"),
          "SourceHit",
          value,
          true,
          true,
          "DESIGN §6.16.1–2: opaque ref, SourceKind and inst have no structural correlation with refKind",
        );
      }
for (const [name, value] of [
  [
    "hit-extension",
    {
      ...hit("definition"),
      B_future: { refKind: null, kind: "not-a-kind", inst: [] },
    },
  ],
  [
    "span-extension",
    {
      ...hit("object"),
      span: { ...structuredClone(span), B_future: ["not", "a", "SourceHit"] },
    },
  ],
])
  for (const [definition, wrap] of wrappers) {
    const input = wrap(structuredClone(value));
    if (definition !== "SourceHit") input.B_future = { refKind: "unknown" };
    if (definition === "SourceResolveResponse")
      input.result.B_future = { refKind: false };
    add(
      name + "-" + definition,
      definition,
      input,
      true,
      true,
      "DESIGN §6.16.2: additionalProperties remains true at old extension points",
    );
  }
const noRef = hit("object");
delete noRef.ref;
const noKind = hit("object");
delete noKind.kind;
const noSpan = hit("object");
delete noSpan.span;
for (const [name, value] of [
  ["no-ref", noRef],
  ["no-kind", noKind],
  ["no-span", noSpan],
  ["numeric-ref", { ...hit("object"), ref: 7 }],
  ["bad-kind", { ...hit("object"), kind: "object" }],
  ["null-span", { ...hit("object"), span: null }],
  ["null-inst", { ...hit("object"), inst: null }],
  ["numeric-inst", { ...hit("object"), inst: 9 }],
])
  for (const [definition, wrap] of wrappers)
    add(
      "old-shape-" + name + "-" + definition,
      definition,
      wrap(structuredClone(value)),
      false,
      false,
      "DESIGN §6.16.2: old required fields and their shapes are unchanged",
    );
add("empty-page", "SourceHitPage", { items: [] }, true, true);
add(
  "opaque-next",
  "SourceResolveResult",
  { items: [hit("object")], next: "opaque cursor /中文", B_future: [] },
  true,
  true,
);
add("null-items", "SourceResolveResult", { items: null }, false, false);
add(
  "null-next",
  "SourceResolveResult",
  { items: [], next: null },
  false,
  false,
);
add(
  "mixed-partial-reply",
  "SourceResolveResponse",
  {
    id: 7,
    ok: true,
    result: {
      items: [hit(undefined), hit("definition"), hit("object")],
      next: "opaque partial cursor",
    },
    completeness: { status: "partial", reasons: [{ code: "budget_nodes" }] },
  },
  true,
  true,
  "DESIGN §6.16.2: old missing tags remain compatible, including partial pages",
);
add(
  "invalid-last-reply-item",
  "SourceResolveResponse",
  {
    id: 8,
    ok: true,
    result: { items: [hit("definition"), hit("future")] },
    completeness: { status: "complete", reasons: [] },
  },
  false,
  true,
  "DESIGN §6.16.2: explicit invalid member is not omission, including later nested items",
);
add(
  "missing-reply-result",
  "SourceResolveResponse",
  {
    id: 9,
    ok: true,
    completeness: { status: "complete", reasons: [] },
  },
  false,
  false,
  "Existing Success required result remains required",
);
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const cases = freeze(rows);
