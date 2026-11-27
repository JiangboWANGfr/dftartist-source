import type { ReactElement } from "react";
import { AnnotationLayer, AnnotationError, resolveObjectAnnotations } from "@B/layer";
import type {
  AnnotationMark,
  ObjectAnnotation,
  AnnotationLayerState,
  AnnotationErrorCode,
  ResolvedObjectAnnotation,
} from "@B/layer";
import { HierarchyTree, SchematicView } from "@B/view";
import type { HierarchyTreeProps, SchematicViewProps } from "@B/view";
import type { HierarchyTreeProps as OldTree, SchematicViewProps as OldGraph } from "@hier/views";
declare const tree: OldTree, graph: OldGraph;
const layer = new AnnotationLayer({ snapshotId: "opaque", id: "B", label: "B label" });
const m: AnnotationMark = { color: "#aB12Ef", badge: "", tooltip: "plain <&>", severity: "warn" };
const marks: readonly ObjectAnnotation[] = [{ ref: "opaque ref", mark: m }];
const returned: void = layer.set(marks),
  cleared: void = layer.clear();
const state: AnnotationLayerState = layer.state,
  disposed: boolean = layer.disposed;
const off: () => void = layer.subscribe(() => {});
off();
const resolved: readonly ResolvedObjectAnnotation[] = resolveObjectAnnotations(
  "opaque",
  ["opaque ref"],
  [layer],
);
const tp: HierarchyTreeProps = { ...tree, annotations: [layer] },
  gp: SchematicViewProps = { ...graph, annotations: [layer] };
const views: ReactElement[] = [
  HierarchyTree(tree),
  HierarchyTree(tp),
  HierarchyTree({ ...tree, annotations: undefined }),
  SchematicView(graph),
  SchematicView(gp),
  SchematicView({ ...graph, annotations: [] }),
  SchematicView({ ...graph, annotations: undefined }),
];
const codes: readonly AnnotationErrorCode[] = [
  "invalid_argument",
  "snapshot_mismatch",
  "disposed",
  "reentrant_change",
  "revision_exhausted",
];
new AnnotationError(codes[0]!, "B error");
layer.dispose();
void [returned, cleared, state, disposed, resolved, views];
// @ts-expect-error T01: required snapshot
new AnnotationLayer({ id: "B", label: "B" });
// @ts-expect-error T02: required id
new AnnotationLayer({ snapshotId: "s", label: "B" });
// @ts-expect-error T03: required label
new AnnotationLayer({ snapshotId: "s", id: "B" });
// @ts-expect-error T04: snapshot opaque string
new AnnotationLayer({ snapshotId: 7, id: "B", label: "B" });
// @ts-expect-error T05: precise severity
const severity: AnnotationMark = { severity: "fatal" };
// @ts-expect-error T06: color text only
const color: AnnotationMark = { color: { background: "red" } };
// @ts-expect-error T07: no object slices on mark
const bits: ObjectAnnotation = { ref: "x", mark: {}, bits: { lsb: 0, width: 1 } };
// @ts-expect-error T08: required mark
layer.set([{ ref: "x" }]);
// @ts-expect-error T09: absent and explicit undefined differ
layer.set([{ ref: "x", mark: { badge: undefined } }]);
// @ts-expect-error T10: nominal real layer
const fake: AnnotationLayer = {
  state,
  disposed,
  set() {},
  clear() {},
  subscribe() {
    return () => {};
  },
  dispose() {},
};
// @ts-expect-error T11: readonly marks
state.marks.push({ ref: "x", mark: {} });
// @ts-expect-error T12: readonly mark
state.marks[0]!.mark.color = "#123456";
// @ts-expect-error T13: exact error union
new AnnotationError("timeout", "not an async model");
// @ts-expect-error T14: refs not SelectionItems
resolveObjectAnnotations("s", [{ ref: "x" }], [layer]);
// @ts-expect-error T15: tree expects layer not state
HierarchyTree({ ...tree, annotations: [state] });
// @ts-expect-error T16: graph expects real layers
SchematicView({ ...graph, annotations: [{}] });
// @ts-expect-error T17: early unpublished constructor is not API
new AnnotationLayer("B", "label");
// @ts-expect-error T18: one array representation, not Map
layer.set(new Map([["x", {}]]));
// @ts-expect-error T19: readonly revision
state.revision = 2;
// @ts-expect-error T20: resolved results readonly
resolved.push({ layer: state, entry: marks[0]! });
void [severity, color, bits, fake];
