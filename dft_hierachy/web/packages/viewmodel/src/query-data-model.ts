import { isHierError } from "@hier/client";
import type { HierError } from "@hier/client";
import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { captureDiagnosticData } from "./diagnostic-data.js";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { hasModelErrorBrand } from "./model-error-brand.js";
import { registerQueryScope } from "./query-coordination.js";

export type QueryErrorCode =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";
type ModelError<Code extends string> = Error & { readonly code: Code };
type TaskError<Code extends string> = ModelError<Code> | HierError;
export interface QueryFailure<Origin extends string, Code extends string> {
  readonly code: Code | HierError["code"];
  readonly origin: Origin | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}
/** Internal task operations; only current tasks may query or commit. */
export interface TargetLoad<Target, Data> {
  readonly target: Target;
  observe<T>(
    query: (client: HierClient, signal: AbortSignal) => Promise<T>,
    accept: (reply: T) => void,
  ): void;
  complete(data: Data): void;
}
export interface QueryDataPolicy<
  Target,
  Data,
  Origin extends string,
  State,
  Code extends string,
> {
  readonly Error: new (
    code: QueryErrorCode,
    message: string,
  ) => ModelError<Code>;
  readonly states: QueryStates<Target, Data, Origin, State, Code>;
  readonly origin: Origin;
  readonly label: string;
  readonly replyName: string;
  retainFailure?(error: TaskError<Code>): boolean;
  sameTarget(left: Target, right: Target): boolean;
  begin(task: TargetLoad<Target, Data>): void;
}
/** State projections contain domain data; task/notification mechanics stay here. */
export interface QueryStates<
  Target,
  Data,
  Origin extends string,
  State,
  Code extends string,
> {
  readonly idle: State;
  target(state: State): Target | null;
  status(state: State): "idle" | "pending" | "success" | "failed" | "cancelled";
  pending(target: Target): State;
  success(target: Target, data: Data): State;
  failure(
    target: Target,
    error: QueryFailure<Origin, Code>,
    previous: State,
  ): State;
}
interface Command<Code extends string> {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly errors: unknown[];
  failure: TaskError<Code> | undefined;
  settled: boolean;
}
interface LoadTask<Target, Code extends string> {
  readonly target: Target;
  readonly command: Command<Code>;
  readonly controller: AbortController;
  active: boolean;
}
interface Registration {
  listener: (() => void) | undefined;
}
function command<Code extends string>(): Command<Code> {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Keep the original rejection observable to callers, including joined callers.
  void promise.catch(() => {});
  return {
    promise,
    resolve,
    reject,
    errors: [],
    failure: undefined,
    settled: false,
  };
}
/** Shared query/task, notification and release semantics (DESIGN 6.9–6.11). */
export class QueryDataModel<
  Target,
  Data,
  Origin extends string,
  State,
  Code extends string = QueryErrorCode,
