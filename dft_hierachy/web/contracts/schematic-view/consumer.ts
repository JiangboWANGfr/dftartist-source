import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HierClient } from "@hier/client";
import {
  GraphSession,
  LayoutService,
  SelectionModel,
  TreeModel,
  type GraphEdgeId,
  type GraphFragment,
} from "@hier/viewmodel";
import { HierarchyTree } from "@hier/views";
import {
  SchematicView,
  createGraphProjection,
  selectGraphElement,
  type GraphElementTarget,
  type GraphProjection,
  type SchematicViewFailure,
} from "./proposal.js";

// Compile-only host composition. proposal.js does not exist at runtime.
// The future host imports @hier/views/schematic-view.css explicitly.
// SDK is borrowed; this host owns its models, React root and the Worker factory.
export async function mountSchematicHost(
  client: HierClient,
  container: HTMLElement,
  workerUrl: URL,
  timeoutMs: number,
  report: (failure: SchematicViewFailure) => void,
) {
  const snapshot = await client.ready;
  const graph = new GraphSession(client);
  let selection: SelectionModel | undefined;
  let tree: TreeModel | undefined;
  let layout: LayoutService | undefined;
  let root: Root | undefined;
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    const errors: unknown[] = [];
    // Unmount first; attempt every owned cleanup even if another cleanup throws.
    for (const release of [
      () => root?.unmount(),
      () => layout?.dispose(),
      () => graph.dispose(),
      () => tree?.dispose(),
      () => selection?.dispose(),
    ]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    // client remains owned by the caller.
    if (errors.length) throw new AggregateError(errors, "Schematic host cleanup failed");
  }
  try {
    const shared = (selection = new SelectionModel({ snapshotId: snapshot.snapshotId }));
    tree = new TreeModel(client, { showGenerateScopes: false });
    const service = (layout = new LayoutService(graph, {
      workerFactory: () => new Worker(workerUrl, { type: "classic" }),
      timeoutMs,
    }));
    const source = graph.registerSource({ label: "Design trace", origin: "design" });
    root = createRoot(container);
    root.render(
      createElement(
        "main",
        null,
        createElement(HierarchyTree, {
          tree,
          selection: shared,
          ariaLabel: "实例层级",
          height: 420,
        }),
        createElement(SchematicView, {
          graph,
          layout: service,
          selection: shared,
          ariaLabel: "原理图",
          height: 420,
          onCommandError: report,
        }),
      ),
    );
    return {
      graph,
      selection: shared,
      layout: service,
      // The caller supplies real query results or an explicitly labelled source.
      replace: (fragment: GraphFragment): Promise<void> => source.replace(fragment),
      arrange: (): Promise<void> => service.layout(createGraphProjection(graph).layout),
      // A host's text list can select without pretending to hit a laid-out SVG.
      selectFromMemberList: (target: GraphElementTarget): void =>
        selectGraphElement(graph, shared, target),
      close,
    };
  } catch (error) {
    try {
      close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Schematic host setup and cleanup failed");
    }
    throw error;
  }
}

// Read original fact/owners/bits, never decode display IDs or copy them into geometry.
export function inspectEdges(projection: GraphProjection) {
  return projection.edges.map(({ target, member, label, items }) => {
    const edge = member.edge;
    return {
      target,
      owners: member.owners,
      label,
      items,
      detail: edge.kind === "design" ? edge.value : edge,
    };
  });
}

// A's small compile witnesses, not B's frozen behavioral oracle.
declare const graph: GraphSession;
declare const selection: SelectionModel;
declare const layout: LayoutService;
declare const projection: GraphProjection;
declare const edgeId: GraphEdgeId;
declare const failure: SchematicViewFailure;
// @ts-expect-error A hit must bind the original session and graph revision.
selectGraphElement(graph, selection, { kind: "edge", id: edgeId });
// @ts-expect-error Node and edge identities remain different brands.
const nodeTarget: GraphElementTarget = {
  sessionId: graph.id,
  graphRevision: graph.state.revision,
  kind: "node",
  id: edgeId,
};
// @ts-expect-error The projection does not mutate source membership.
projection.state.edges.push({});
// @ts-expect-error Selection items are readonly.
projection.edges[0]!.items[0]!.ref = "ref:/invented";
// @ts-expect-error Geometry cannot carry a second semantic fact.
projection.layout.edges[0]!.fact = "invented";
// @ts-expect-error Only the existing LayoutDirection enum is accepted.
createGraphProjection(graph, "diagonal");
// @ts-expect-error The view borrows a required layout service.
SchematicView({ graph, selection, ariaLabel: "Graph", height: 300 });
SchematicView({
  graph,
  layout,
  selection,
  ariaLabel: "Graph",
  height: 300,
  // @ts-expect-error No worker or loader injection into the UI layer.
  workerFactory: () => {},
});
// @ts-expect-error Unknown thrown values must be narrowed by the host.
failure.error.message;
if (failure.command === "select") {
  const originalTask = failure.layoutIdentity.taskId;
  const originalTarget: GraphElementTarget = failure.target;
  void [originalTask, originalTarget];
}
void nodeTarget;
