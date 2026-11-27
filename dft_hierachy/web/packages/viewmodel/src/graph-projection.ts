import { GraphSession } from "./graph-session.js";
import { SelectionModel } from "./selection-model.js";
import {
  normalized,
  nodeItems,
  edgeItems,
  nodeLabel,
  edgeLabel,
} from "./graph-member-projection.js";
import { GraphProjectionError } from "./graph-projection-types.js";
import type {
  GraphElementTarget,
  GraphProjection,
  GraphProjectionErrorCode,
} from "./graph-projection-types.js";
import type { GraphSessionState } from "./graph-types.js";
import type { LayoutDirection } from "./layout-types.js";
import { createLayoutAnchors } from "./layout-anchors.js";
import { graphNodeMember, graphEdgeMember } from "./graph-lifecycle.js";
import type { ObjectSelection } from "./selection-types.js";

const graphState = Object.getOwnPropertyDescriptor(GraphSession.prototype, "state")!.get!;
const graphDisposed = Object.getOwnPropertyDescriptor(GraphSession.prototype, "disposed")!.get!;
const selectionDisposed = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "disposed",
)!.get!;
const selectionSnapshot = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "snapshotId",
)!.get!;
const error = (code: GraphProjectionErrorCode) =>
  new GraphProjectionError(code, `Graph projection: ${code}`);
function stateOf(graph: GraphSession): GraphSessionState {
  let state: GraphSessionState, disposed: boolean;
  try {
    state = graphState.call(graph) as GraphSessionState;
    disposed = graphDisposed.call(graph) as boolean;
  } catch {
    throw error("invalid_argument");
  }
  if (disposed) throw error("disposed");
  return state;
}

export function createGraphProjection(
  graph: GraphSession,
  direction: LayoutDirection = "RIGHT",
): GraphProjection {
  const state = stateOf(graph);
  if (!["RIGHT", "DOWN", "LEFT", "UP"].includes(direction)) throw error("invalid_argument");
  const targets = { sessionId: state.sessionId, graphRevision: state.revision };
  const nodes = state.nodes.map((member) => {
    return Object.freeze({
      target: Object.freeze({ ...targets, kind: "node" as const, id: member.id }),
      member,
      label: nodeLabel(member),
      items: normalized(nodeItems(member), state),
    });
  });
  const items = new Map(nodes.map((n) => [n.member.id as string, n.items]));
  const edges = state.edges.map((member) =>
    Object.freeze({
      target: Object.freeze({ ...targets, kind: "edge" as const, id: member.id }),
      member,
      label: edgeLabel(member),
      items: normalized(edgeItems(member, items), state),
    }),
  );
  return Object.freeze({
    state,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    layout: Object.freeze({
      ...targets,
      ...createLayoutAnchors(state.nodes, state.edges, direction),
    }),
  });
}

export function selectGraphElement(
  graph: GraphSession,
  selection: SelectionModel,
  target: GraphElementTarget,
): void {
  // Validate both brands before reading caller input; bypass overridden model getters.
  let state: GraphSessionState, selectionIsDisposed: boolean, snapshot: unknown;
  try {
    state = graphState.call(graph) as GraphSessionState;
    graphDisposed.call(graph);
    selectionIsDisposed = selectionDisposed.call(selection) as boolean;
    snapshot = selectionSnapshot.call(selection);
  } catch {
    throw error("invalid_argument");
  }
  if (graphDisposed.call(graph) || selectionIsDisposed) throw error("disposed");
  if (snapshot === undefined || snapshot !== state.snapshotId) throw error("snapshot_mismatch");
  const guard = () => {
    if (graphDisposed.call(graph) || selectionDisposed.call(selection)) throw error("disposed");
    if ((graphState.call(graph) as GraphSessionState).revision !== state.revision)
      throw error("stale_graph");
  };
  const read = <T>(fn: () => T): T => {
    let value: T;
    try {
      value = fn();
    } catch (cause) {
      let failure = error("invalid_argument");
      try {
        guard();
      } catch (e) {
        failure = e as GraphProjectionError;
      }
      Object.defineProperty(failure, "cause", { value: cause, configurable: true, writable: true });
      throw failure;
    }
    guard();
    return value;
  };
  if (target === null || typeof target !== "object" || read(() => Array.isArray(target)))
    throw error("invalid_argument");
  const proto = read(() => Object.getPrototypeOf(target));
  if (proto !== null && proto !== Object.prototype) throw error("invalid_argument");
  const keys = read(() => Reflect.ownKeys(target));
  const fields = ["sessionId", "graphRevision", "kind", "id"];
  if (keys.length !== 4 || keys.some((k) => typeof k !== "string" || !fields.includes(k)))
    throw error("invalid_argument");
  const owned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of fields) owned[k] = read(() => Reflect.get(target, k));
  if (
    typeof owned.sessionId !== "string" ||
    !owned.sessionId ||
    typeof owned.id !== "string" ||
    !owned.id ||
    typeof owned.graphRevision !== "number" ||
    !Number.isSafeInteger(owned.graphRevision) ||
    owned.graphRevision < 0 ||
    (owned.kind !== "node" && owned.kind !== "edge")
  )
    throw error("invalid_argument");
  if (owned.sessionId !== state.sessionId || owned.graphRevision !== state.revision)
    throw error("stale_graph");
  let items: readonly ObjectSelection[];
  if (owned.kind === "node") {
    const member = graphNodeMember(graph, state, owned.id);
    if (!member) throw error("invalid_argument");
    items = nodeItems(member);
  } else {
    const member = graphEdgeMember(graph, state, owned.id);
    if (!member) throw error("invalid_argument");
    const endpoints = new Map<string, readonly ObjectSelection[]>();
    for (const id of [member.from, member.to]) {
      if (!endpoints.has(id)) endpoints.set(id, nodeItems(graphNodeMember(graph, state, id)!));
    }
    items = edgeItems(member, endpoints);
  }
  if (!items.length) throw error("not_selectable");
  guard();
  selection.select({
    snapshotId: state.snapshotId,
    origin: "graph",
    items: normalized(items, state),
  });
}
