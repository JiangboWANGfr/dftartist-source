import { GraphSession } from "./graph-session.js";
import { SelectionModel } from "./selection-model.js";
import type { GraphSessionState, GraphNodeMember, GraphEdgeMember } from "./graph-types.js";
import {
  normalized,
  nodeItems,
  edgeItems,
  nodeLabel,
  edgeLabel,
} from "./graph-member-projection.js";
import { readFoldOptions, readFoldTarget } from "./fold-projection-input.js";
import { FoldProjectionError } from "./fold-projection-types.js";
import type {
  FoldProjectionErrorCode,
  FoldProjectionId,
  DisplayNodeId,
  DisplayEdgeId,
  GraphFoldOptions,
  HierarchyFoldGroup,
  BusFoldGroup,
  FoldedGraphNode,
  FoldedGraphEdge,
  FoldedGraphTarget,
} from "./fold-projection-types.js";

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
const failure = (code: FoldProjectionErrorCode) =>
  new FoldProjectionError(code, `Fold projection: ${code}`);
const projections = new WeakSet<FoldedGraphProjection>();
const constructionToken = Symbol("FoldedGraphProjection factory");
let nextProjection = 0n;
interface ProjectionData {
  id: FoldProjectionId;
  state: GraphSessionState;
  options: GraphFoldOptions;
  nodes: readonly FoldedGraphNode[];
  edges: readonly FoldedGraphEdge[];
}
let publish: (data: ProjectionData) => FoldedGraphProjection;

/** Immutable display topology. Borrows frozen facts; owns no models or resources. */
export class FoldedGraphProjection {
  declare private readonly __foldProjectionBrand: void;
  /** Genuine factory products only; no property access on untrusted receivers. */
  static [Symbol.hasInstance](value: unknown): boolean {
    return projections.has(value as FoldedGraphProjection);
  }
  readonly id: FoldProjectionId;
  readonly state: GraphSessionState;
  readonly options: GraphFoldOptions;
  readonly nodes: readonly FoldedGraphNode[];
  readonly edges: readonly FoldedGraphEdge[];

  private constructor(token: symbol, data: ProjectionData) {
    if (token !== constructionToken) throw failure("invalid_argument");
    this.id = data.id;
    this.state = data.state;
    this.options = data.options;
    this.nodes = data.nodes;
    this.edges = data.edges;
    projections.add(this);
    Object.freeze(this);
  }
  static {
    // Keep construction private in both emitted JS and the public declaration.
    publish = (data) => new FoldedGraphProjection(constructionToken, data);
  }
}

interface NodeDraft {
  id: DisplayNodeId;
  group: HierarchyFoldGroup | undefined;
  members: GraphNodeMember[];
  internalEdges: GraphEdgeMember[];
}
interface EdgeDraft {
  group: BusFoldGroup | undefined;
  from: DisplayNodeId;
  to: DisplayNodeId;
  members: GraphEdgeMember[];
}

/** State/session-derived identities need no history cache or retained graph handle. */
function displayId(state: GraphSessionState, kind: string, ...parts: string[]): string {
  return JSON.stringify(["fold", state.sessionId, kind, ...parts]);
}

