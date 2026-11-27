import { GraphSession } from "@B/graph";
import type {
  GraphSessionId,
  GraphSourceId,
  GraphNodeId,
  GraphEdgeId,
  GraphOrigin,
  GraphNodeInput,
  GraphFragment,
  GraphSourceState,
  GraphSourceContent,
  GraphSource,
} from "@B/graph";
import type { HierClient } from "@hier/client";
import type {
  SnapshotId,
  TraceNode,
  TraceEdge,
  Completeness,
  TraceFrontier,
} from "@hier/protocol-types";
declare const client: HierClient,
  snapshotId: SnapshotId,
  traceNode: TraceNode,
  traceEdge: TraceEdge,
  completeness: Completeness,
  frontier: readonly TraceFrontier[],
  source: GraphSource;
const graph = new GraphSession(client);
const f: GraphFragment = {
  snapshotId,
  nodes: [
    { kind: "design", value: traceNode },
    {
      kind: "external",
      key: "n",
      label: "",
      ports: [],
      target: { ref: "B", bits: { lsb: 0, width: 1 }, side: "inside" },
    },
  ],
  edges: [{ kind: "design", value: traceEdge }],
  completeness,
  frontier,
  hasConservative: false,
};
const s = graph.registerSource({ label: "", origin: "analysis" });
const replace: Promise<void> = s.replace(f),
  clear: Promise<void> = s.clear(),
  cancel: Promise<void> = s.cancel();
const refresh: Promise<void> = s.refresh(async (context) => {
  const id: GraphSessionId = context.sessionId,
    sid: GraphSourceId = context.sourceId,
    signal: AbortSignal = context.signal;
  void [id, sid, signal];
  return f;
});
const id: GraphSourceId = s.id,
  gid: GraphSessionId = graph.state.sessionId;
const off = graph.subscribe(() => {
  const state = graph.state;
  for (const n of state.nodes) {
    const id: GraphNodeId = n.id;
    void id;
  }
  for (const e of state.edges) {
    const id: GraphEdgeId = e.id;
    void id;
  }
});
off();
off();
if (s.state.status === "failed" || s.state.status === "cancelled") {
  const code: string = s.state.error.code;
  void code;
}
void [replace, clear, cancel, refresh, id, gid];
// @ts-expect-error T01 opaque session identity
const badSession: GraphSessionId = "B";
// @ts-expect-error T02 different identity brands
const badSource: GraphSourceId = graph.id;
declare const edgeId: GraphEdgeId;
// @ts-expect-error T03 graph node and edge identity cannot mix
const badNode: GraphNodeId = edgeId;
// @ts-expect-error T04 finite origins
const badOrigin: GraphOrigin = "worker";
// @ts-expect-error T05 caller cannot choose source ID
graph.registerSource({ label: "B", origin: "plan", id: "B" });
// @ts-expect-error T06 exact optional navigation target
const undefinedTarget: GraphNodeInput = {
  kind: "external",
  key: "n",
  label: "",
  ports: [],
  target: undefined,
};
const defTarget: GraphNodeInput = {
  kind: "external",
  key: "n",
  label: "",
  ports: [],
  // @ts-expect-error T07 definition selection is not object target
  target: { def: "B-definition" },
};
// @ts-expect-error T08 explicit external ports required
const noPorts: GraphNodeInput = { kind: "external", key: "n", label: "" };
// @ts-expect-error T09 completeness is never inferred from success
const noCompleteness: GraphFragment = {
  snapshotId,
  nodes: [],
  edges: [],
  frontier: [],
  hasConservative: false,
};
// @ts-expect-error T10 no layout injected into fragment
const layout: GraphFragment = { ...f, geometry: {} };
// @ts-expect-error T11 published member collection readonly
graph.state.nodes.push(graph.state.nodes[0]!);
// @ts-expect-error T12 owner collection readonly
graph.state.nodes[0]!.owners.push(s.id);
// @ts-expect-error T13 content is only readonly member identities
s.state.content!.nodes.push(graph.state.nodes[0]!.id);
// @ts-expect-error T14 callers cannot change source revision
s.state.revision = 9;
declare const design: Extract<GraphNodeInput, { kind: "design" }>;
// @ts-expect-error T15 preserved Core DTO recursively readonly
design.value.point!.slice.ref = "rewrite";
// @ts-expect-error T16 source dispose asynchronous
const sourceDispose: void = s.dispose();
// @ts-expect-error T17 graph dispose synchronous
const graphDispose: Promise<void> = graph.dispose();
// @ts-expect-error T18 loader cannot return arbitrary data
s.refresh(() => 17);
// @ts-expect-error T19 failed state needs diagnostic
const failed: GraphSourceState = {
  id: s.id,
  label: "",
  origin: "analysis",
  revision: 1,
  content: null,
  status: "failed",
};
// @ts-expect-error T20 disposed content must be null
const disposed: GraphSourceState = {
  id: s.id,
  label: "",
  origin: "analysis",
  revision: 1,
  content: {} as GraphSourceContent,
  status: "disposed",
};
void [
  badSession,
  badSource,
  badNode,
  badOrigin,
  undefinedTarget,
  defTarget,
  noPorts,
  noCompleteness,
  layout,
  sourceDispose,
  graphDispose,
  failed,
  disposed,
];
