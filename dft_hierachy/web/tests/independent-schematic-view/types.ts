import type { ReactElement } from "react";
import { createGraphProjection, selectGraphElement, GraphProjectionError } from "@B/projection";
import type { GraphElementTarget, GraphProjection } from "@B/projection";
import { SchematicView } from "@B/view";
import type { SchematicViewProps, SchematicViewFailure, SchematicViewCommand } from "@B/view";
import type {
  GraphSession,
  SelectionModel,
  LayoutService,
  GraphNodeId,
  GraphEdgeId,
  GraphSessionId,
} from "@hier/viewmodel";
declare const graph: GraphSession,
  selection: SelectionModel,
  layout: LayoutService,
  node: GraphNodeId,
  edge: GraphEdgeId,
  sessionId: GraphSessionId;
const target: GraphElementTarget = { sessionId, graphRevision: 1, kind: "node", id: node };
const projection: GraphProjection = createGraphProjection(graph, "UP");
selectGraphElement(graph, selection, target);
const props: SchematicViewProps = {
  graph,
  selection,
  layout,
  ariaLabel: "B graph",
  height: 240,
  onCommandError(f: SchematicViewFailure) {
    const raw: unknown = f.error;
    if (f.command === "select") {
      const t: GraphElementTarget = f.target;
      const task: string = f.layoutIdentity.taskId;
      void [t, task];
    } else {
      const t: undefined = f.target;
      void t;
    }
    void raw;
  },
};
const rendered: ReactElement = SchematicView(props);
const commands: readonly SchematicViewCommand[] = ["layout", "retry", "cancel", "select"];
const error = new GraphProjectionError("not_selectable", "no object");
void [rendered, commands, error];
// @ts-expect-error T01: actual GraphSession required
createGraphProjection({});
// @ts-expect-error T02: exact direction enum
createGraphProjection(graph, "diagonal");
// @ts-expect-error T03: selection model required
selectGraphElement(graph, {}, target);
// @ts-expect-error T04: target captures revision
selectGraphElement(graph, selection, { sessionId, kind: "node", id: node });
// @ts-expect-error T05: node and edge brands distinct
const mixed: GraphElementTarget = { sessionId, graphRevision: 0, kind: "node", id: edge };
// @ts-expect-error T06: target discriminator precise
selectGraphElement(graph, selection, { sessionId, graphRevision: 0, kind: "source", id: node });
// @ts-expect-error T07: frozen original graph state
projection.state.nodes.push(projection.state.nodes[0]!);
// @ts-expect-error T08: immutable projected member
projection.nodes[0]!.member.owners = [];
// @ts-expect-error T09: immutable selection items
projection.nodes[0]!.items[0]!.ref = "other";
// @ts-expect-error T10: geometry has no semantic fact
projection.layout.edges[0]!.fact;
// @ts-expect-error T11: layout must be supplied
SchematicView({ graph, selection, ariaLabel: "graph", height: 200 });
// @ts-expect-error T12: no factory injection in view
SchematicView({ ...props, workerFactory: () => new Worker("bad") });
// @ts-expect-error T13: required accessible name
SchematicView({ graph, selection, layout, height: 200 });
// @ts-expect-error T14: height numeric
SchematicView({ ...props, height: "200" });
// @ts-expect-error T15: optional prop absent differs from explicit undefined
SchematicView({ ...props, direction: undefined });
// @ts-expect-error T16: select failure must carry target and layout identity
const failure: SchematicViewFailure = {
  command: "select",
  sessionId,
  graphRevision: 0,
  error: null,
};
declare const f: SchematicViewFailure;
// @ts-expect-error T17: thrown value remains unknown
f.error.message;
// @ts-expect-error T18: stable failure command
const command: SchematicViewCommand = "clear";
// @ts-expect-error T19: stable projection error codes
new GraphProjectionError("layout_failure", "wrong layer");
// @ts-expect-error T20: target forbids arbitrary semantic fields
selectGraphElement(graph, selection, { ...target, fact: "fake" });
void [mixed, failure, command];
