import type { GraphSession } from "./graph-session.js";
import type { GraphNodeId, GraphEdgeId, GraphSessionState } from "./graph-types.js";
import { bindGraph, hasGraphBindings } from "./graph-lifecycle.js";
import { readLayoutOptions, readLayoutProjection, layoutCause } from "./layout-input.js";
import { encodeLayout, elkProjection, prepareLayout, readLayoutResult } from "./layout-geometry.js";
import type { GeometryResult, LayoutPrepared, LayoutEncoding } from "./layout-geometry.js";
import { LayoutWorker } from "./layout-worker.js";
import { hasModelErrorBrand } from "./model-error-brand.js";
import { LayoutError } from "./layout-types.js";
import type {
  LayoutErrorCode,
  LayoutIdentity,
  LayoutProjection,
  LayoutDirection,
  LayoutStateOf,
  LayoutServiceOptions,
  LayoutState,
  LayoutTaskId,
} from "./layout-types.js";

import { FoldedGraphProjection } from "./fold-projection.js";
import type { DisplayNodeId, DisplayEdgeId, FoldProjectionId } from "./fold-projection-types.js";
import type { LayoutMode, FoldedLayoutState } from "./folded-layout-types.js";
import { createLayoutAnchors } from "./layout-anchors.js";

// The single task engine handles both ID families. Public results remain mode-specific.
type RuntimeIdentity = LayoutIdentity & {
  readonly projectionId?: FoldProjectionId;
};
type RuntimeInput = LayoutPrepared<GraphNodeId | DisplayNodeId, GraphEdgeId | DisplayEdgeId> & {
  readonly projectionId?: FoldProjectionId;
};
type RuntimeResult = GeometryResult<
  GraphNodeId | DisplayNodeId,
  GraphEdgeId | DisplayEdgeId,
  RuntimeIdentity
>;
type RuntimeState = LayoutStateOf<RuntimeIdentity, RuntimeResult>;
const genuineProjection = FoldedGraphProjection[Symbol.hasInstance];
function prepareFolded(
  projection: unknown,
  graph: GraphSessionState,
  direction: unknown,
): RuntimeInput {
  if (!genuineProjection(projection)) throw error("invalid_argument");
  const folded = projection as FoldedGraphProjection;
  if (folded.state !== graph) throw error("stale_graph");
  if (direction === undefined) direction = "RIGHT";
  if (direction !== "RIGHT" && direction !== "DOWN" && direction !== "LEFT" && direction !== "UP")
    throw error("invalid_argument");
  const nodes = folded.nodes.map((n) => ({ id: n.target.id }));
  const edges = folded.edges.map((e) => ({
    id: e.target.id,
    from: e.from,
    to: e.to,
  }));
  return {
    projectionId: folded.id,
    projection: {
      sessionId: graph.sessionId,
      graphRevision: graph.revision,
      ...createLayoutAnchors(nodes, edges, direction),
    },
    nodes: nodes.map((n) => n.id),
    edges,
  };
}

interface Command {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly errors: unknown[];
  failure: unknown;
  waiting: boolean;
  settled: boolean;
}
interface Task {
  readonly identity: RuntimeIdentity;
  readonly input: RuntimeInput;
  readonly command: Command;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  resource: LayoutWorker | undefined;
  encoding: LayoutEncoding<GraphNodeId | DisplayNodeId, GraphEdgeId | DisplayEdgeId> | undefined;
}
interface Registration {
  listener: (() => void) | undefined;
}
let nextTask = 0n;
const error = (code: LayoutErrorCode) => new LayoutError(code, `Layout operation: ${code}`);
function command(): Command {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return {
    promise,
    resolve,
    reject,
    errors: [],
    failure: undefined,
    waiting: false,
    settled: false,
  };
}
function failure(value: unknown): LayoutError {
  return hasModelErrorBrand(value, LayoutError)
    ? (value as LayoutError)
    : layoutCause(error("worker_failure"), value);
}

