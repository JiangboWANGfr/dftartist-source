import { createElement } from "react";
import {
  createFoldedGraphProjection,
  createGraphProjection,
  selectFoldedGraphElement,
  resolveObjectAnnotations,
  type GraphSession,
  type GraphSessionState,
  type SelectionModel,
  type AnnotationLayer,
  type GraphFoldOptions,
  type FoldedGraphProjection,
  type GraphNodeId,
  type GraphEdgeId,
  type DisplayNodeId,
  type DisplayEdgeId,
  type LayoutServiceOptions,
  type LayoutState,
  type LayoutResult,
} from "@hier/viewmodel";
import {
  SchematicView as CurrentSchematicView,
  type SchematicViewProps as CurrentSchematicViewProps,
} from "@hier/views";
import {
  LayoutService,
  SchematicView,
  type SchematicViewProps,
  type FoldedSchematicViewProps,
  type FoldedSchematicViewFailure,
  type FoldedLayoutResult,
  type FoldedLayoutState,
} from "./proposal.js";

// Compile-only host composition: the SDK/model/source facts are the real published types.
// A host calls publish after a current graph revision or a controlled fold intent changes.
export function foldedPanel(
  graph: GraphSession,
  selection: SelectionModel,
  annotations: readonly AnnotationLayer[],
  initial: GraphFoldOptions,
  worker: LayoutServiceOptions,
  publish: (props: FoldedSchematicViewProps) => void,
) {
  const layout = new LayoutService<"folded">(graph, worker, "folded");
  function present(options: GraphFoldOptions): FoldedSchematicViewProps {
    const projection = createFoldedGraphProjection(graph, options);
    return {
      graph,
      selection,
      annotations,
      layout,
      projection,
      ariaLabel: "连接图",
      height: 480,
      onFoldChange: (next) => publish(present(next)),
      onCommandError: (failure) => {
        const original: unknown = failure.error;
        if (failure.command === "select") {
          const sameGeneration: boolean =
            failure.target.projectionId === failure.layoutIdentity.projectionId;
          void sameGeneration;
        }
        void original;
      },
    };
  }
  const props = present(initial);
  return {
    props,
    element: createElement(SchematicView, props),
    run: () => layout.layout(props.projection, "RIGHT"),
    // Restoration uses current original members, not cached coordinates or a second graph.
    expand: () => present({ groups: props.projection.options.groups, collapsed: [] }),
    currentGeometry(): FoldedLayoutResult | null {
      const state = layout.state;
      return state.status === "success" && state.result.projectionId === props.projection.id
        ? state.result
        : null;
    },
  };
}

export function inspectOriginalMembers(
  graph: GraphSession,
  selection: SelectionModel,
  projection: FoldedGraphProjection,
  result: FoldedLayoutResult,
  annotations: readonly AnnotationLayer[],
) {
  const original: GraphSessionState = projection.state;
  if (original !== graph.state || result.projectionId !== projection.id) return [];
  return result.edges.map((geometry) => {
    const descriptor = projection.edges.find((edge) => edge.target.id === geometry.id)!;
    return {
      originalEdges: descriptor.members,
      displayFrom: geometry.from,
      displayTo: geometry.to,
      exactItems: descriptor.items,
      marks: resolveObjectAnnotations(
        original.snapshotId,
        descriptor.items.map((item) => item.ref),
        annotations,
      ),
      choose: () => selectFoldedGraphElement(graph, selection, projection, descriptor.target),
    };
  });
}

// Both the untouched current-root consumer and the proposed default call remain compilable.
export function currentConsumer(props: CurrentSchematicViewProps) {
  const state: LayoutState = props.layout.state;
  void state;
  return createElement(CurrentSchematicView, props);
}
export function defaultConsumer(graph: GraphSession, props: SchematicViewProps) {
  const geometry: LayoutResult | null = props.layout.state.result;
  const work: Promise<void> = props.layout.layout(createGraphProjection(graph).layout);
  return { work, geometry, element: createElement(SchematicView, props) };
}

