import { createElement } from "react";
import { LayoutService } from "@B/layout";
import { SchematicView } from "@B/view";
import type { FoldedLayoutIdentity, FoldedLayoutResult, FoldedLayoutState } from "@B/layout";
import type {
  SchematicViewProps,
  FoldedSchematicViewProps,
  FoldedSchematicViewFailure,
} from "@B/view";
import type {
  GraphSession,
  SelectionModel,
  FoldedGraphProjection,
  GraphFoldOptions,
  LayoutProjection,
  LayoutResult,
  GraphNodeId,
  GraphEdgeId,
} from "@hier/viewmodel";
import type { SchematicViewFailure } from "@hier/views";
declare const graph: GraphSession,
  selection: SelectionModel,
  p: FoldedGraphProjection,
  original: LayoutProjection;
declare const workerFactory: () => Worker, result: FoldedLayoutResult, state: FoldedLayoutState;
const old = new LayoutService(graph, { workerFactory, timeoutMs: 1000 });
const service = new LayoutService<"folded">(graph, { workerFactory, timeoutMs: 1000 }, "folded");
const mode: "folded" = service.mode,
  oldMode: "graph" = old.mode;
const command: Promise<void> = service.layout(p),
  again: Promise<void> = service.layout(p, undefined),
  dir: Promise<void> = service.layout(p, "DOWN");
old.layout(original);
const change = (_options: GraphFoldOptions): void => {};
const oldProps: SchematicViewProps = {
  graph,
  selection,
  layout: old,
  ariaLabel: "B old",
  height: 100,
};
const foldedProps: FoldedSchematicViewProps = {
  graph,
  selection,
  layout: service,
  projection: p,
  onFoldChange: change,
  ariaLabel: "B fold",
  height: 100,
};
SchematicView(oldProps);
createElement(SchematicView, oldProps);
SchematicView(foldedProps);
createElement(SchematicView, foldedProps);
const wrong = { ...oldProps, projection: p, onFoldChange: change };
declare const failure: FoldedSchematicViewFailure;
if (failure.command === "select") {
  const id: FoldedLayoutIdentity = failure.layoutIdentity;
  void id;
}
if (failure.command === "fold") {
  const key: string = failure.groupKey,
    collapsed: boolean = failure.collapsed;
  void [key, collapsed];
}
if (state.status === "success") {
  const r: FoldedLayoutResult = state.result;
  const id: FoldedLayoutIdentity = state.request;
  void [r, id];
}
if (state.status === "idle" || state.status === "disposed") {
  const request: null = state.request;
  void request;
}
// @ts-expect-error T01: folded generic requires explicit runtime mode
new LayoutService<"folded">(graph, { workerFactory, timeoutMs: 1000 });
// @ts-expect-error T02: default mode cannot receive a folded third argument
new LayoutService<"graph">(graph, { workerFactory, timeoutMs: 1000 }, "folded");
// @ts-expect-error T03: folded mode cannot be explicit undefined
new LayoutService<"folded">(graph, { workerFactory, timeoutMs: 1000 }, undefined);
// @ts-expect-error T04: options do not contain an extra mode field
new LayoutService<"folded">(graph, { workerFactory, timeoutMs: 1000, mode: "folded" }, "folded");
// @ts-expect-error T05: original mode rejects display projection
old.layout(p);
// @ts-expect-error T06: folded mode rejects original projection input
service.layout(original);
// @ts-expect-error T07: finite optional direction
service.layout(p, "AUTO");
// @ts-expect-error T08: display node identity is not original Graph node
const node: GraphNodeId = result.nodes[0]!.id;
// @ts-expect-error T09: display edge identity is not original Graph edge
const edge: GraphEdgeId = result.edges[0]!.id;
// @ts-expect-error T10: display endpoint cannot be an original Graph node ID
const endpoint: GraphNodeId = result.edges[0]!.from;
// @ts-expect-error T11: captured projection identity is readonly
result.projectionId = p.id;
// @ts-expect-error T12: display member arrays are readonly
result.nodes.push(result.nodes[0]!);
// @ts-expect-error T13: projection identity lives in request/result, not state top level
const top = state.projectionId;
// @ts-expect-error T14: controlled callback required for folded Props
const missing: FoldedSchematicViewProps = {
  graph,
  selection,
  layout: service,
  projection: p,
  ariaLabel: "B",
  height: 100,
};
// @ts-expect-error T15: direct mixed graph-mode service/complete folded fields rejected
SchematicView({ ...oldProps, projection: p, onFoldChange: change });
// @ts-expect-error T16: direct spread cannot hide missing callback and wrong mode
SchematicView({ ...oldProps, projection: p });
// @ts-expect-error T17: variable cannot bypass branch exclusivity
SchematicView(wrong);
// @ts-expect-error T18: React entry cannot hide missing callback/wrong mode
createElement(SchematicView, { ...oldProps, projection: p });
// @ts-expect-error T19: React variable cannot bypass branch exclusivity
createElement(SchematicView, wrong);
// @ts-expect-error T20: select feedback needs full layout identity
const selectFailure: FoldedSchematicViewFailure = {
  command: "select",
  sessionId: p.state.sessionId,
  graphRevision: p.state.revision,
  projectionId: p.id,
  error: 0,
  target: p.nodes[0]!.target,
};
// @ts-expect-error T21: fold feedback cannot masquerade as a hit target
const foldFailure: FoldedSchematicViewFailure = {
  command: "fold",
  sessionId: p.state.sessionId,
  graphRevision: p.state.revision,
  projectionId: p.id,
  error: 0,
  groupKey: "H",
  collapsed: true,
  target: p.nodes[0]!.target,
};
// @ts-expect-error T22: old command failure union is not expanded with fold
const oldFailure: SchematicViewFailure["command"] = "fold";
// @ts-expect-error T23: folded result cannot widen old Graph identity result
const oldResult: LayoutResult = result;
// @ts-expect-error T24: command promises do not resolve to geometry payload
const payload: Promise<FoldedLayoutResult> = service.layout(p);
void [
  mode,
  oldMode,
  command,
  again,
  dir,
  node,
  edge,
  endpoint,
  top,
  missing,
  selectFailure,
  foldFailure,
  oldFailure,
  oldResult,
  payload,
];
