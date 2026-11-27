import { createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ObjectRef, SnapshotId } from "@hier/protocol-types";
import type {
  GraphSession,
  LayoutService,
  SelectionModel,
  TreeModel,
  ProjectedGraphNode,
  ProjectedGraphEdge,
} from "@hier/viewmodel";
import type {
  HierarchyTreeProps as PublishedHierarchyTreeProps,
  SchematicViewProps as PublishedSchematicViewProps,
} from "@hier/views";
import {
  AnnotationLayer,
  HierarchyTree,
  SchematicView,
  resolveObjectAnnotations,
  type AnnotationMark,
  type ObjectAnnotation,
  type AnnotationLayerOptions,
  type AnnotationLayerState,
  type ResolvedObjectAnnotation,
  type HierarchyTreeProps,
  type SchematicViewProps,
} from "./proposal.js";

// Compile-only host. The graph/tree/layout/selection are real published types and
// borrowed here. The host owns only its React root and the two proposed layers.
// No proposal.js runtime or alternate graph/selection implementation is provided.
export function mountSharedAnnotations(
  container: HTMLElement,
  models: {
    graph: GraphSession;
    layout: LayoutService;
    tree: TreeModel;
    selection: SelectionModel;
  },
) {
  const snapshotId = models.graph.snapshotId;
  if (models.tree.snapshotId !== snapshotId || models.selection.snapshotId !== snapshotId)
    throw new TypeError("Host models must share a snapshot");
  let analysis: AnnotationLayer | undefined;
  let plan: AnnotationLayer | undefined;
  let root: Root | undefined;
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    const errors: unknown[] = [];
    for (const release of [
      () => root?.unmount(),
      () => analysis?.dispose(),
      () => plan?.dispose(),
    ]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Annotation host cleanup failed");
  }
  try {
    const analysisLayer = (analysis = new AnnotationLayer({
      snapshotId,
      id: "analysis",
      label: "分析结果",
    }));
    const planLayer = (plan = new AnnotationLayer({ snapshotId, id: "plan", label: "规划提示" }));
    const layers = Object.freeze([analysisLayer, planLayer]);
    root = createRoot(container);
    root.render(
      createElement(
        Fragment,
        null,
        createElement(HierarchyTree, {
          tree: models.tree,
          selection: models.selection,
          ariaLabel: "实例",
          height: 420,
          annotations: layers,
        }),
        createElement(SchematicView, {
          graph: models.graph,
          layout: models.layout,
          selection: models.selection,
          ariaLabel: "原理图",
          height: 420,
          annotations: layers,
        }),
      ),
    );
    return {
      // Values come from the host; this consumer does not invent DFT conclusions.
      replaceAnalysis: (marks: readonly ObjectAnnotation[]) => analysisLayer.set(marks),
      replacePlan: (marks: readonly ObjectAnnotation[]) => planLayer.set(marks),
      clearAnalysis: () => analysisLayer.clear(),
      inspectObjects: (refs: readonly ObjectRef[]) =>
        resolveObjectAnnotations(snapshotId, refs, layers),
      inspectGraphMember: (descriptor: ProjectedGraphNode | ProjectedGraphEdge) =>
        resolveObjectAnnotations(
          snapshotId,
          descriptor.items.map((item) => item.ref),
          layers,
        ),
      close,
    };
  } catch (error) {
    try {
      close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Annotation host setup failed");
    }
    throw error;
  }
}

// Existing consumers still typecheck without annotations.
export function existingPropsRemainValid(
  tree: PublishedHierarchyTreeProps,
  graph: PublishedSchematicViewProps,
) {
  const nextTree: HierarchyTreeProps = tree;
  const nextGraph: SchematicViewProps = graph;
  return [
    createElement(HierarchyTree, nextTree),
    createElement(SchematicView, nextGraph),
    createElement(HierarchyTree, { ...tree, annotations: undefined }),
    createElement(SchematicView, { ...graph, annotations: undefined }),
  ];
}

// A's finite compile witnesses, not B's behavioral oracle or runtime tests.
declare const snapshotId: SnapshotId;
declare const ref: ObjectRef;
declare const layer: AnnotationLayer;
declare const state: AnnotationLayerState;
declare const treeProps: HierarchyTreeProps;
declare const graphProps: SchematicViewProps;
declare const resolved: readonly ResolvedObjectAnnotation[];
declare const fakeLayer: Pick<AnnotationLayer, keyof AnnotationLayer>;
const mark: AnnotationMark = { color: "#aB12Ef", badge: "", tooltip: "<text>", severity: "warn" };
const options: AnnotationLayerOptions = { snapshotId, id: "analysis", label: "分析" };
layer.set([{ ref, mark }]);
const unsubscribe: () => void = layer.subscribe(() => {
  const observed: AnnotationLayerState = layer.state;
  void observed;
});
resolveObjectAnnotations(snapshotId, [ref, ref], [layer]);
void [options, unsubscribe];

// @ts-expect-error A01: snapshot binding is required.
new AnnotationLayer({ id: "a", label: "A" });
// @ts-expect-error A02: early unpublished positional constructor is not the concrete contract.
new AnnotationLayer("a", "A");
// @ts-expect-error A03: severity is a closed enum.
layer.set([{ ref, mark: { severity: "critical" } }]);
// @ts-expect-error A04: no executable tooltip.
layer.set([{ ref, mark: { tooltip: () => "HTML" } }]);
// @ts-expect-error A05: no style objects.
layer.set([{ ref, mark: { color: { background: "red" } } }]);
// @ts-expect-error A06: object mark is not a definition selection.
layer.set([{ def: ref, mark }]);
// @ts-expect-error A07: object annotation does not invent bit-level targeting.
layer.set([{ ref, bits: { lsb: 1, width: 2 }, mark }]);
// @ts-expect-error A08: records, not a second public Map representation.
layer.set(new Map([[ref, mark]]));
// @ts-expect-error A09: the state collection is readonly.
state.marks.push({ ref, mark });
// @ts-expect-error A10: nested marks are readonly.
state.marks[0]!.mark.badge = "mutated";
// @ts-expect-error A11: layers cannot be rebound to a snapshot.
layer.state.snapshotId = snapshotId;
// @ts-expect-error A12: output is readonly.
resolved.push({ layer: state, entry: state.marks[0]! });
// @ts-expect-error A13: original entry references remain readonly.
resolved[0]!.entry.ref = ref;
// @ts-expect-error A14: a public-shaped substitute cannot replace the real class.
resolveObjectAnnotations(snapshotId, [ref], [fakeLayer]);
// @ts-expect-error A15: props borrow actual layers, not arbitrary per-view maps.
SchematicView({ ...graphProps, annotations: new Map([[ref, mark]]) });
// @ts-expect-error A16: explicit undefined mark fields are not valid input.
layer.set([{ ref, mark: { badge: undefined } }]);
// @ts-expect-error A17: views do not take ownership/creation callbacks.
HierarchyTree({ ...treeProps, annotationFactory: () => layer });
const missingLayout = {
  graph: graphProps.graph,
  selection: graphProps.selection,
  ariaLabel: "G",
  height: 400,
  annotations: [layer],
};
// @ts-expect-error A18: annotation props cannot replace required layout ownership.
SchematicView(missingLayout);