// Finite A type witnesses, not B's oracle. No casts connect display and original identities.
declare const graph: GraphSession;
declare const selection: SelectionModel;
declare const options: LayoutServiceOptions;
declare const projection: FoldedGraphProjection;
declare const originalNode: GraphNodeId;
declare const originalEdge: GraphEdgeId;
declare const displayNode: DisplayNodeId;
declare const displayEdge: DisplayEdgeId;
declare const folded: LayoutService<"folded">;
declare const flat: LayoutService;
declare const foldedProps: FoldedSchematicViewProps;
declare const result: FoldedLayoutResult;
declare const failure: FoldedSchematicViewFailure;
const legacy = new LayoutService(graph, options);
const legacyState: LayoutState = legacy.state;
const foldedState: FoldedLayoutState = folded.state;
void legacyState;
if (foldedState.status === "success") {
  const current: FoldedLayoutResult = foldedState.result;
  void current;
}
// @ts-expect-error T01 folded mode requires explicit constructor configuration.
new LayoutService<"folded">(graph, options);
// @ts-expect-error T02 default constructor does not accept folded configuration.
new LayoutService(graph, options, "folded");
// @ts-expect-error T03 old layout entry cannot receive display projection.
flat.layout(projection);
// @ts-expect-error T04 display layout cannot receive original flat geometry.
folded.layout(createGraphProjection(graph).layout);
// @ts-expect-error T05 layout direction retains the existing closed enum.
folded.layout(projection, "DIAGONAL");
// @ts-expect-error T06 folded state is not the old original-ID state.
const mixedState: LayoutState = folded.state;
// @ts-expect-error T07 display geometry cannot masquerade as original geometry.
const mixedResult: LayoutResult = result;
// @ts-expect-error T08 node display ID is not an original graph node ID.
const wrongNode: GraphNodeId = displayNode;
// @ts-expect-error T09 edge display ID is not an original graph edge ID.
const wrongEdge: GraphEdgeId = displayEdge;
// @ts-expect-error T10 original node cannot populate display geometry.
const wrongDisplayNode: DisplayNodeId = originalNode;
// @ts-expect-error T11 original edge cannot populate display geometry.
const wrongDisplayEdge: DisplayEdgeId = originalEdge;
// @ts-expect-error T12 the result carries a readonly projection generation.
result.projectionId = projection.id;
// @ts-expect-error T13 old props cannot borrow a folded layout service.
const wrongFlatProps: SchematicViewProps = { ...foldedProps };
// @ts-expect-error T14 folded props cannot borrow the default service.
const wrongFoldedProps: FoldedSchematicViewProps = { ...foldedProps, layout: flat };
const { onFoldChange: removedCallback, ...missingCallback } = foldedProps;
// @ts-expect-error T15 controlled fold callback is required.
const missing: FoldedSchematicViewProps = missingCallback;
if (failure.command === "select") {
  // @ts-expect-error T16 selection failure uses a display target with projection generation.
  const target: GraphNodeId | GraphEdgeId = failure.target.id;
  void target;
}
if (failure.command === "fold") {
  const intent: boolean = failure.collapsed;
  // @ts-expect-error T17 fold feedback has no hit layout identity.
  const id: string = failure.layoutIdentity.taskId;
  void intent;
  void id;
}
// @ts-expect-error T18 no caller can replace a service's state.
folded.state = foldedState;
void selection;
void removedCallback;

// C-107: the component union must reject mixed modes, including non-fresh objects.
declare const oldProps: SchematicViewProps;
SchematicView(oldProps);
SchematicView(foldedProps);
createElement(SchematicView, oldProps);
createElement(SchematicView, foldedProps);
// @ts-expect-error T19 folded intent cannot borrow the default layout through the old branch.
SchematicView({ ...oldProps, projection, onFoldChange: () => {} });
// @ts-expect-error T20 projection requires both the folded service and a controlled callback.
SchematicView({ ...oldProps, projection });
const combined = { ...oldProps, projection, onFoldChange: () => {} };
// @ts-expect-error T21 assignment/spread must not bypass mutual exclusion at the component entry.
SchematicView(combined);
// @ts-expect-error T22 React's component entry enforces the same mutually exclusive branches.
createElement(SchematicView, { ...oldProps, projection, onFoldChange: () => {} });
// @ts-expect-error T23 React also rejects projection with a missing callback and default service.
createElement(SchematicView, { ...oldProps, projection });
