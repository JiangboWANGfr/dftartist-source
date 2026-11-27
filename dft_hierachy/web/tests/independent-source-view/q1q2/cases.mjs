import { document as doc, longText, point } from "../source-data.mjs";
export const documents = Object.freeze({
  "nonempty-short": doc("a😀中", 1, 3),
  "nonempty-overflow": doc(longText, point, point + 1),
  "empty-middle": doc("alpha", 2, 2),
  "empty-file": doc("", 0, 0),
  "empty-eof": doc("tail", 4, 4),
  "empty-trailing-eof": doc("tail\n", 5, 5),
  "changed-empty": doc("", 0, 0, true),
  "changed-short": doc("new", 0, 0, true),
});
export const cases = [
  ...[
    "omitted",
    "empty",
    "undefined",
    "null",
    "boxed",
    "number",
    "array",
    "symbol",
  ].map((value) => ({
    id: "B-SV-Q1-" + value,
    kind: "className",
    input: { value },
    expected: ["omitted", "empty"].includes(value)
      ? "primitive omission/empty accepted without coercion"
      : "explicit own property throws synchronous TypeError via host error boundary",
    basis: "DESIGN §6.14.1 Q1",
  })),
  ...Object.keys(documents).map((name) => ({
    id: "B-SV-Q2-" + name,
    kind: "association",
    input: { name },
    expected:
      "current visible code-outside position/warning belongs to this instance and is directly described by the same tabindex0 both-axis source scroll container; ancestor-only insufficient",
    basis: "DESIGN §6.14.3/.4 Q2",
  })),
  ...["replace", "multi", "strict"].map((name) => ({
    id: "B-SV-Q2-" + name,
    kind: name,
    input: { name },
    expected:
      name === "replace"
        ? "exact→empty→changed references only current visible explanation and keeps raw text"
        : name === "multi"
          ? "each source body directly describes its own visible explanation; IDs disjoint"
          : "StrictMode replay keeps direct source-body association and raw text",
    basis: "DESIGN §6.14.3/.4/.5 Q2",
  })),
];
export const resolved = ["B-SOURCEVIEW-Q1", "B-SOURCEVIEW-Q2"];
export function expected(data) {
  if (data.location.status === "changed")
    return { warning: "源码已变化，位置可能不准" };
  const { start, end } = data.location.range;
  return {
    numbers: [start.line, start.column, end.line, end.column],
    empty: start.offset === end.offset,
  };
}
