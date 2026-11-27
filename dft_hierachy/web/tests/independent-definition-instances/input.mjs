// Independent Schema-valid opaque refs deliberately do not encode their address kind.
export const Q = Object.freeze({
  snapshotId: "B64-instances-快照",
  def: "B64:not-an-object-prefix",
});
export const complete = Object.freeze({ status: "complete", reasons: [] });
export const partial = Object.freeze({
  status: "partial",
  reasons: [
    { code: "indexing", at: "B64:at", detail: "原不完整" },
    { code: "indexing", detail: "重复" },
  ],
  B_meta: { v: 7 },
});
export const instKinds = Object.freeze([
  "module",
  "interface",
  "program",
  "blackbox",
  "primitive",
]);
export const item = (n = 0, kind = "module") => ({
  ref: "D:actually-instance/" + n,
  name: n < 2 ? "same" : "u" + n,
  path: ["B64-top", "gen[" + n + "]", "same"],
  pathText: "opaque.display." + n,
  kind,
  def: Q.def,
  defName: "leaf",
  childCount: 0,
  hasParamOverrides: false,
  B_inst: { n },
});
export const page = (items = [item()], next) => ({
  items,
  ...(next === undefined ? {} : { next }),
  B_page: { kept: ["尾", 7] },
});
