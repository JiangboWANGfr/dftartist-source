import type { GraphNodeId, GraphSession } from "@hier/viewmodel";
import {
  LayoutService,
  type LayoutProjection,
  type LayoutState,
  type LayoutTaskId,
} from "./proposal.js";

// Compile-only composition against the actual production GraphSession types.
// The host serves the packaged ELK worker asset at this explicit URL under its CSP.
export function createLayoutPanel(
  graph: GraphSession,
  workerUrl: URL,
  timeoutMs: number,
  render: (state: LayoutState) => void,
) {
  const layout = new LayoutService(graph, {
    workerFactory: () => new Worker(workerUrl, { type: "classic" }),
    timeoutMs,
  });
  const unsubscribe = layout.subscribe(() => render(layout.state));
  render(layout.state);

  function arrange(): Promise<void> {
    const state = graph.state;
    // This minimal host draws each semantic member as one box. Presentation sizes
    // are host values, not circuit facts. A later canvas can supply measured sizes.
    const projection: LayoutProjection = {
      sessionId: state.sessionId,
      graphRevision: state.revision,
      direction: "RIGHT",
      nodes: state.nodes.map(({ id }) => ({ id, width: 120, height: 48, ports: [] })),
      edges: state.edges.map(({ id }) => ({ id })),
    };
    return layout.layout(projection);
  }

  function membersForHit(edgeIndex: number) {
    const state = layout.state;
    if (state.status !== "success") return;
    const geometry = state.result.edges[edgeIndex];
    if (!geometry) return;
    // Never reconstruct ref/fact/bits from the layout engine's display IDs.
    return graph.state.edges.find((member) => member.id === geometry.id);
  }

  function closePanel() {
    unsubscribe();
    layout.dispose(); // Graph, SDK and shared selection remain owned by the host.
  }
  function closeGraph() {
    graph.dispose(); // Also disposes bound LayoutService, even without source requests.
  }
  return { layout, arrange, membersForHit, closePanel, closeGraph };
}

declare const graph: GraphSession;
declare const layout: LayoutService;
declare const projection: LayoutProjection;
declare const state: LayoutState;

// A's compile-only compatibility checks; not B's frozen oracle or runtime tests.
// @ts-expect-error Deadline is an explicit host policy, not an implicit M7 budget.
new LayoutService(graph, { workerFactory: () => new Worker("/elk.js") });
// @ts-expect-error No main-thread layout backend can be supplied.
new LayoutService(graph, { workerFactory: () => Promise.resolve({}), timeoutMs: 2000 });
// @ts-expect-error A projection must bind its graph revision.
layout.layout({ sessionId: graph.id, direction: "RIGHT", nodes: [], edges: [] });
// @ts-expect-error Task identities are service-owned opaque values.
const inventedTask: LayoutTaskId = "task-1";
// @ts-expect-error Graph member kinds remain distinct.
const wrongNode: GraphNodeId = projection.edges[0]!.id;
// @ts-expect-error Projection arrays cannot be changed by consumers.
projection.nodes.push({});
// @ts-expect-error State is a readonly snapshot.
layout.state.graphRevision++;
if (state.status === "success") {
  const result = state.result;
  // @ts-expect-error No semantic source mutation or synthetic fact in geometry.
  result.edges[0]!.factId = "invented";
  // @ts-expect-error Geometry cannot be mutated in place.
  result.nodes[0]!.x++;
}
// @ts-expect-error No source/SDK query or graph lifecycle ownership through layout.
layout.clearSources();
void [inventedTask, wrongNode];
