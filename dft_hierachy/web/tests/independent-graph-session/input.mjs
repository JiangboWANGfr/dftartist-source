// Handwritten controlled DTOs; not a Core-authentication oracle. DESIGN 6.28.
export const complete = () => ({ status: "complete", reasons: [] });
export const node = (id, ref = id, bits = { lsb: 0, width: 1 }, side) => ({
  kind: "design",
  value: { id, kind: "slice", point: { slice: { ref, bits }, ...(side ? { side } : {}) } },
});
export const X = () => node("B-x", "B-signal-x");
export const Y = () => node("B-y", "B-signal-y");
export const Z = () => node("B-z", "B-signal-z");
export const edge = (id = "B-edge", fact = "B-fact") => ({
  kind: "design",
  value: {
    id,
    fact,
    from: "B-x",
    to: "B-y",
    via: "B-proc",
    kind: "dependency",
    role: "data",
    precision: "exact",
    align: "bitwise",
    fromBits: { lsb: 0, width: 1 },
    toBits: { lsb: 0, width: 1 },
    map: [{ from: 0, to: 0, width: 1 }],
  },
});
export const external = (key = "node1", label = "同名", extra = {}) => ({
  kind: "external",
  key,
  label,
  ports: [],
  ...extra,
});
export const fragment = (c, nodes = [], edges = [], extra = {}) => ({
  snapshotId: c.client.snapshot.snapshotId,
  nodes,
  edges,
  completeness: complete(),
  frontier: [],
  hasConservative: false,
  ...extra,
});
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
