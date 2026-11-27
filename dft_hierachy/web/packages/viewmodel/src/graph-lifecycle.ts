import type { GraphSession } from "./graph-session.js";
import type { GraphSessionState, GraphNodeMember, GraphEdgeMember } from "./graph-types.js";

/** Internal two-phase binding. prepare never calls host code; flush may clean up
 * resources and notify. All bindings prepare before any flush can run. */
export interface GraphBinding {
  prepare(state: GraphSessionState, disposed: boolean): () => unknown[];
}
interface BindingData {
  bindings: Set<GraphBinding>;
  state: GraphSessionState | undefined;
  nodes: Map<string, GraphNodeMember> | undefined;
  edges: Map<string, GraphEdgeMember> | undefined;
}
const bindings = new WeakMap<GraphSession, BindingData>();
function clearMembers(data: BindingData): void {
  data.state = undefined;
  data.nodes = undefined;
  data.edges = undefined;
}
function currentMembers(graph: GraphSession, state: GraphSessionState): BindingData {
  const data = bindings.get(graph)!;
  if (data.state !== state) {
    clearMembers(data);
    data.state = state;
  }
  return data;
}
/** Internal lookups after the caller's brand/current-state checks, never a history cache. */
export function graphNodeMember(
  graph: GraphSession, state: GraphSessionState, id: string,
): GraphNodeMember | undefined {
  const data = currentMembers(graph, state);
  data.nodes ??= new Map(state.nodes.map((member) => [member.id, member]));
  return data.nodes.get(id);
}
export function graphEdgeMember(
  graph: GraphSession, state: GraphSessionState, id: string,
): GraphEdgeMember | undefined {
  const data = currentMembers(graph, state);
  data.edges ??= new Map(state.edges.map((member) => [member.id, member]));
  return data.edges.get(id);
}
export function initializeGraphBindings(graph: GraphSession): void {
  bindings.set(graph, { bindings: new Set(), state: undefined, nodes: undefined, edges: undefined });
}
export function hasGraphBindings(value: unknown): value is GraphSession {
  return typeof value === "object" && value !== null && bindings.has(value as GraphSession);
}
export function bindGraph(graph: GraphSession, binding: GraphBinding): () => void {
  const owned = bindings.get(graph)!.bindings;
  owned.add(binding);
  return () => {
    owned.delete(binding);
  };
}
export function prepareGraphBindings(graph: GraphSession, disposed: boolean): () => unknown[] {
  const data = bindings.get(graph)!;
  // Revoke old member references before any external prepare/cleanup/notification.
  clearMembers(data);
  const owned = data.bindings;
  const flushes = [...owned].map((binding) => binding.prepare(graph.state, disposed));
  if (disposed) owned.clear();
  return () => {
    const errors: unknown[] = [];
    for (const flush of flushes) {
      try {
        errors.push(...flush());
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  };
}
