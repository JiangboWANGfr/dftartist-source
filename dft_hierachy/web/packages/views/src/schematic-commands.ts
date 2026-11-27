import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  GraphSession,
  LayoutService,
  SelectionModel,
  FoldedGraphProjection,
  createGraphProjection,
  selectGraphElement,
  selectFoldedGraphElement,
  type GraphElementTarget,
  type FoldedGraphTarget,
  type GraphSessionState,
  type LayoutIdentity,
  type FoldedLayoutIdentity,
  type LayoutState,
  type LayoutResult,
  type FoldedLayoutResult,
  type GraphProjection,
  type FoldedLayoutState,
  type Selection,
} from "@hier/viewmodel";
import type {
  SchematicViewCommand,
  SchematicViewFailure,
  FoldedSchematicViewFailure,
  FoldedSchematicViewProps,
  AnySchematicViewProps,
} from "./schematic-view-types.js";

// Intrinsics verify the private brands and ignore overridden instance getters.
const graphState = Object.getOwnPropertyDescriptor(GraphSession.prototype, "state")!.get!;
const graphDisposed = Object.getOwnPropertyDescriptor(GraphSession.prototype, "disposed")!.get!;
const layoutState = Object.getOwnPropertyDescriptor(LayoutService.prototype, "state")!.get!;
const layoutDisposed = Object.getOwnPropertyDescriptor(LayoutService.prototype, "disposed")!.get!;
const layoutMode = Object.getOwnPropertyDescriptor(LayoutService.prototype, "mode")!.get!;
const genuineProjection = FoldedGraphProjection[Symbol.hasInstance];
const selectionState = Object.getOwnPropertyDescriptor(SelectionModel.prototype, "current")!.get!;
const selectionDisposed = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "disposed",
)!.get!;
const selectionSnapshot = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "snapshotId",
)!.get!;
type Identity = LayoutIdentity | FoldedLayoutIdentity;
type Target = GraphElementTarget | FoldedGraphTarget;
type Command = SchematicViewCommand | "fold";
const projectionId = (value: Identity) =>
  "projectionId" in value ? value.projectionId : undefined;

export function sameLayout(left: Identity, right: Identity): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.snapshotId === right.snapshotId &&
    left.graphRevision === right.graphRevision &&
    left.taskId === right.taskId &&
    projectionId(left) === projectionId(right)
  );
}

interface Operation {
  readonly graph: GraphSessionState;
  readonly projection: FoldedGraphProjection | null;
  readonly command: Command;
  readonly report: (error: unknown) => void;
  task: Identity | null;
  starting: boolean;
}
interface Feedback {
  readonly operation: Operation;
  readonly fatal?: AggregateError;
}
function bind(props: AnySchematicViewProps) {
  const { graph, layout, selection } = props;
  const readGraph = (): GraphSessionState => graphState.call(graph);
  const readLayout = (): LayoutState | FoldedLayoutState => layoutState.call(layout);
  const readSelection = (): Selection => selectionState.call(selection);
  const disposed = (): boolean =>
    graphDisposed.call(graph) || layoutDisposed.call(layout) || selectionDisposed.call(selection);
  const g = readGraph(),
    l = readLayout();
  readSelection();
  if (disposed()) throw new TypeError("SchematicView models must be live");
  if (
    l.sessionId !== g.sessionId ||
    l.snapshotId !== g.snapshotId ||
    selectionSnapshot.call(selection) !== g.snapshotId
  )
    throw new TypeError("SchematicView models must share a graph and bound snapshot");
  const session = {
    graph,
    layout,
    selection,
    readGraph,
    readLayout,
    readSelection,
    disposed,
    active: false,
    projection: null as FoldedGraphProjection | null,
    operation: null as Operation | null,
    valid(operation: Operation): boolean {
      if (
        !session.active ||
        session.operation !== operation ||
        disposed() ||
        readGraph() !== operation.graph ||
        session.projection !== operation.projection
      )
        return false;
      if (operation.command === "fold") return true;
      const request = readLayout().request;
      return request === null
        ? operation.task === null
        : operation.task !== null && sameLayout(request, operation.task);
    },
    subscribeGraph(notify: () => void) {
      if (disposed()) return () => {};
      return graph.subscribe(() => {
        session.operation = null;
        notify();
      });
    },
    subscribeLayout(notify: () => void) {
      if (disposed()) return () => {};
      return layout.subscribe(() => {
        const op = session.operation,
          state = readLayout();
        if (op) {
          // Pending is synchronous; the service's guard prevents a reentrant task.
          if (
            op.starting &&
            (op.command === "layout" || op.command === "retry") &&
            state.status === "pending"
          ) {
            op.task = state.request;
            op.starting = false;
          } else if (!session.valid(op)) session.operation = null;
        }
        notify();
      });
    },
    subscribeSelection(notify: () => void) {
      if (disposed()) return () => {};
      return selection.subscribe(notify);
    },
  };
  return session;
}
function validate(props: AnySchematicViewProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError("SchematicView ariaLabel must be nonblank");
  if (typeof props.height !== "number" || !Number.isFinite(props.height) || props.height <= 0)
    throw new TypeError("SchematicView height must be finite and positive");
  if (props.direction !== undefined && !["RIGHT", "LEFT", "UP", "DOWN"].includes(props.direction))
    throw new TypeError("SchematicView direction is invalid");
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("SchematicView className must be a string");
  if (props.onCommandError !== undefined && typeof props.onCommandError !== "function")
    throw new TypeError("SchematicView onCommandError must be a function");
}
/** Validate every controlled projection before any subscription, including prop replacements. */
function foldedProps(
  props: AnySchematicViewProps,
  state: GraphSessionState,
): FoldedSchematicViewProps | null {
  if (layoutMode.call(props.layout) === "graph") {
    if (props.projection !== undefined || props.onFoldChange !== undefined)
      throw new TypeError("SchematicView folded props require a folded layout service");
    return null;
  }
  if (!genuineProjection(props.projection) || typeof props.onFoldChange !== "function")
    throw new TypeError("SchematicView requires a genuine projection and a fold callback");
  const folded = props as FoldedSchematicViewProps;
  if (
    folded.projection.state.sessionId !== state.sessionId ||
    folded.projection.state.snapshotId !== state.snapshotId
  )
    throw new TypeError("SchematicView projection must belong to the bound graph");
  return folded;
}

