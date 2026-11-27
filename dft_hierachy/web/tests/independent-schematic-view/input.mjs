// B87 handwritten legal DTOs. Not derived from the comparison or a Core query.
import { node, edge, external } from "../independent-graph-session/input.mjs";
export const X = "B-x",
  Y = "B-y";
export const expected = {
  "B-x": [{ ref: "B87:x<&>", bits: { lsb: 2, width: 8 }, side: "inside" }],
  "B-y": [{ ref: "B87:y", bits: { lsb: 0, width: 8 }, side: "outside" }],
  "B-ref": [{ ref: "B87:ref-only" }],
  "B-none": [],
  "B-zero": [{ ref: "B87:zero", bits: { lsb: 0, width: 0 } }],
  "B-both": [{ ref: "B87:point-first", bits: { lsb: 3, width: 2 } }],
};
export function content(snapshotId, { partial = false, empty = false } = {}) {
  const nodes = [
    node(X, "B87:x<&>", { lsb: 2, width: 8 }, "inside"),
    node(Y, "B87:y", { lsb: 0, width: 8 }, "outside"),
    {
      kind: "design",
      value: { id: "B-ref", kind: "process", ref: "B87:ref-only", fact: "B87:process-fact" },
    },
    { kind: "design", value: { id: "B-none", kind: "unresolved", reason: "unknown_pin_width" } },
    node("B-zero", "B87:zero", { lsb: 0, width: 0 }),
    {
      ...node("B-both", "B87:point-first", { lsb: 3, width: 2 }),
      value: {
        ...node("B-both", "B87:point-first", { lsb: 3, width: 2 }).value,
        ref: "B87:must-not-select",
      },
    },
    external("ext", "<img src=x onerror=alert(1)>", {
      ports: [{ key: "pin[3]", label: "opaque port" }],
      target: { ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" },
    }),
    external("no-target", "", { ports: [{ key: "unused", label: "unconnected port" }] }),
  ];
  const low = edge("B-low", "B87:fact-low");
  Object.assign(low.value, {
    fromBits: { lsb: 2, width: 2 },
    toBits: { lsb: 0, width: 2 },
    map: [{ from: 2, to: 0, width: 2 }],
  });
  const high = edge("B-high", "B87:fact-high");
  Object.assign(high.value, {
    fromBits: { lsb: 4, width: 2 },
    toBits: { lsb: 2, width: 2 },
    map: [{ from: 4, to: 2, width: 2 }],
  });
  const self = edge("B-self", "B87:fact-self");
  Object.assign(self.value, {
    from: X,
    to: X,
    fromBits: { lsb: 2, width: 2 },
    toBits: { lsb: 2, width: 2 },
    map: [{ from: 2, to: 2, width: 2 }],
  });
  const no = edge("B-no-bits", "B87:fact-no-bits");
  // Schema7 TraceEdge: only boundary edges omit bits; map is always required.
  Object.assign(no.value, {
    from: "B-none",
    to: "B-ref",
    kind: "boundary",
    align: "none",
    map: [],
  });
  delete no.value.fromBits;
  delete no.value.toBits;
  const edges = [
    low,
    high,
    self,
    no,
    {
      kind: "external",
      key: "external-edge",
      label: "external relation",
      from: { node: { kind: "external", key: "ext" }, port: "pin[3]" },
      to: { node: { kind: "design", id: X } },
    },
  ];
  return {
    snapshotId,
    nodes: empty ? [] : nodes,
    edges: empty ? [] : edges,
    completeness: partial
      ? { status: "partial", reasons: [{ code: "budget_nodes" }] }
      : { status: "complete", reasons: [] },
    frontier: partial
      ? [
          {
            point: { slice: { ref: "B87:frontier", bits: { lsb: 0, width: 1 } }, side: "inside" },
            depth: 2,
            reason: "budget_nodes",
            stepCursor: "B87:opaque-cursor",
          },
        ]
      : [],
    hasConservative: partial,
  };
}
export function edgeItems(id) {
  if (id === "B-low")
    return [
      { ref: "B87:x<&>", bits: { lsb: 2, width: 2 }, side: "inside" },
      { ref: "B87:y", bits: { lsb: 0, width: 2 }, side: "outside" },
    ];
  if (id === "B-high")
    return [
      { ref: "B87:x<&>", bits: { lsb: 4, width: 2 }, side: "inside" },
      { ref: "B87:y", bits: { lsb: 2, width: 2 }, side: "outside" },
    ];
  if (id === "B-self") return [{ ref: "B87:x<&>", bits: { lsb: 2, width: 2 }, side: "inside" }];
  if (id === "B-no-bits") return expected["B-ref"];
  return [{ ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" }, ...expected[X]];
}
