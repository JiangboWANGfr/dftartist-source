// Independent positive consumer / 20 negative inputs, DESIGN 6.29; not A's consumer.
import { LayoutService, LayoutError } from "@B/layout";
import type {
  LayoutProjection,
  LayoutState,
  LayoutResult,
  LayoutTaskId,
  LayoutDirection,
  LayoutPortSide,
} from "@B/layout";
import type { GraphSession, GraphSessionId, GraphNodeId, GraphEdgeId } from "@hier/viewmodel";
declare const graph: GraphSession, sessionId: GraphSessionId, node: GraphNodeId, edge: GraphEdgeId;
declare const workerFactory: () => Worker, result: LayoutResult, state: LayoutState;
const service = new LayoutService(graph, { workerFactory, timeoutMs: 123 });
const projection: LayoutProjection = {
  sessionId,
  graphRevision: 0,
  direction: "LEFT",
  nodes: [
    { id: node, width: 2, height: 3, ports: [{ key: "尾", width: 0, height: 0, side: "EAST" }] },
  ],
  edges: [{ id: edge, fromPort: "尾" }],
};
const command: Promise<void> = service.layout(projection);
const retry: Promise<void> = service.retry(),
  cancel: Promise<void> = service.cancel();
const unsubscribe: () => void = service.subscribe(() => {});
const release: void = service.dispose();
if (state.status === "success") {
  const r: LayoutResult = state.result;
  const task: LayoutTaskId = state.request.taskId;
  void [r, task];
}
if (state.status === "failed" || state.status === "cancelled") {
  const origin: "layout_service" = state.error.origin;
  void origin;
}
const failure = new LayoutError("stale_graph", "B known error");
void [command, retry, cancel, unsubscribe, release, failure, result];
// @ts-expect-error T01: service binds a graph, never an SDK/string
new LayoutService("wrong", { workerFactory, timeoutMs: 1 });
// @ts-expect-error T02: host deadline is required
new LayoutService(graph, { workerFactory });
// @ts-expect-error T03: fresh native Worker factory, not Worker instance
new LayoutService(graph, { workerFactory: new Worker("x"), timeoutMs: 1 });
// @ts-expect-error T04: opaque graph-session ID is not an arbitrary string
const badSession: GraphSessionId = "user-chosen";
// @ts-expect-error T05: graph nodes and edges have different brands
const wrongNode: GraphNodeId = edge;
// @ts-expect-error T06: task identity is service-issued
const task: LayoutTaskId = "task-1";
// @ts-expect-error T07: direction is finite, no default AUTO
const direction: LayoutDirection = "AUTO";
// @ts-expect-error T08: display anchor side is finite
const side: LayoutPortSide = "AUTO";
// @ts-expect-error T09: no caller-provided task identity or ELK option dictionary
service.layout({ ...projection, taskId: task });
// @ts-expect-error T10: explicitly undefined optional port is not omission
const optional: LayoutProjection = { ...projection, edges: [{ id: edge, fromPort: undefined }] };
// @ts-expect-error T11: scalar node dimensions are required
const dimensions: LayoutProjection = { ...projection, nodes: [{ id: node, ports: [] }] };
// @ts-expect-error T12: projections do not accept new semantic endpoints
const endpoints: LayoutProjection = { ...projection, edges: [{ id: edge, from: node }] };
// @ts-expect-error T13: public result is read-only
result.width = 3;
// @ts-expect-error T14: result members cannot be appended
result.nodes.push({ id: node, x: 0, y: 0, width: 1, height: 1, ports: [] });
// @ts-expect-error T15: points are recursively read-only
result.edges[0]!.sections[0]![0]!.x = 1;
// @ts-expect-error T16: disposed/idle state cannot promise a non-null request
const request: NonNullable<LayoutState["request"]> = state.request;
// @ts-expect-error T17: layout result does not contain a duplicated Core fact DTO
const fact = result.edges[0]!.fact;
// @ts-expect-error T18: mutations have a void Promise, not a result payload
const payload: Promise<LayoutResult> = service.layout(projection);
// @ts-expect-error T19: synchronous release does not have a promise API
const released: Promise<void> = service.dispose();
// @ts-expect-error T20: error codes are stable finite values
new LayoutError("network_magic", "invalid code");
void [
  badSession,
  wrongNode,
  direction,
  side,
  optional,
  dimensions,
  endpoints,
  request,
  fact,
  payload,
  released,
];