> {
  readonly #snapshotId: SnapshotId;
  #client: HierClient | undefined;
  #state: State;
  #failure: TaskError<Code> | undefined;
  #readingInput = false;
  #disposed = false;
  #notifying = false;
  #readingDiagnostic = false;
  #task: LoadTask<Target, Code> | undefined;
  readonly #commands = new Set<Command<Code>>();
  readonly #listeners = new Set<Registration>();
  readonly #commandRecords = new WeakMap<Promise<void>, Command<Code>>();
  #currentCommand: Command<Code> | undefined;

  constructor(
    client: HierClient,
    readonly policy: QueryDataPolicy<Target, Data, Origin, State, Code>,
    snapshotId: SnapshotId = client.snapshot.snapshotId,
  ) {
    this.#snapshotId = snapshotId;
    this.#client = client;
    this.#state = policy.states.idle;
    const model = this;
    registerQueryScope(this, {
      get busy() {
        return (
          model.#readingInput || model.#notifying || model.#readingDiagnostic
        );
      },
      get current() {
        return model.#currentCommand;
      },
      command: (promise) => this.#commandRecords.get(promise),
    });
  }
  get snapshotId(): SnapshotId {
    return this.#snapshotId;
  }
  get state(): State {
    return this.#state;
  }
  get disposed(): boolean {
    return this.#disposed;
  }

  load(validateTarget: () => Target): Promise<void> {
    return this.#invoke(() => {
      let target: Target;
      this.#readingInput = true;
      try {
        target = validateTarget();
        this.#assertActive();
      } finally {
        this.#readingInput = false;
      }
      const current = this.policy.states.target(this.#state);
      if (current !== null && this.policy.sameTarget(current, target)) {
        if (this.policy.states.status(this.#state) === "pending")
          return this.#task!.command.promise;
        if (this.policy.states.status(this.#state) === "success")
          return Promise.resolve();
      }
      return this.#start(target);
    });
  }
  reload(): Promise<void> {
    return this.#invoke(() => {
      const target = this.policy.states.target(this.#state);
      return target === null ? Promise.resolve() : this.#start(target);
    });
  }
  continue(
    next: (
      state: State,
      failure: TaskError<Code> | undefined,
    ) => Target | undefined,
  ): Promise<void> {
    return this.#invoke(() => {
      if (this.policy.states.status(this.#state) === "pending")
        return this.#task!.command.promise;
      const target = next(this.#state, this.#failure);
      return target === undefined ? Promise.resolve() : this.#start(target);
    });
  }
  cancel(): Promise<void> {
    return this.#invoke(() => {
      if (this.policy.states.status(this.#state) !== "pending")
        return Promise.resolve();
      const action = this.#newCommand();
      const old = this.#withdraw();
      const failure = this.#diagnostic(old!.failure!, old!);
      if (failure)
        this.#publish(
          this.policy.states.failure(
            this.policy.states.target(this.#state)!,
            failure,
            this.#state,
          ),
          action,
        );
      this.#finish(old!);
      this.#finish(action);
      return action.promise;
    });
  }
  clear(): Promise<void> {
    return this.#invoke(() => {
      if (this.policy.states.status(this.#state) === "idle")
        return Promise.resolve();
      const action = this.#newCommand();
      const old = this.#withdraw();
      this.#failure = undefined;
      this.#publish(this.policy.states.idle, action);
      if (old) this.#finish(old);
      this.#finish(action);
      return action.promise;
    });
  }
  subscribe(listener: () => void): Unsubscribe {
    this.#assertActive();
    if (typeof listener !== "function")
      throw new this.policy.Error(
        "invalid_argument",
        `${this.policy.label} listener must be a function`,
      );
    const registration: Registration = { listener };
    this.#listeners.add(registration);
    return () => {
      registration.listener = undefined;
      this.#listeners.delete(registration);
    };
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#task) {
      this.#task.active = false;
      this.#task.controller.abort();
      this.#task = undefined;
    }
    this.#state = this.policy.states.idle;
    this.#failure = undefined;
    for (const registration of this.#listeners)
      registration.listener = undefined;
    this.#listeners.clear();
    this.#client = undefined;
    // Commands survive query completion, diagnostic capture and notification.
    for (const pending of this.#commands) this.#finish(pending);
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new this.policy.Error(
        "disposed",
        `${this.policy.label} model is disposed`,
      );
  }
  #invoke(action: () => Promise<void>): Promise<void> {
    try {
      this.#assertActive();
      if (this.#notifying || this.#readingDiagnostic || this.#readingInput)
        throw new this.policy.Error(
          "reentrant_change",
          `Cannot change ${this.policy.label.toLowerCase()} while notifying or reading input/diagnostics`,
        );
      return action();
    } catch (error) {
      const rejected = command<Code>();
      rejected.reject(error);
      return rejected.promise;
    }
  }
  #newCommand(): Command<Code> {
    const pending = command<Code>();
    this.#commands.add(pending);
    this.#commandRecords.set(pending.promise, pending);
    return pending;
  }
  #finish(pending: Command<Code>): void {
    if (pending.settled) return;
    let error: unknown = pending.failure;
    if (pending.errors.length)
      error = new AggregateError(
        pending.errors,
        `${this.policy.label} listeners failed`,
        error === undefined ? undefined : { cause: error },
      );
    if (this.#disposed) {
      const disposed = new this.policy.Error(
        "disposed",
        `${this.policy.label} model is disposed`,
      );
      if (error !== undefined)
        Object.defineProperty(disposed, "cause", {
          value: error,
          configurable: true,
          writable: true,
        });
      error = disposed;
    }
    pending.settled = true;
    this.#commands.delete(pending);
    if (error === undefined) pending.resolve();
    else pending.reject(error);
  }
  #publish(state: State, pending: Command<Code>): void {
    if (this.#disposed) return;
    this.#state = state;
    const eligible = [...this.#listeners];
    const previousCommand = this.#currentCommand;
    this.#currentCommand = pending;
    this.#notifying = true;
    try {
      for (const registration of eligible) {
        if (this.#disposed) break;
        if (!registration.listener) continue;
        try {
          registration.listener();
        } catch (error) {
          pending.errors.push(error);
        }
      }
    } finally {
      this.#notifying = false;
      this.#currentCommand = previousCommand;
    }
  }
  #withdraw(): Command<Code> | undefined {
    const old = this.#task;
    if (!old) return undefined;
    this.#task = undefined;
    old.active = false;
    old.command.failure = new this.policy.Error(
      "cancelled",
      `${this.policy.label} load was cancelled`,
    );
    this.#failure = undefined;
    old.controller.abort();
    return old.command;
  }
  #start(target: Target): Promise<void> {
    const pending = this.#newCommand();
    const old = this.#withdraw();
    const task: LoadTask<Target, Code> = {
      target,
      command: pending,
      controller: new AbortController(),
      active: true,
    };
    this.#task = task;
    this.#failure = undefined;
    this.#publish(this.policy.states.pending(target), pending);
    if (old) this.#finish(old);
    if (this.#current(task)) {
      try {
        this.policy.begin({
          target,
          observe: (query, accept) =>
            this.#observe(
              task,
              () => query(this.#client!, task.controller.signal),
              accept,
            ),
          complete: (data) => this.#complete(task, data),
        });
      } catch (error) {
        this.#fail(task, this.#taskError(error));
      }
    }
    return pending.promise;
  }
  #current(task: LoadTask<Target, Code>): boolean {
    return !this.#disposed && task.active && this.#task === task;
  }
  #observe<T>(
    task: LoadTask<Target, Code>,
    query: () => Promise<T>,
    accept: (reply: T) => void,
  ): void {
    if (!this.#current(task)) return;
    try {
      void query().then(
        (reply) => {
          if (!this.#current(task)) return;
          try {
            accept(reply);
          } catch (error) {
            this.#fail(task, this.#taskError(error));
          }
        },
        (error) => {
          if (this.#current(task)) this.#fail(task, this.#taskError(error));
        },
      );
    } catch (error) {
      this.#fail(task, this.#taskError(error));
    }
  }
  #complete(task: LoadTask<Target, Code>, data: Data): void {
    if (!this.#current(task)) return;
    task.active = false;
    this.#publish(this.policy.states.success(task.target, data), task.command);
    this.#finish(task.command);
    if (this.#task === task) this.#task = undefined;
  }
  #taskError(value: unknown): TaskError<Code> {
    if (isHierError(value)) return value;
    // Constructors register their own instances; no prototype/property probes.
    if (hasModelErrorBrand(value, this.policy.Error))
      return value as ModelError<Code>;
    const error = new this.policy.Error(
      "inconsistent_reply",
      `Cannot process ${this.policy.replyName} reply`,
    );
    Object.defineProperty(error, "cause", {
      value,
      configurable: true,
      writable: true,
    });
    return error;
  }
  #diagnostic(
    error: TaskError<Code>,
    pending: Command<Code>,
  ): QueryFailure<Origin, Code> | undefined {
    const previousCommand = this.#currentCommand;
    this.#currentCommand = pending;
    this.#readingDiagnostic = true;
    try {
      const fields = {
        code: error.code,
        origin: isHierError(error) ? error.origin : this.policy.origin,
        message: error.message,
      } as const;
      const data = isHierError(error)
        ? captureDiagnosticData(error, () => this.#disposed)
        : { data: Object.freeze({}) };
      return data === undefined || this.#disposed
        ? undefined
        : Object.freeze({ ...fields, ...data });
    } finally {
      this.#readingDiagnostic = false;
      this.#currentCommand = previousCommand;
    }
  }
  #fail(task: LoadTask<Target, Code>, error: TaskError<Code>): void {
    if (!this.#current(task)) return;
    task.active = false;
    task.command.failure = error;
    // Only a domain recovery rule can retain an original failure after settling.
    // Single-result models keep no extra raw error / caller data reference.
    this.#failure = this.policy.retainFailure?.(error) ? error : undefined;
    task.controller.abort();
    const diagnostic = this.#diagnostic(error, task.command);
    if (diagnostic && !this.#disposed && this.#task === task)
      this.#publish(
        this.policy.states.failure(task.target, diagnostic, this.#state),
        task.command,
      );
    this.#finish(task.command);
    if (this.#task === task) this.#task = undefined;
  }
}
