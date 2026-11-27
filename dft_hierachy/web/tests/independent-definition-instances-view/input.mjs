// B66 lawful InstInfo fixtures; not A consumer/HDL/witness.
import { snapshotId } from "../independent-properties-panel/input.mjs";
export { snapshotId };
export const query = () => ({ snapshotId, def: "B66:opaque-definition<&> " });
export const complete = { status: "complete", reasons: [] };
export const partial = {
  status: "partial",
  reasons: [
    { code: "indexing", at: "B66-at", detail: "B66 原因<&>" },
    { code: "indexing", detail: "" },
    { code: "indexing", detail: "" },
  ],
};
export const kindList = [
  "module",
  "interface",
  "program",
  "blackbox",
  "primitive",
];
export const hits = () =>
  kindList.map((kind, n) => ({
    kind,
    ref: n === 0 ? "d:opaque-instance" : "B66-occurrence-" + n,
    name: n < 2 ? "共享名称" : "B66-" + kind,
    path: ["B66 root[" + n + "]", "part<&>", "tail " + n],
    pathText: "display-only." + n,
    def: query().def,
    defName: "B66 leaf",
    childCount: 100000003 + n,
    hasParamOverrides: n % 2 === 1,
    B_extension: "B66-EXTRA-DO-NOT-RENDER",
  }));
export const page = (items = hits(), next) => ({
  items,
  ...(next === undefined ? {} : { next }),
  B_extension: "B66-PAGE-EXTRA",
});