export function createFoldedGraphProjection(
  graph: GraphSession,
  options: GraphFoldOptions,
): FoldedGraphProjection {
  let state: GraphSessionState, disposed: boolean;
  try {
    state = graphState.call(graph) as GraphSessionState;
    disposed = graphDisposed.call(graph) as boolean;
  } catch {
    throw failure("invalid_argument");
  }
  if (disposed) throw failure("disposed");
  const guard = () => {
    if (graphDisposed.call(graph)) throw failure("disposed");
    if (graphState.call(graph) !== state) throw failure("stale_graph");
  };
  const owned = readFoldOptions(options, state, guard);
  const collapsed = new Set(owned.collapsed);
  const representatives = new Map<string, HierarchyFoldGroup>();
  const buses = new Map<string, BusFoldGroup>();
  for (const group of owned.groups) {
    if (!collapsed.has(group.key)) continue;
    if (group.kind === "hierarchy") {
      for (const id of group.nodes) {
        const previous = representatives.get(id);
        if (!previous || previous.nodes.length < group.nodes.length) representatives.set(id, group);
      }
    } else {
      for (const id of group.edges) buses.set(id, group);
    }
  }

  // Insertion order is the first original member's state order, not option order.
  const nodes = new Map<DisplayNodeId, NodeDraft>();
  const originalNodes = new Map<string, NodeDraft>();
  const originalItems = new Map(
    state.nodes.map((member) => [member.id as string, nodeItems(member)]),
  );
  for (const member of state.nodes) {
    const group = representatives.get(member.id);
    const id = (
      group ? displayId(state, "hierarchy", group.key) : displayId(state, "node", member.id)
    ) as DisplayNodeId;
    let draft = nodes.get(id);
    if (!draft) {
      draft = { id, group, members: [], internalEdges: [] };
      nodes.set(id, draft);
    }
    draft.members.push(member);
    originalNodes.set(member.id, draft);
  }
  const edges = new Map<string, EdgeDraft>();
  for (const member of state.edges) {
    const from = originalNodes.get(member.from)!;
    const to = originalNodes.get(member.to)!;
    if (from === to && from.group) {
      from.internalEdges.push(member);
      continue;
    }
    const group = buses.get(member.id);
    const key = group
      ? displayId(state, "bus", group.key, from.id, to.id)
      : displayId(state, "edge", member.id);
    let draft = edges.get(key);
    if (!draft) {
      draft = { group, from: from.id, to: to.id, members: [] };
      edges.set(key, draft);
    }
    draft.members.push(member);
  }

  const id = `fold:${++nextProjection}` as FoldProjectionId;
  const shownNodes = Array.from(nodes.values(), (draft): FoldedGraphNode => {
    const first = draft.members[0]!;
    const base = {
      target: Object.freeze({ projectionId: id, kind: "node" as const, id: draft.id }),
      label: draft.group ? draft.group.label : nodeLabel(first),
      items: normalized(
        draft.members.flatMap((member) => originalItems.get(member.id)!),
        state,
      ),
      internalEdges: Object.freeze(draft.internalEdges),
    };
    return draft.group
      ? Object.freeze({
          ...base,
          kind: "hierarchy",
          groupKey: draft.group.key,
          members: Object.freeze(draft.members),
        })
      : Object.freeze({ ...base, kind: "member", members: Object.freeze([first] as const) });
  });
  const shownEdges = Array.from(edges.values(), (draft): FoldedGraphEdge => {
    const first = draft.members[0]!;
    const group = draft.members.length >= 2 ? draft.group : undefined;
    const edgeId = (
      group
        ? displayId(state, "bus", group.key, draft.from, draft.to)
        : displayId(state, "edge", first.id)
    ) as DisplayEdgeId;
    const base = {
      target: Object.freeze({ projectionId: id, kind: "edge" as const, id: edgeId }),
      label: group ? group.label : edgeLabel(first),
      from: draft.from,
      to: draft.to,
      items: normalized(
        draft.members.flatMap((member) => edgeItems(member, originalItems)),
        state,
      ),
    };
    return group
      ? Object.freeze({
          ...base,
          kind: "bus",
          groupKey: group.key,
          members: Object.freeze(draft.members),
        })
      : Object.freeze({ ...base, kind: "member", members: Object.freeze([first] as const) });
  });
  return publish({
    id,
    state,
    options: owned,
    nodes: Object.freeze(shownNodes),
    edges: Object.freeze(shownEdges),
  });
}

export function selectFoldedGraphElement(
  graph: GraphSession,
  selection: SelectionModel,
  projection: FoldedGraphProjection,
  target: FoldedGraphTarget,
): void {
  let state: GraphSessionState, disposed: boolean, snapshot: unknown;
  // All three brands are checked before reading any target property.
  try {
    state = graphState.call(graph) as GraphSessionState;
    const graphIsDisposed = graphDisposed.call(graph) as boolean;
    const selectionIsDisposed = selectionDisposed.call(selection) as boolean;
    snapshot = selectionSnapshot.call(selection);
    disposed = graphIsDisposed || selectionIsDisposed;
  } catch {
    throw failure("invalid_argument");
  }
  if (!projections.has(projection)) throw failure("invalid_argument");
  if (disposed) throw failure("disposed");
  if (snapshot === undefined || snapshot !== state.snapshotId) throw failure("snapshot_mismatch");
  if (projection.state !== state) throw failure("stale_graph");
  const guard = () => {
    if (graphDisposed.call(graph) || selectionDisposed.call(selection)) throw failure("disposed");
    if (graphState.call(graph) !== state) throw failure("stale_graph");
  };
  const owned = readFoldTarget(target, guard);
  if (owned.projectionId !== projection.id) throw failure("stale_graph");
  const descriptor =
    owned.kind === "node"
      ? projection.nodes.find((node) => node.target.id === owned.id)
      : projection.edges.find((edge) => edge.target.id === owned.id);
  if (!descriptor) throw failure("invalid_argument");
  if (!descriptor.items.length) throw failure("not_selectable");
  guard();
  selection.select({ snapshotId: state.snapshotId, origin: "graph", items: descriptor.items });
}
