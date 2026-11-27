import { snapshotId } from "../independent-properties-panel/input.mjs";
export { snapshotId };
export const query = () => ({ snapshotId, text: " b_tree_top/\\a.b \t" });
export const Q = Object.freeze(query());
export const refs = () => [
  "d:opaque-object",
  "B68/ref<&>",
  "B68/duplicate",
  "B68/duplicate",
  "B68 tail\tref",
];
export const complete = { status: "complete", reasons: [] };
export const partial = {
  status: "partial",
  reasons: [
    { code: "indexing", at: "B68-at", detail: "B68 原因<&>" },
    { code: "indexing", detail: "" },
    { code: "indexing", detail: "" },
  ],
};