interface SchematicCommands {
  session: ReturnType<typeof bind>;
  state: GraphSessionState;
  layout: LayoutState | FoldedLayoutState;
  selected: Selection;
  projection: GraphProjection | FoldedGraphProjection | null;
  fold: FoldedGraphProjection | null;
  result: LayoutResult | FoldedLayoutResult | null;
  selectable: boolean;
  disposed: boolean;
  staleProjection: boolean;
  canFold: boolean;
  canLayout: boolean;
  canRetry: boolean;
  canCancel: boolean;
  failed: boolean;
  isCurrentFrame(): boolean;
  invoke(command: Command, target?: Target, groupKey?: string): void;
}
export function useSchematicCommands(props: AnySchematicViewProps): SchematicCommands {
  validate(props);
  const session = useMemo(() => bind(props), [props.graph, props.layout, props.selection]);
  const folded = foldedProps(props, session.readGraph());
  const fold = folded?.projection ?? null;
  const state = useSyncExternalStore(session.subscribeGraph, session.readGraph, session.readGraph);
  const layout = useSyncExternalStore(
    session.subscribeLayout,
    session.readLayout,
    session.readLayout,
  );
  const selected = useSyncExternalStore(
    session.subscribeSelection,
    session.readSelection,
    session.readSelection,
  );
  const disposed = session.disposed();
  const projection = useMemo(
    () => (disposed ? null : (fold ?? createGraphProjection(props.graph, props.direction))),
    [session, state, disposed, props.direction, fold],
  );
  const staleProjection = fold !== null && fold.state !== state;
  const current = !disposed && !staleProjection;
  const result =
    current &&
    layout.result &&
    layout.result.sessionId === state.sessionId &&
    layout.result.snapshotId === state.snapshotId &&
    layout.result.graphRevision === state.revision &&
    (!fold || projectionId(layout.result) === fold.id)
      ? layout.result
      : null;
  const selectable =
    result !== null && layout.status === "success" && sameLayout(layout.request, result);
  const frame = { session, state, layout, fold };
  const committed = useRef<typeof frame | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useLayoutEffect(() => {
    session.active = true;
    return () => {
      session.active = false;
      session.operation = null;
    };
  }, [session]);
  useLayoutEffect(() => {
    committed.current = frame;
    session.projection = fold;
    if (session.operation?.projection !== fold) session.operation = null;
    return () => {
      committed.current = null;
    };
  });
  const matchingRequest =
    !fold || (layout.request !== null && projectionId(layout.request) === fold.id);
  const canLayout = current && (layout.status !== "pending" || !matchingRequest);
  const canRetry =
    current &&
    matchingRequest &&
    (layout.status === "failed" || layout.status === "cancelled") &&
    layout.request.graphRevision === state.revision;
  const canCancel = current && matchingRequest && layout.status === "pending";
  function isCurrentFrame(): boolean {
    return (
      committed.current === frame &&
      session.active &&
      !session.disposed() &&
      session.readGraph() === state &&
      session.readLayout() === layout &&
      session.projection === fold &&
      current
    );
  }
  function invoke(command: Command, target?: Target, groupKey?: string): void {
    if (!isCurrentFrame()) return;
    if (
      (command === "layout" && !canLayout) ||
      (command === "retry" && !canRetry) ||
      (command === "cancel" && !canCancel)
    )
      return;
    if (command === "select") {
      if (!selectable || !target || !projection) return;
      if (
        fold
          ? !("projectionId" in target) || target.projectionId !== fold.id
          : "projectionId" in target
      )
        return;
      const descriptions = target.kind === "node" ? projection.nodes : projection.edges;
      if (!descriptions.some((d) => d.target.id === target.id && d.items.length > 0)) return;
    }
    if (
      command === "fold" &&
      (!fold || !folded || !fold.options.groups.some((g) => g.key === groupKey))
    )
      return;
    const collapsed = fold !== null && !fold.options.collapsed.includes(groupKey!);
    const hit = layout.request;
    const foldedCallback = folded?.onCommandError;
    const graphCallback = props.projection === undefined ? props.onCommandError : undefined;
    const changeFold = folded?.onFoldChange;
    // Each branch retains the callback and exact identity at command initiation.
    const report = (error: unknown) => {
      const base = {
        sessionId: state.sessionId,
        graphRevision: state.revision,
        error,
      };
      if (folded && fold) {
        const start = { ...base, projectionId: fold.id };
        const failure: FoldedSchematicViewFailure =
          command === "fold"
            ? { ...start, command, groupKey: groupKey!, collapsed }
            : command === "select"
              ? {
                  ...start,
                  command,
                  target: target as FoldedGraphTarget,
                  layoutIdentity: hit as FoldedLayoutIdentity,
                }
              : { ...start, command };
        foldedCallback?.(failure);
      } else if (props.projection === undefined && command !== "fold") {
        const failure: SchematicViewFailure =
          command === "select"
            ? {
                ...base,
                command,
                target: target as GraphElementTarget,
                layoutIdentity: hit!,
              }
            : { ...base, command };
        graphCallback?.(failure);
      }
    };
    const op: Operation = {
      graph: state,
      projection: fold,
      command,
      report,
      task: layout.request,
      starting: true,
    };
    session.operation = op;
    setFeedback(null);
    let rejected = false;
    const reject = (error: unknown) => {
      if (rejected) return;
      rejected = true;
      queueMicrotask(() => {
        if (!session.valid(op)) return;
        setFeedback({ operation: op });
        try {
          op.report(error);
        } catch (callbackError) {
          if (session.valid(op))
            setFeedback({
              operation: op,
              fatal: new AggregateError(
                [error, callbackError],
                "SchematicView command feedback failed",
              ),
            });
        }
      });
    };
    try {
      if (command === "fold" && folded && fold) {
        changeFold!(
          Object.freeze({
            groups: fold.options.groups,
            collapsed: Object.freeze(
              collapsed
                ? [...fold.options.collapsed, groupKey!]
                : fold.options.collapsed.filter((k) => k !== groupKey),
            ),
          }),
        );
      } else if (command === "select") {
        if (fold)
          selectFoldedGraphElement(
            session.graph,
            session.selection,
            fold,
            target as FoldedGraphTarget,
          );
        else selectGraphElement(session.graph, session.selection, target as GraphElementTarget);
      } else if (command !== "fold") {
        const pending =
          command === "layout"
            ? folded
              ? folded.layout.layout(folded.projection, props.direction)
              : (props.layout as LayoutService).layout(
                  createGraphProjection(session.graph, props.direction).layout,
                )
            : command === "retry"
              ? session.layout.retry()
              : session.layout.cancel();
        void pending.then(() => {}, reject);
      }
    } catch (error) {
      reject(error);
    } finally {
      op.starting = false;
    }
  }
  const failed =
    feedback !== null &&
    feedback.operation.projection === fold &&
    session.valid(feedback.operation);
  useLayoutEffect(() => {
    if (feedback && !session.valid(feedback.operation)) setFeedback(null);
  }, [session, state, layout, fold, feedback]);
  if (failed && feedback.fatal) throw feedback.fatal;
  return {
    session,
    state,
    layout,
    selected,
    projection,
    fold,
    result,
    selectable,
    disposed,
    staleProjection,
    canFold: current && fold !== null,
    canLayout,
    canRetry,
    canCancel,
    failed,
    isCurrentFrame,
    invoke,
  };
}
