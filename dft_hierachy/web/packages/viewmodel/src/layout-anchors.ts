import type { LayoutDirection, LayoutPortInput, LayoutPortSide } from "./layout-types.js";

/** Default display anchors for either original or folded identities; no semantic facts. */
export function createLayoutAnchors<NodeId extends string, EdgeId extends string>(
  nodes: readonly { readonly id: NodeId }[],
  edges: readonly { readonly id: EdgeId; readonly from: NodeId; readonly to: NodeId }[],
  direction: LayoutDirection,
) {
  const sides: Record<LayoutDirection, readonly [LayoutPortSide, LayoutPortSide]> = {
    RIGHT: ["EAST", "WEST"],
    LEFT: ["WEST", "EAST"],
    DOWN: ["SOUTH", "NORTH"],
    UP: ["NORTH", "SOUTH"],
  };
  const ports = new Map(nodes.map((n) => [n.id, [] as LayoutPortInput[]]));
  const layoutEdges = edges.map((edge) => {
    const fromPort = JSON.stringify(["edge", edge.id, "from"]);
    const toPort = JSON.stringify(["edge", edge.id, "to"]);
    ports
      .get(edge.from)!
      .push(Object.freeze({ key: fromPort, width: 6, height: 6, side: sides[direction][0] }));
    ports
      .get(edge.to)!
      .push(Object.freeze({ key: toPort, width: 6, height: 6, side: sides[direction][1] }));
    return Object.freeze({ id: edge.id, fromPort, toPort });
  });
  const vertical = direction === "DOWN" || direction === "UP";
  const layoutNodes = nodes.map((node) => {
    const anchors = ports.get(node.id)!;
    const counts = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
    for (const p of anchors) counts[p.side]++;
    const extent = 16 * (Math.max(...Object.values(counts)) + 1);
    return Object.freeze({
      id: node.id,
      width: vertical ? Math.max(160, extent) : 160,
      height: vertical ? 64 : Math.max(64, extent),
      ports: Object.freeze(anchors),
    });
  });
  return Object.freeze({
    direction,
    nodes: Object.freeze(layoutNodes),
    edges: Object.freeze(layoutEdges),
  });
}
