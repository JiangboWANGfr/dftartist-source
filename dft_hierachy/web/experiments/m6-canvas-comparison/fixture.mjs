// Handwritten display experiment, not a Core-authentication fixture or B oracle.
export const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  snapshotId: "A-canvas-comparison",
  inputHash: "0123456789abcdef".repeat(4),
  inputHashComplete: true,
  frontend: { name: "slang", version: "controlled-display-input" },
  bodySharing: "fast",
  tops: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "building",
  openedAt: "2000-02-29T23:59:59.123Z",
  topCandidates: [],
};
const node = (id) => ({
  kind: "design",
  value: {
    id,
    kind: "slice",
    point: {
      slice: { ref: `signal-${id}`, bits: { lsb: 0, width: 8 } },
    },
  },
});
const edge = (id, from, to, lsb = 0, width = 8) => ({
  kind: "design",
  value: {
    id,
    fact: `fact-${id}`,
    from,
    to,
    via: "process-stage",
    kind: "dependency",
    role: "data",
    precision: "exact",
    align: "bitwise",
    fromBits: { lsb, width },
    toBits: { lsb, width },
    map: [{ from: lsb, to: lsb, width }],
  },
});
const fragment = (nodes, edges) => ({
  snapshotId: snapshot.snapshotId,
  nodes: nodes.map(node),
  edges,
  completeness: { status: "complete", reasons: [] },
  frontier: [],
  hasConservative: false,
});
export const fragments = {
  a: fragment(
    ["x", "y", "z"],
    [edge("xy-low", "x", "y", 0, 4), edge("xy-high", "x", "y", 4, 4), edge("yz", "y", "z")],
  ),
  b: fragment(["x", "b"], [edge("xb", "x", "b")]),
  trace: fragment(["b", "t"], [edge("bt", "b", "t")]),
  replacement: fragment(["x", "z"], [edge("xz", "x", "z")]),
};
export const groups = {
  hierarchy: { key: "stage", nodes: ["y", "z"] },
  bus: { key: "xy-byte", edges: ["xy-low", "xy-high"] },
};
