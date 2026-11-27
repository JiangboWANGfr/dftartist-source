import { isHierError } from "@hier/client";
import type { HierClient, HierError, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { captureDiagnosticData } from "./diagnostic-data.js";
import { hasModelErrorBrand } from "./model-error-brand.js";
import { readGraphFragment, readGraphSource } from "./graph-input.js";
import { initializeGraphBindings, prepareGraphBindings } from "./graph-lifecycle.js";
import { replaceGraphMembers } from "./graph-members.js";
import { GraphSessionError } from "./graph-types.js";
import type {
  GraphSessionId,
  GraphSourceId,
  GraphSourceOptions,
  GraphSourceState,
  GraphSessionState,
  GraphSource,
  GraphFragment,
  GraphLoader,
  GraphSourceFailure,
} from "./graph-types.js";

interface Command {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  errors: unknown[];
  failure: unknown;
  settled: boolean;
  waiting: boolean;
}
interface Source {
  readonly id: GraphSourceId;
  readonly order: bigint;
  readonly options: GraphSourceOptions;
  state: GraphSourceState;
  published: boolean;
  task: Task | undefined;
}
interface Task {
  readonly source: Source;
  readonly revision: number;
  readonly command: Command;
  readonly controller: AbortController;
  active: boolean;
}
interface Registration {
  listener: (() => void) | undefined;
}
type Failure = GraphSessionError | HierError;
let nextSession = 0n;
const error = (
  code: ConstructorParameters<typeof GraphSessionError>[0],
  message: string,
): GraphSessionError => new GraphSessionError(code, message);
function caused(failure: GraphSessionError, cause: unknown): GraphSessionError {
  Object.defineProperty(failure, "cause", { value: cause, configurable: true, writable: true });
  return failure;
}
function command(): Command {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Withdrawal may settle before a caller attaches its next continuation.
  void promise.catch(() => {});
  return {
    promise,
    resolve,
    reject,
    errors: [],
    failure: undefined,
    settled: false,
    waiting: false,
  };
}

/** Source-owned semantic graph. Borrows the ready snapshot, never the transport
 * or SelectionModel. No query/layout policy lives in this collection. */
export class GraphSession {
  readonly id: GraphSessionId;
  readonly snapshotId: SnapshotId;
  #state: GraphSessionState;
  #disposed = false;
  #busy = false;
  #current: Command | undefined;
  #nextSource = 0n;
  #sources = new Map<GraphSourceId, Source>();
  #listeners = new Set<Registration>();
  #commands = new Set<Command>();
  #reserved = 0;

  constructor(client: HierClient) {
    this.snapshotId = client.snapshot.snapshotId;
    this.id = `graph:${++nextSession}` as GraphSessionId;
    this.#state = Object.freeze({
      sessionId: this.id,
      snapshotId: this.snapshotId,
      revision: 0,
      sources: Object.freeze([]),
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
    });
    initializeGraphBindings(this);
  }
  get state(): GraphSessionState {
    return this.#state;
  }
  get disposed(): boolean {
    return this.#disposed;
  }

  registerSource(options: GraphSourceOptions): GraphSource {
    this.#assertMutable();
    this.#busy = true;
    try {
      const owned = readGraphSource(options, () => this.#disposed);
      const order = ++this.#nextSource;
      const id = `${this.id}/source:${order}` as GraphSourceId;
      const source: Source = {
        id,
        order,
        options: owned,
        published: false,
        task: undefined,
        state: Object.freeze({ id, ...owned, revision: 0, status: "idle", content: null }),
      };
      this.#sources.set(id, source);
      return Object.freeze({
        id,
        get state() {
          return source.state;
        },
        get disposed() {
          return source.state.status === "disposed";
        },
        replace: (fragment: GraphFragment) =>
          this.#run(source, (cmd) => this.#replace(source, fragment, cmd)),
        refresh: (loader: GraphLoader) => {
          let task: Task | undefined;
          const promise = this.#run(source, (cmd) => {
            task = this.#refresh(source, loader, cmd);
          });
          if (task && this.#live(task)) this.#load(task, loader);
          return promise;
        },
        cancel: () => this.#run(source, (cmd) => this.#remove(source, "cancel", cmd)),
        clear: () => this.#run(source, (cmd) => this.#remove(source, "clear", cmd)),
        dispose: () =>
          source.state.status === "disposed"
            ? Promise.resolve()
            : this.#run(source, (cmd) => this.#remove(source, "dispose", cmd)),
      });
    } finally {
      this.#busy = false;
    }
  }
  subscribe(listener: () => void): Unsubscribe {
    this.#assertActive();
    if (typeof listener !== "function")
      throw error("invalid_argument", "Graph listener must be a function");
    const registration = { listener } as Registration;
    this.#listeners.add(registration);
    return () => {
      registration.listener = undefined;
      this.#listeners.delete(registration);
    };
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const tasks: Task[] = [];
    for (const source of this.#sources.values()) {
      if (source.task) {
        source.task.active = false;
        tasks.push(source.task);
        source.task = undefined;
      }
      source.state = Object.freeze({
        id: source.id,
        ...source.options,
        revision: source.state.revision,
        status: "disposed",
        content: null,
      });
    }
    this.#sources.clear();
    this.#reserved = 0;
    for (const r of this.#listeners) r.listener = undefined;
    this.#listeners.clear();
    this.#state = Object.freeze({
      ...this.#state,
      sources: Object.freeze([]),
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
    });
    const flushLayouts = prepareGraphBindings(this, true);
    // Close all eligibility and public state before invoking external abort handlers.
    for (const task of tasks) task.controller.abort();
    const errors = flushLayouts();
    for (const cmd of this.#commands) if (cmd !== this.#current) this.#finish(cmd);
    if (errors.length) throw new AggregateError(errors, "Graph layout cleanup failed");
  }
  #assertActive(): void {
    if (this.#disposed) throw error("disposed", "Graph session is disposed");
  }
  #assertMutable(): void {
    this.#assertActive();
    if (this.#busy)
      throw error(
        "reentrant_change",
        "Cannot change graph sources during an input, notification or diagnostic transaction",
      );
  }
  #run(source: Source, action: (cmd: Command) => void): Promise<void> {
    const cmd = command();
    try {
      this.#assertActive();
      if (source.state.status === "disposed")
        throw error("source_disposed", "Graph source is disposed");
      this.#assertMutable();
    } catch (failure) {
      cmd.failure = failure;
      this.#finish(cmd);
      return cmd.promise;
    }
    this.#commands.add(cmd);
    this.#busy = true;
    this.#current = cmd;
    try {
      action(cmd);
    } catch (failure) {
      cmd.failure = failure;
    } finally {
      this.#busy = false;
      this.#current = undefined;
    }
    // Withdrawn waiters remain commands until this transaction's notification
    // ends, so disposal there can take over and retain their earlier errors.
    for (const pending of this.#commands)
      if (!pending.waiting || this.#disposed) this.#finish(pending);
    return cmd.promise;
  }
  #finish(cmd: Command): void {
    if (cmd.settled) return;
    let failure = cmd.failure;
    if (cmd.errors.length)
      failure = new AggregateError(
        cmd.errors,
        "Graph listeners failed",
        failure === undefined ? undefined : { cause: failure },
      );
    if (this.#disposed) {
      const disposed = error("disposed", "Graph session is disposed");
      failure = failure === undefined ? disposed : caused(disposed, failure);
    }
    cmd.settled = true;
    this.#commands.delete(cmd);
    if (failure === undefined) cmd.resolve();
    else cmd.reject(failure);
  }
  #nextRevision(source: Source, refresh: boolean): number {
    const remaining = Number.MAX_SAFE_INTEGER - this.#state.revision;
    // An old task's reservation is replaced by this intent, never double-counted.
    const reserved = this.#reserved - (source.task ? 1 : 0);
    if (
      source.state.revision >= Number.MAX_SAFE_INTEGER ||
      remaining < reserved + (refresh ? 2 : 1)
    )
      throw error("revision_exhausted", "Graph revision capacity exhausted");
    return source.state.revision + 1;
  }
  #withdraw(source: Source, code: "cancelled" | "source_disposed"): void {
    const task = source.task;
    if (!task) return;
    source.task = undefined;
    task.active = false;
    this.#reserved--;
    task.command.failure = error(code, "Graph source load was withdrawn");
    task.command.waiting = false;
    task.controller.abort();
  }
  #members(source: Source, fragment: GraphFragment | null, revision: number) {
    return replaceGraphMembers(
      this.#state,
      source.id,
      fragment,
      revision,
      (id) => this.#sources.get(id)!.order,
    );
  }
  #replace(source: Source, input: unknown, cmd: Command): void {
    const fragment = readGraphFragment(
      input,
      source.options,
      this.snapshotId,
      () => this.#disposed,
    );
    const revision = this.#nextRevision(source, false);
    const members = this.#members(source, fragment, revision);
    this.#withdraw(source, "cancelled");
    if (this.#disposed) return;
    source.state = Object.freeze({
      id: source.id,
      ...source.options,
      revision,
      status: "success",
      content: members.content!,
    });
    source.published = true;
    this.#publish(members, cmd);
  }
  #remove(source: Source, kind: "cancel" | "clear" | "dispose", cmd: Command): void {
    if (kind === "cancel" && !source.task) return;
    const revision = this.#nextRevision(source, false);
    const members = kind === "cancel" ? this.#state : this.#members(source, null, revision);
    this.#withdraw(source, kind === "dispose" ? "source_disposed" : "cancelled");
    if (this.#disposed) return;
    const base = { id: source.id, ...source.options, revision };
    source.state =
      kind === "cancel"
        ? Object.freeze({
            ...base,
            status: "cancelled",
            content: source.state.content,
            error: Object.freeze({
              code: "cancelled",
              origin: "graph_session",
              message: "Graph source load was cancelled",
              data: Object.freeze({}),
            }),
          })
        : Object.freeze({ ...base, status: kind === "clear" ? "idle" : "disposed", content: null });
    source.published = true;
    if (kind === "dispose") this.#sources.delete(source.id);
    this.#publish(members, cmd);
  }
  #refresh(source: Source, loader: GraphLoader, cmd: Command): Task | undefined {
    if (typeof loader !== "function")
      throw error("invalid_argument", "Graph loader must be a function");
    const revision = this.#nextRevision(source, true);
    this.#withdraw(source, "cancelled");
    if (this.#disposed) return undefined;
    const task: Task = {
      source,
      revision,
      command: cmd,
      controller: new AbortController(),
      active: true,
    };
    source.task = task;
    this.#reserved++;
    cmd.waiting = true;
    source.state = Object.freeze({
      id: source.id,
      ...source.options,
      revision,
      status: "pending",
      content: source.state.content,
    });
    source.published = true;
    this.#publish(this.#state, cmd);
    return task;
  }
  #live(task: Task): boolean {
    return (
      !this.#disposed &&
      task.active &&
      task.source.task === task &&
      task.source.state.revision === task.revision
    );
  }
  #load(task: Task, loader: GraphLoader): void {
    try {
      const value = loader(
        Object.freeze({
          sessionId: this.id,
          snapshotId: this.snapshotId,
          sourceId: task.source.id,
          sourceRevision: task.revision,
          signal: task.controller.signal,
        }),
      );
      // Always adopt even after provider reentry withdraws the task, consuming late rejection.
      void Promise.resolve(value).then(
        (fragment) => this.#complete(task, { fragment }),
        (failure: unknown) => this.#complete(task, { failure }),
      );
    } catch (failure) {
      this.#complete(task, { failure });
    }
  }
  #taskError(value: unknown): Failure {
    if (isHierError(value)) return value;
    if (hasModelErrorBrand(value, GraphSessionError)) return value as GraphSessionError;
    return caused(error("source_failure", "Graph source provider failed"), value);
  }
  #diagnostic(failure: Failure): GraphSourceFailure | undefined {
    const fields = {
      code: failure.code,
      origin: isHierError(failure) ? failure.origin : ("graph_session" as const),
      message: failure.message,
    };
    const data = isHierError(failure)
      ? captureDiagnosticData(failure, () => this.#disposed)
      : { data: Object.freeze({}) };
    return this.#disposed || !data ? undefined : Object.freeze({ ...fields, ...data });
  }
  #complete(task: Task, outcome: { fragment: unknown } | { failure: unknown }): void {
    if (!this.#live(task)) return;
    const source = task.source,
      cmd = task.command;
    this.#busy = true;
    this.#current = cmd;
    try {
      if ("failure" in outcome) throw this.#taskError(outcome.failure);
      const fragment = readGraphFragment(
        outcome.fragment,
        source.options,
        this.snapshotId,
        () => this.#disposed,
      );
      const members = this.#members(source, fragment, task.revision);
      this.#releaseTask(task);
      source.state = Object.freeze({
        id: source.id,
        ...source.options,
        revision: task.revision,
        status: "success",
        content: members.content!,
      });
      this.#publish(members, cmd);
    } catch (caught) {
      const failure = this.#taskError(caught);
      cmd.failure = failure;
      this.#releaseTask(task);
      if (!this.#disposed) {
        const diagnostic = this.#diagnostic(failure);
        if (diagnostic) {
          source.state = Object.freeze({
            id: source.id,
            ...source.options,
            revision: task.revision,
            status: failure.code === "cancelled" ? "cancelled" : "failed",
            content: source.state.content,
            error: diagnostic,
          });
          this.#publish(this.#state, cmd);
        }
      }
    } finally {
      this.#busy = false;
      this.#current = undefined;
      this.#finish(cmd);
    }
  }
  #releaseTask(task: Task): void {
    if (task.source.task === task) {
      task.source.task = undefined;
      this.#reserved--;
    }
    task.active = false;
    task.command.waiting = false;
  }
  #publish(members: Pick<GraphSessionState, "nodes" | "edges">, cmd: Command): void {
    if (this.#disposed) return;
    this.#state = Object.freeze({
      sessionId: this.id,
      snapshotId: this.snapshotId,
      revision: this.#state.revision + 1,
      sources: Object.freeze(
        [...this.#sources.values()]
          .filter((source) => source.published)
          .map((source) => source.state),
      ),
      nodes: members.nodes,
      edges: members.edges,
    });
    const listeners = [...this.#listeners];
    const flushLayouts = prepareGraphBindings(this, false);
    cmd.errors.push(...flushLayouts());
    for (const registration of listeners) {
      if (this.#disposed) break;
      if (!registration.listener) continue;
      try {
        registration.listener();
      } catch (failure) {
        cmd.errors.push(failure);
      }
    }
  }
}
