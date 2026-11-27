// B fixtures from public Schema and DESIGN, not A search HDL/consumer/witness.
export const Q = Object.freeze({
  snapshotId: "B60-search-快照",
  text: " Flag* ",
});
export const kinds = Object.freeze([
  "definition",
  "instance",
  "port",
  "signal",
  "process",
  "register",
]);
export const complete = Object.freeze({ status: "complete", reasons: [] });
export const partial = Object.freeze({
  status: "partial",
  reasons: [
    { code: "indexing", detail: "B60 incomplete" },
    { code: "indexing", detail: "B60 incomplete" },
  ],
  B_meta: { v: 7 },
});
export const hits = () =>
  kinds.map((kind, n) => {
    const name =
      n === 0
        ? "leaf"
        : n === 1
          ? "left"
          : n === 2 || n === 3
            ? "shared"
            : kind === "process"
              ? "@process:0"
              : "@register:0";
    const path =
      n === 0 ? [name] : n === 1 ? ["top", name] : ["top", "left", name];
    return {
      kind,
      ref:
        n === 0
          ? "B60:not-a-def-prefix"
          : n === 1
            ? "D:actually-object"
            : "B60:hit/" + n,
      name,
      path,
      pathText: path.join("."),
      def: "B60:not-a-def-prefix",
      ...(n === 0 ? {} : { inst: "D:actually-object" }),
      B_hit: { n },
    };
  });
export const page = (items = hits(), next) => ({
  items,
  ...(next === undefined ? {} : { next }),
  B_page: { kept: ["尾", 7] },
});
