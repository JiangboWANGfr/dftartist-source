import type { HierClient, Reply } from "@hier/client";
import type { TraceConeParams, TraceResult } from "@hier/protocol-types";
import type { SelectionModel } from "@hier/viewmodel";
import {
  GraphSession,
  type GraphEdgeId,
  type GraphFragment,
  type GraphNodeId,
  type GraphSource,
} from "./proposal.js";

// Compile-only host composition. No proposed runtime is imported by production.
export function graphHost(client: HierClient, selection: SelectionModel) {
  const graph = new GraphSession(client);
  const analysis = graph.registerSource({ label: "Clock analysis", origin: "analysis" });
  const drc = graph.registerSource({ label: "Clock analysis", origin: "analysis" });
  const trace = graph.registerSource({ label: "User trace", origin: "design" });
  const snapshotId = graph.snapshotId;

  function fragment(reply: Reply<TraceResult>): GraphFragment {
    return {
      snapshotId,
      nodes: reply.result.nodes.map((value) => ({ kind: "design", value })),
      edges: reply.result.edges.map((value) => ({ kind: "design", value })),
      completeness: reply.completeness,
      frontier: reply.result.frontier,
      hasConservative: reply.result.hasConservative,
    };
  }
  function load(source: GraphSource, query: TraceConeParams) {
    return source.refresh(async ({ snapshotId: bound, signal }) => {
      if (bound !== snapshotId) throw new Error("Host binding mismatch");
      return fragment(await client.cone(query, signal));
    });
  }
  const unsubscribe = graph.subscribe(() => {
    for (const node of graph.state.nodes) {
      // A semantic member may belong to both analysis and trace.
      const owners = node.owners;
      const sharedSelection = selection.current;
      void [owners, sharedSelection];
    }
  });
  async function sameLocalNames() {
    const external: GraphFragment = {
      snapshotId,
      nodes: [{ kind: "external", key: "node1", label: "Proposed buffer", ports: [] }],
      edges: [],
      completeness: { status: "complete", reasons: [] },
      frontier: [],
      hasConservative: false,
    };
    await analysis.replace(external);
    await drc.replace(external); // Separate source namespaces despite identical labels and keys.
    await analysis.clear(); // Does not clear drc, trace or the shared SelectionModel.
  }
  async function closeSource() {
    await analysis.dispose(); // Removes only this owner's membership, settles its pending load.
  }
  function close() {
    unsubscribe();
    graph.dispose(); // Does not dispose the borrowed SDK or SelectionModel.
  }
  return { graph, analysis, drc, trace, load, fragment, sameLocalNames, closeSource, close };
}

declare const graph: GraphSession;
declare const source: GraphSource;
declare const nodeId: GraphNodeId;
declare const edgeId: GraphEdgeId;
declare const input: GraphFragment;

// Narrow negative checks of the proposed API, not B's behavioral oracle.
// @ts-expect-error IDs are allocated by the graph; a raw local name is not a member ID.
const invented: GraphNodeId = "node1";
// @ts-expect-error Node IDs and edge IDs are not interchangeable.
const wrongKind: GraphNodeId = edgeId;
// @ts-expect-error State revisions cannot be changed by the consumer.
graph.state.revision++;
// @ts-expect-error Members are readonly snapshots.
graph.state.nodes.push({ id: nodeId });
// @ts-expect-error No unowned append API.
graph.addFragment(input);
// @ts-expect-error No implicit layout service or geometry in this source unit.
graph.retryLayout();
source.refresh(async (context) => {
  // @ts-expect-error The source determines its own revision.
  context.sourceRevision++;
  return input;
});
// @ts-expect-error Asynchronous loaders must return a complete fragment input.
source.refresh(async () => ({ nodes: [] }));
// @ts-expect-error The snapshot cannot be omitted.
source.replace({
  nodes: [],
  edges: [],
  completeness: { status: "complete", reasons: [] },
  frontier: [],
  hasConservative: false,
});
// @ts-expect-error Names do not provide source identity.
graph.registerSource({ id: "clock", label: "Clock", origin: "analysis" });
// @ts-expect-error A tree selection origin is not a graph source origin.
graph.registerSource({ label: "Clock", origin: "tree" });
void [invented, wrongKind];