/** One geometry owner for one borrowed graph. Semantic membership stays in GraphSession. */
export class LayoutService<Mode extends LayoutMode = "graph"> {
  readonly #mode: Mode;
  #graph: GraphSession;
  #options: LayoutServiceOptions;
  #state: RuntimeState;
  #disposed = false;
  #depth = 0;
  #task: Task | undefined;
  // Includes retiring resources until cleanup, including during two-phase graph invalidation.
  #tasks = new Set<Task>();
  #commands = new Set<Command>();
  #listeners = new Set<Registration>();
  #lastInput: RuntimeInput | undefined;
  #unbind: () => void;

  constructor(
    graph: GraphSession,
    options: LayoutServiceOptions,
    ...mode: Mode extends "folded" ? [mode: "folded"] : []
  ) {
    if (mode.length > 1 || (mode.length === 1 && mode[0] !== "folded"))
      throw error("invalid_argument");
    this.#mode = (mode.length ? "folded" : "graph") as Mode;
    if (!hasGraphBindings(graph)) throw error("invalid_argument");
    this.#graph = graph;
    this.#options = readLayoutOptions(options, () => this.#assertActive());
    this.#state = Object.freeze({
      ...this.#base(),
      status: "idle",
      request: null,
      result: null,
    });
    this.#unbind = bindGraph(graph, {
      prepare: (state, disposed) => this.#prepareGraph(state, disposed),
    });
  }
  get mode(): Mode {
    return this.#mode;
  }
  get state(): Mode extends "folded" ? FoldedLayoutState : LayoutState {
    // Construction fixes the mode; only its matching input preparation can publish a result.
    return this.#state as Mode extends "folded" ? FoldedLayoutState : LayoutState;
  }
  get disposed(): boolean {
    return this.#disposed;
  }
  layout(
    ...input: Mode extends "folded"
      ? [projection: FoldedGraphProjection, direction?: LayoutDirection]
      : [projection: LayoutProjection]
  ): Promise<void> {
    return this.#run((cmd) => {
      const graph = this.#graph.state;
      const prepared =
        this.#mode === "folded"
          ? prepareFolded(input[0], graph, input[1])
          : prepareLayout(
              readLayoutProjection(input[0], graph, () => this.#guard(graph.revision)),
              graph,
            );
      this.#start(prepared, cmd);
    });
  }
  retry(): Promise<void> {
    return this.#run((cmd) => {
      const input = this.#lastInput;
      if (input && input.projection.graphRevision !== this.#graph.state.revision)
        throw error("stale_graph");
      if (!input || (this.#state.status !== "failed" && this.#state.status !== "cancelled"))
        throw error("invalid_argument");
      this.#start(input, cmd);
    });
  }
  cancel(): Promise<void> {
    return this.#run((cmd) => {
      const task = this.#task;
      if (!task) return;
      this.#withdraw(task, error("cancelled"));
      this.#clean(task);
      if (this.#disposed || this.#graph.state.revision !== task.identity.graphRevision) return;
      this.#state = Object.freeze({
        ...this.#base(),
        status: "cancelled",
        request: task.identity,
        result: this.#state.result,
        error: this.#diagnostic(failure(task.command.failure)),
      });
      cmd.errors.push(...this.#notify());
      if (cmd.errors.length) cmd.failure = error("cancelled");
    });
  }
  subscribe(listener: () => void): () => void {
    this.#assertActive();
    if (typeof listener !== "function") throw error("invalid_argument");
    const registration: Registration = { listener };
    this.#listeners.add(registration);
    return () => {
      registration.listener = undefined;
      this.#listeners.delete(registration);
    };
  }
  dispose(): void {
    if (this.#disposed) return;
    const errors = this.#prepareGraph(this.#graph.state, true)();
    if (errors.length) throw new AggregateError(errors, "Layout cleanup failed");
  }
  #base() {
    return {
      sessionId: this.#graph.id,
      snapshotId: this.#graph.snapshotId,
      graphRevision: this.#graph.state.revision,
    };
  }
  #assertActive(): void {
    if (this.#disposed || this.#graph.disposed) throw error("disposed");
  }
  #guard(revision: number): void {
    this.#assertActive();
    if (this.#graph.state.revision !== revision) throw error("stale_graph");
  }
  #run(action: (cmd: Command) => void): Promise<void> {
    const cmd = command();
    try {
      this.#assertActive();
      if (this.#depth) throw error("reentrant_change");
    } catch (cause) {
      cmd.failure = cause;
      this.#finish(cmd);
      return cmd.promise;
    }
    this.#commands.add(cmd);
    this.#depth++;
    try {
      action(cmd);
    } catch (cause) {
      cmd.failure = cause;
    } finally {
      this.#depth--;
      this.#settle();
    }
    return cmd.promise;
  }
  #finish(cmd: Command): void {
    if (cmd.settled) return;
    let cause = cmd.failure;
    if (cmd.errors.length)
      cause = new AggregateError(cmd.errors, "Layout listeners failed", {
        cause,
      });
    if (
      this.#disposed &&
      !(hasModelErrorBrand(cause, LayoutError) && (cause as LayoutError).code === "disposed")
    )
      cause = cause === undefined ? error("disposed") : layoutCause(error("disposed"), cause);
    cmd.settled = true;
    this.#commands.delete(cmd);
    if (cause !== undefined) cmd.reject(cause);
    else cmd.resolve();
  }
  #settle(): void {
    if (this.#depth) return;
    for (const cmd of this.#commands) if (!cmd.waiting || this.#disposed) this.#finish(cmd);
  }
  #notify(): unknown[] {
    const errors: unknown[] = [];
    for (const registration of [...this.#listeners]) {
      if (this.#disposed) break;
      if (!registration.listener) continue;
      try {
        registration.listener();
      } catch (cause) {
        errors.push(cause);
      }
    }
    return errors;
  }
  #diagnostic(value: LayoutError) {
    return Object.freeze({
      code: value.code,
      origin: "layout_service" as const,
      message: value.message,
    });
  }
  #live(task: Task): boolean {
    return (
      !this.#disposed &&
      !this.#graph.disposed &&
      task.active &&
      this.#task === task &&
      this.#graph.state.revision === task.identity.graphRevision
    );
  }
  #withdraw(task: Task, cause?: LayoutError): void {
    task.active = false;
    if (this.#task === task) this.#task = undefined;
    task.command.waiting = false;
    if (cause) task.command.failure = cause;
  }
  #clean(task: Task): unknown[] {
    this.#tasks.delete(task);
    // Release attempt-only expectations before invoking any external Worker cleanup.
    task.encoding = undefined;
    if (task.timer !== undefined) clearTimeout(task.timer);
    task.timer = undefined;
    const resource = task.resource;
    task.resource = undefined;
    const errors = resource?.close() ?? [];
    if (errors.length) {
      const prior = task.command.failure;
      task.command.failure = layoutCause(
        error(prior === undefined ? "worker_failure" : failure(prior).code),
        new AggregateError(errors, "Layout resource cleanup failed", {
          cause: prior,
        }),
      );
    }
    return errors;
  }
  #start(input: RuntimeInput, cmd: Command): void {
    // BigInt allocation cannot wrap; identity is allocated before retiring the old task.
    const identity = Object.freeze({
      ...this.#base(),
      taskId: `layout:${++nextTask}` as LayoutTaskId,
      ...(input.projectionId === undefined ? {} : { projectionId: input.projectionId }),
    });
    if (this.#task) {
      const old = this.#task;
      this.#withdraw(old, error("superseded"));
      this.#clean(old);
    }
    this.#guard(identity.graphRevision);
    this.#lastInput = input;
    const task: Task = {
      identity,
      input,
      command: cmd,
      active: true,
      timer: undefined,
      resource: undefined,
      encoding: undefined,
    };
    this.#task = task;
    this.#tasks.add(task);
    cmd.waiting = true;
    this.#state = Object.freeze({
      ...this.#base(),
      status: "pending",
      request: identity,
      result: this.#state.result,
    });
    task.timer = setTimeout(
      () => this.#complete(task, undefined, error("timeout")),
      this.#options.timeoutMs,
    );
    cmd.errors.push(...this.#notify());
    if (!this.#live(task)) return;
    if (!input.nodes.length) {
      this.#complete(
        task,
        Object.freeze({
          ...identity,
          direction: input.projection.direction,
          width: 0,
          height: 0,
          nodes: Object.freeze([]),
          edges: Object.freeze([]),
        }),
      );
      return;
    }
    try {
      const worker = this.#options.workerFactory();
      const resource = new LayoutWorker(worker, (kind, cause) =>
        this.#complete(task, undefined, layoutCause(error(kind), cause)),
      );
      task.resource = resource;
      // Factory can synchronously dispose the graph before returning its owned resource.
      if (!this.#live(task)) {
        this.#clean(task);
        return;
      }
      task.encoding = encodeLayout(input);
      resource.start(elkProjection(input, task.encoding), (raw) => {
        if (!this.#live(task)) return;
        this.#depth++;
        try {
          const result = readLayoutResult(
            raw,
            input,
            identity,
            () => this.#guard(identity.graphRevision),
            this.#mode === "folded",
            task.encoding!,
          );
          this.#complete(task, result);
        } catch (cause) {
          this.#caught(task, failure(cause));
        } finally {
          this.#depth--;
          this.#settle();
        }
      });
    } catch (cause) {
      let rejected = layoutCause(error("worker_failure"), cause);
      try {
        this.#guard(identity.graphRevision);
      } catch (stateError) {
        rejected = layoutCause(failure(stateError), cause);
      }
      this.#caught(task, rejected);
    }
  }
  #caught(task: Task, cause: LayoutError): void {
    if (this.#live(task)) this.#complete(task, undefined, cause);
    // Synchronous host reentry may withdraw the task while this outer transaction
    // still owns its waiter. Keep the access exception under the lifecycle error.
    else if (!task.command.settled) task.command.failure = cause;
  }
  #complete(task: Task, result?: RuntimeResult, cause?: LayoutError): void {
    if (!this.#live(task)) return;
    this.#depth++;
    try {
      this.#withdraw(task, cause);
      this.#clean(task);
      if (this.#disposed) return;
      if (this.#graph.state.revision !== task.identity.graphRevision) {
        if (task.command.failure === undefined) task.command.failure = error("stale_graph");
        return;
      }
      const rejected = task.command.failure;
      this.#state =
        rejected !== undefined
          ? Object.freeze({
              ...this.#base(),
              status: "failed",
              request: task.identity,
              result: this.#state.result,
              error: this.#diagnostic(failure(rejected)),
            })
          : Object.freeze({
              ...this.#base(),
              status: "success",
              request: task.identity,
              result: result!,
            });
      task.command.errors.push(...this.#notify());
    } finally {
      this.#depth--;
      this.#settle();
    }
  }
  /** Phase one changes every binding's eligibility before any host cleanup/notification. */
  #prepareGraph(state: GraphSessionState, disposed: boolean): () => unknown[] {
    if (this.#disposed) return () => [];
    this.#depth++;
    if (this.#task) this.#withdraw(this.#task, error(disposed ? "disposed" : "stale_graph"));
    const retiring = [...this.#tasks];
    if (disposed) {
      this.#disposed = true;
      this.#lastInput = undefined;
      this.#state = Object.freeze({
        ...this.#base(),
        status: "disposed",
        request: null,
        result: null,
      });
      for (const r of this.#listeners) r.listener = undefined;
      this.#listeners.clear();
      this.#unbind();
    } else {
      this.#state = Object.freeze({
        ...this.#base(),
        graphRevision: state.revision,
        status: this.#lastInput ? "stale" : "idle",
        request: null,
        result: this.#state.result,
      });
    }
    return () => {
      const errors: unknown[] = [];
      try {
        for (const task of retiring) errors.push(...this.#clean(task));
        if (!this.#disposed) errors.push(...this.#notify());
      } finally {
        this.#depth--;
        this.#settle();
      }
      return errors;
    };
  }
}
