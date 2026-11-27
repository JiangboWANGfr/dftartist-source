// B62 own lawful search wire; no A consumer, search.sv or witness.
import { snapshotId } from "../independent-properties-panel/input.mjs";
export { snapshotId };
export const query = () => ({ snapshotId, text: " B62 原始* 文本 " });
export const complete = { status: "complete", reasons: [] };
export const partial = {
  status: "partial",
  reasons: [
    { code: "indexing", at: "B62-at", detail: "B62 原因<&>" },
    { code: "indexing", detail: "" },
    { code: "indexing", detail: "" },
  ],
};
export const kindList = [
  "definition",
  "instance",
  "port",
  "signal",
  "process",
  "register",
];
export const hits = () =>
  kindList.map((kind, n) => ({
    kind,
    ref:
      n === 0
        ? "B62-opaque-definition"
        : n === 1
          ? "d:opaque-object"
          : "B62-hit-" + n,
    name:
      n === 2 || n === 3
        ? "共享名称"
        : n === 4
          ? "@process:0"
          : n === 5
            ? "@register:0"
            : "B62-" + kind,
    path: n === 0 ? ["B62-leaf"] : ["B62-top", "left", "B62-" + kind],
    pathText:
      n === 0
        ? "B62-leaf"
        : "B62-top.left." + (n === 2 || n === 3 ? "共享名称" : kind),
    def: "B62-opaque-definition",
    ...(n === 0 ? {} : { inst: "d:opaque-object" }),
    B_extension: "B62-EXTRA-DO-NOT-RENDER",
  }));
export const page = (items = hits(), next) => ({
  items,
  ...(next === undefined ? {} : { next }),
  B_extension: "B62-PAGE-EXTRA",
});
