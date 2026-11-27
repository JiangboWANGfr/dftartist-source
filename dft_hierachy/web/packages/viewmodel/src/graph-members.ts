import { GraphSessionError } from "./graph-types.js";
import type {
  GraphSessionId,
  GraphSourceId,
  GraphNodeId,
  GraphEdgeId,
  GraphFragment,
  GraphSessionState,
  GraphSourceContent,
  GraphNodeMember,
  GraphEdgeMember,
  GraphNodeKey,
} from "./graph-types.js";

function sameJSON(a: unknown, b: unknown): boolean {
  const pending: [unknown, unknown][] = [[a, b]];
  // Owned JSON may share acyclic subgraphs. Compare each object pair once,
  // not each path to it; a single left object can still have distinct right
  // counterparts whose fields must all be checked. Nothing survives this call.
  const compared = new WeakMap<object, WeakSet<object>>();
  while (pending.length) {
    const [left, right] = pending.pop()!;
    if (left === right) continue;
    if (
      left === null ||
      right === null ||
      typeof left !== "object" ||
      typeof right !== "object" ||
      Array.isArray(left) !== Array.isArray(right)
    )
      return false;
    let counterparts = compared.get(left);
    if (counterparts?.has(right)) continue;
    if (!counterparts) {
      counterparts = new WeakSet<object>();
      compared.set(left, counterparts);
    }
    counterparts.add(right);
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) return false;
      pending.push([
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ]);
    }
  }
  return true;
}
function nodeId(session: GraphSessionId, source: GraphSourceId, key: GraphNodeKey): GraphNodeId {
  return JSON.stringify(
    key.kind === "design"
      ? [session, "node", "design", key.id]
      : [session, "node", "external", source, key.key],
  ) as GraphNodeId;
}
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The published union is the only retained graph fact store. Build a complete
 * replacement off to the side; source content holds only IDs and metadata. */
export function replaceGraphMembers(
  state: GraphSessionState,
  source: GraphSourceId,
  fragment: GraphFragment | null,
  revision: number,
  order: (id: GraphSourceId) => bigint,
): Pick<GraphSessionState, "nodes" | "edges"> & { content: GraphSourceContent | null } {
  const nodes = new Map<GraphNodeId, GraphNodeMember>();
  const edges = new Map<GraphEdgeId, GraphEdgeMember>();
  for (const node of state.nodes) {
    const owners = node.owners.filter((owner) => owner !== source);
    if (owners.length)
      nodes.set(node.id, Object.freeze({ ...node, owners: Object.freeze(owners) }));
  }
  for (const edge of state.edges) {
    const owners = edge.owners.filter((owner) => owner !== source);
    if (owners.length)
      edges.set(edge.id, Object.freeze({ ...edge, owners: Object.freeze(owners) }));
  }
  const owners = (previous: readonly GraphSourceId[] | undefined): readonly GraphSourceId[] =>
    Object.freeze([...(previous ?? []), source].sort((a, b) => (order(a) < order(b) ? -1 : 1)));
  for (const node of fragment?.nodes ?? []) {
    const id = nodeId(
      state.sessionId,
      source,
      node.kind === "design" ? { kind: "design", id: node.value.id } : node,
    );
    const old = nodes.get(id);
    if (old && !sameJSON(old.node, node))
      throw new GraphSessionError("conflicting_fact", "Graph sources disagree on a canonical node");
    nodes.set(id, Object.freeze({ id, node: old?.node ?? node, owners: owners(old?.owners) }));
  }
  for (const edge of fragment?.edges ?? []) {
    const id = JSON.stringify(
      edge.kind === "design"
        ? [state.sessionId, "edge", "design", edge.value.id]
        : [state.sessionId, "edge", "external", source, edge.key],
    ) as GraphEdgeId;
    const old = edges.get(id);
    if (old && !sameJSON(old.edge, edge))
      throw new GraphSessionError("conflicting_fact", "Graph sources disagree on a canonical edge");
    const from = nodeId(
      state.sessionId,
      source,
      edge.kind === "design" ? { kind: "design", id: edge.value.from } : edge.from.node,
    );
    const to = nodeId(
      state.sessionId,
      source,
      edge.kind === "design" ? { kind: "design", id: edge.value.to } : edge.to.node,
    );
    edges.set(
      id,
      Object.freeze({ id, edge: old?.edge ?? edge, from, to, owners: owners(old?.owners) }),
    );
  }
  const sort = (
    a: GraphNodeMember | GraphEdgeMember,
    b: GraphNodeMember | GraphEdgeMember,
  ): number => {
    const x = "node" in a ? a.node : a.edge;
    const y = "node" in b ? b.node : b.edge;
    if (x.kind === "design") return y.kind === "design" ? compare(x.value.id, y.value.id) : -1;
    if (y.kind === "design") return 1;
    const first = order(a.owners[0]!),
      second = order(b.owners[0]!);
    return first === second ? compare(x.key, y.key) : first < second ? -1 : 1;
  };
  const nodeList = Object.freeze([...nodes.values()].sort(sort));
  const edgeList = Object.freeze([...edges.values()].sort(sort));
  return {
    nodes: nodeList,
    edges: edgeList,
    content:
      fragment === null
        ? null
        : Object.freeze({
            sourceRevision: revision,
            nodes: Object.freeze(
              nodeList.filter((node) => node.owners.includes(source)).map((node) => node.id),
            ),
            edges: Object.freeze(
              edgeList.filter((edge) => edge.owners.includes(source)).map((edge) => edge.id),
            ),
            completeness: fragment.completeness,
            frontier: fragment.frontier,
            hasConservative: fragment.hasConservative,
          }),
  };
}
