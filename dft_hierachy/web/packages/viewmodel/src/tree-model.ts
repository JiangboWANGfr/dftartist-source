import { HierError } from "@hier/client";
import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import { validateDefinition } from "@hier/protocol-types";
import type {
  InstInfo,
  InstInfoPage,
  ObjectRef,
  SnapshotId,
} from "@hier/protocol-types";
import { readTreeOptions } from "./tree-input.js";
import {
  TreeData,
  checkChild,
  inconsistent,
  pathPrefix,
  treeFailure,
} from "./tree-data.js";
import type { TreeNode, TreePage, TreeTaskError } from "./tree-data.js";
import { TreeError } from "./tree-types.js";
import type {
  InstanceTreeRow,
  RowId,
  ScopeTreeRow,
  TreeCompleteness,
  TreeFailure,
  TreeOptions,
  TreePageState,
  TreeRevealState,
  TreeRow,
} from "./tree-types.js";

function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // The returned original Promise still rejects for its caller. Internal work has
  // a rejection observer even if an owner disposes before attaching its await.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
type Completion = ReturnType<typeof deferred>;
interface Command {
  readonly completion: Completion;
  readonly errors: unknown[];
  failure: TreeTaskError | undefined;
  settled: boolean;
}
interface PageTask {
  readonly page: TreePage;
  readonly controller: AbortController;
  readonly command: Command;
  readonly waiters: Set<Command>;
  readonly reveal: RevealTask | undefined;
  readonly completion: Completion;
  active: boolean;
}
interface RevealTask {
  readonly ref: string;
  readonly command: Command;
  readonly controller: AbortController;
  active: boolean;
}
interface Registration {
  listener: (() => void) | undefined;
}

function taskError(value: unknown): TreeTaskError {
  if (value instanceof TreeError || value instanceof HierError) return value;
  const error = new TreeError(
    "inconsistent_reply",
    "Cannot process tree query reply",
  );
  Object.defineProperty(error, "cause", {
    value,
    writable: true,
    configurable: true,
  });
  return error;
}

/** One snapshot's remote navigation state. The host owns the shared HierClient. */
export class TreeModel {
  readonly #snapshotId: SnapshotId;
  readonly #pageSize: number | undefined;
  #client: HierClient | undefined;
  readonly #data = new TreeData();
  readonly #commands = new Set<Command>();
  readonly #pages = new Map<TreePage, PageTask>();
  readonly #listeners = new Set<Registration>();
  #reveal: RevealTask | undefined;
  #revealState: TreeRevealState = Object.freeze({ status: "idle" });
  #showScopes: boolean;
  #disposed = false;
  #notifying = false;
  #readingDiagnostic = false;
  #dirty = false;

  constructor(client: HierClient, options?: TreeOptions) {
    const captured = readTreeOptions(options);
    this.#snapshotId = client.snapshot.snapshotId;
    this.#client = client;
    this.#pageSize = captured.pageSize;
    this.#showScopes = captured.showGenerateScopes!;
    this.#data.project(this.#showScopes);
  }
  get snapshotId(): SnapshotId {
    return this.#snapshotId;
  }
  get showGenerateScopes(): boolean {
    return this.#showScopes;
  }
  get rows(): readonly TreeRow[] {
    return this.#data.rows;
  }
  get rootState(): TreePageState {
    return this.#data.root.state;
  }
  get revealState(): TreeRevealState {
    return this.#revealState;
  }
  get disposed(): boolean {
    return this.#disposed;
  }

  loadRoots(): Promise<void> {
    return this.#command(
      () => {},
      (command) => {
        if (this.#data.root.state.status !== "success")
          return this.#loadPage(this.#data.root, command);
      },
    );
  }
  setExpanded(id: RowId, expanded: boolean): Promise<void> {
    let row!: InstanceTreeRow | ScopeTreeRow;
    return this.#command(
      () => {
        this.#boolean(expanded);
        const found = this.#row(id);
        if (found.kind === "status")
          throw new TreeError("invalid_row", "Status rows cannot expand");
        row = found;
      },
      (command) => {
        if (row.kind === "scope") {
          this.#dirty =
            this.#data.setExpanded(row.id, expanded, true) || this.#dirty;
          if (!expanded && this.#pages.size) {
            const owner = this.#data.nodes.get(row.owner)!;
            const prefix = [...owner.info.path, ...row.scopePath];
            for (const child of owner.page.items) {
              if (!this.#pages.size) break;
              if (pathPrefix(prefix, child.info.path))
                this.#cancelSubtree(child.materializedPage);
            }
          }
          return;
        }
        const node = this.#data.nodes.get(row.instance.ref)!;
        if (node.info.childCount === 0) return;
        this.#dirty =
          this.#data.setExpanded(row.id, expanded, false) || this.#dirty;
        if (!expanded) {
          this.#cancelSubtree(node.materializedPage);
          return;
        }
        if (node.page.error) throw node.page.error;
        if (
          node.page.state.status === "idle" ||
          node.page.state.status === "pending"
        )
          return this.#loadPage(node.page, command);
      },
    );
  }
  loadMore(id: RowId): Promise<void> {
    let page!: TreePage;
    return this.#command(
      () => {
        const row = this.#row(id);
        if (row.kind !== "instance" || !row.expanded)
          throw new TreeError(
            "invalid_row",
            "Only visible expanded instances can load more",
          );
        page = this.#data.nodes.get(row.instance.ref)!.page;
      },
      (command) => this.#loadPage(page, command),
    );
  }
  reload(id: RowId | null): Promise<void> {
    let page!: TreePage;
    return this.#command(
      () => {
        page = this.#page(id);
      },
      (command) => {
        this.#cancelSubtree(page);
        this.#data.clear(page);
        this.#dirty = true;
        return this.#loadPage(page, command);
      },
    );
  }
  cancel(id: RowId | null): Promise<void> {
    let page!: TreePage;
    return this.#command(
      () => {
        page = this.#page(id);
      },
      () => this.#cancelSubtree(page),
    );
  }
  setShowGenerateScopes(show: boolean): Promise<void> {
    return this.#command(
      () => this.#boolean(show),
      () => {
        if (this.#showScopes !== show) {
          this.#showScopes = show;
          this.#dirty = true;
        }
      },
    );
  }
  reveal(ref: ObjectRef): Promise<void> {
    return this.#command(
      () => {
        if (typeof ref !== "string" || !validateDefinition("ObjectRef", ref))
          throw new TreeError(
            "invalid_argument",
            "reveal requires a valid ObjectRef",
          );
      },
      (command) => {
        const task: RevealTask = {
          ref,
          command,
          controller: new AbortController(),
          active: true,
        };
        this.#reveal = task;
        this.#revealState = Object.freeze({ status: "pending", ref });
        this.#dirty = true;
        return this.#locate(task);
      },
    );
  }
  subscribe(listener: () => void): Unsubscribe {
    this.#assertActive();
    if (typeof listener !== "function")
      throw new TreeError(
        "invalid_argument",
        "Tree listener must be a function",
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
    if (this.#reveal) {
      this.#reveal.active = false;
      this.#reveal.controller.abort();
      this.#reveal = undefined;
    }
    for (const task of this.#pages.values()) {
      task.active = false;
      task.controller.abort();
      task.completion.reject(
        new TreeError("disposed", "Tree model is disposed"),
      );
    }
    this.#pages.clear();
    for (const command of this.#commands) this.#finish(command);
    for (const registration of this.#listeners)
      registration.listener = undefined;
    this.#listeners.clear();
    this.#data.dispose();
    this.#revealState = Object.freeze({ status: "idle" });
    this.#dirty = false;
    this.#client = undefined;
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new TreeError("disposed", "Tree model is disposed");
  }
  #boolean(value: boolean): void {
    if (typeof value !== "boolean")
      throw new TreeError("invalid_argument", "Tree intent must be a boolean");
  }
  #row(id: RowId): TreeRow {
    if (typeof id !== "string")
      throw new TreeError("invalid_argument", "A row ID must be a string");
    const row = this.#data.visible.get(id);
    if (!row)
      throw new TreeError(
        "invalid_row",
        "Row does not belong to this model's visible projection",
      );
    return row;
  }
  #page(id: RowId | null): TreePage {
    if (id === null) return this.#data.root;
    const row = this.#row(id);
    if (row.kind !== "instance")
      throw new TreeError(
        "invalid_row",
        "This command requires an instance row",
      );
    return this.#data.nodes.get(row.instance.ref)!.page;
  }
  #command(
    validate: () => void,
    action: (command: Command) => void | Promise<void>,
  ): Promise<void> {
    const command: Command = {
      completion: deferred(),
      errors: [],
      failure: undefined,
      settled: false,
    };
    try {
      this.#assertActive();
      if (this.#notifying || this.#readingDiagnostic)
        throw new TreeError(
          "reentrant_change",
          "Cannot change tree while notifying listeners or reading diagnostics",
        );
      validate();
    } catch (error) {
      command.completion.reject(error);
      return command.completion.promise;
    }
    this.#commands.add(command);
    this.#cancelReveal();
    let work: void | Promise<void> = undefined;
    try {
      work = action(command);
    } catch (error) {
      command.failure = taskError(error);
    }
    this.#flush(command);
    if (work)
      void work.then(
        () => this.#finish(command),
        (error) => this.#finish(command, taskError(error)),
      );
    else this.#finish(command);
    return command.completion.promise;
  }
  #finish(command: Command, failure?: TreeTaskError): void {
    if (command.settled) return;
    if (failure) command.failure = failure;
    let error: unknown = command.failure;
    if (command.errors.length)
      error = new AggregateError(
        command.errors,
        "Tree listeners failed",
        error === undefined ? undefined : { cause: error },
      );
    if (this.#disposed) {
      const disposed = new TreeError("disposed", "Tree model is disposed");
      if (error !== undefined)
        Object.defineProperty(disposed, "cause", {
          value: error,
          writable: true,
          configurable: true,
        });
      error = disposed;
    }
    command.settled = true;
    this.#commands.delete(command);
    for (const task of this.#pages.values()) task.waiters.delete(command);
    if (error === undefined) command.completion.resolve();
    else command.completion.reject(error);
  }
  #flush(command: Command): void {
    if (!this.#dirty || this.#disposed) return;
    this.#dirty = false;
    this.#data.project(this.#showScopes);
    const eligible = [...this.#listeners];
    this.#notifying = true;
    try {
      for (const registration of eligible) {
        if (this.#disposed) break;
        if (!registration.listener) continue;
        try {
          registration.listener();
        } catch (error) {
          command.errors.push(error);
        }
      }
    } finally {
      this.#notifying = false;
    }
  }
  #loadPage(
    page: TreePage,
    command: Command,
    reveal?: RevealTask,
  ): Promise<void> | undefined {
    this.#assertActive();
    const existing = this.#pages.get(page);
    if (existing) {
      existing.waiters.add(command);
      return existing.completion.promise;
    }
    if (page.state.status === "success" && page.state.next === undefined)
      return;
    const cursor = page.state.next;
    const task: PageTask = {
      page,
      command,
      reveal,
      controller: new AbortController(),
      waiters: new Set([command]),
      completion: deferred(),
      active: true,
    };
    this.#pages.set(page, task);
    this.#data.setState(page, { status: "pending" });
    this.#dirty = true;
    const pageOptions = {
      ...(cursor === undefined ? {} : { cursor }),
      ...(this.#pageSize === undefined ? {} : { limit: this.#pageSize }),
    };
    const request = page.owner
      ? this.#client!.children(
          page.owner.info.ref,
          pageOptions,
          task.controller.signal,
        )
      : this.#client!.roots(task.controller.signal);
    void request.then(
      (reply) => this.#receivePage(task, reply),
      (error) => this.#settlePage(task, taskError(error)),
    );
    return task.completion.promise;
  }
  #receivePage(task: PageTask, reply: Reply<InstInfo[] | InstInfoPage>): void {
    if (!task.active || this.#disposed) return;
    let failure: TreeTaskError | undefined;
    try {
      const result = reply.result;
      const items = task.page.owner
        ? (result as Reply<InstInfoPage>["result"]).items
        : (result as Reply<InstInfo[]>["result"]);
      const next = task.page.owner
        ? (result as Reply<InstInfoPage>["result"]).next
        : undefined;
      this.#data.append(
        task.page,
        items,
        reply.completeness as TreeCompleteness,
        next,
      );
    } catch (error) {
      failure = taskError(error);
    }
    this.#settlePage(task, failure);
  }
  #prepareFailure(error: TreeTaskError): TreeFailure | undefined {
    this.#readingDiagnostic = true;
    try {
      return treeFailure(error, () => this.#disposed);
    } finally {
      this.#readingDiagnostic = false;
    }
  }
  #settlePage(task: PageTask, failure?: TreeTaskError): void {
    if (!task.active || this.#disposed || this.#pages.get(task.page) !== task)
      return;
    if (failure) {
      // dispose inside diagnostic access must settle every waiter with this cause.
      for (const command of task.waiters) command.failure = failure;
      const diagnostic = this.#prepareFailure(failure);
      if (
        !diagnostic ||
        !task.active ||
        this.#disposed ||
        this.#pages.get(task.page) !== task
      )
        return;
      this.#data.setState(task.page, {
        status: "failed",
        error: failure,
        diagnostic,
      });
    }
    task.active = false;
    this.#pages.delete(task.page);
    this.#dirty = true;
    this.#flush(task.command);
    if (this.#disposed)
      task.completion.reject(
        new TreeError("disposed", "Tree model is disposed"),
      );
    else if (failure) task.completion.reject(failure);
    else task.completion.resolve();
  }
  #cancelPage(page: TreePage): void {
    const task = this.#pages.get(page);
    if (!task) return;
    const error = new TreeError("cancelled", "Tree page request was cancelled");
    task.active = false;
    this.#pages.delete(page);
    this.#data.setState(page, {
      status: "cancelled",
      error,
      diagnostic: treeFailure(error),
    });
    for (const command of task.waiters) command.failure = error;
    this.#dirty = true;
    task.controller.abort();
    task.completion.reject(error);
  }
  #cancelSubtree(page: TreePage | undefined): void {
    if (!page || !this.#pages.size) return;
    // A pending task necessarily owns a materialized page. Do not create
    // empty pages for untouched descendants merely to discover no task.
    for (const current of this.#data.subtree(page, true)) {
      this.#cancelPage(current);
      if (!this.#pages.size) break;
    }
  }
  #cancelReveal(): void {
    const task = this.#reveal;
    if (!task) return;
    task.active = false;
    this.#reveal = undefined;
    task.controller.abort();
    for (const pending of this.#pages.values())
      if (pending.reveal === task) this.#cancelPage(pending.page);
    const error = new TreeError(
      "cancelled",
      "Tree reveal was superseded by a new intent",
    );
    this.#revealState = Object.freeze({
      status: "cancelled",
      ref: task.ref,
      error: treeFailure(error),
    });
    this.#dirty = true;
    this.#finish(task.command, error);
  }
  #checkReveal(task: RevealTask): void {
    this.#assertActive();
    if (!task.active || this.#reveal !== task)
      throw new TreeError("cancelled", "Tree reveal is no longer current");
  }
  async #findInstance(
    page: TreePage,
    ref: string,
    task: RevealTask,
  ): Promise<TreeNode> {
    for (;;) {
      this.#checkReveal(task);
      const found = this.#data.nodes.get(ref);
      if (found?.parent === page.owner) return found;
      const pending = this.#loadPage(page, task.command, task);
      if (!pending)
        inconsistent(
          "Core ancestry target is absent from its complete sibling list",
        );
      this.#flush(task.command);
      await pending;
      this.#checkReveal(task);
    }
  }
  async #locate(task: RevealTask): Promise<void> {
    try {
      const object = await this.#client!.object(
        task.ref,
        task.controller.signal,
      );
      this.#checkReveal(task);
      if (object.result.ref !== task.ref)
        inconsistent("Object query returned a different reference");
      const target = object.result.inst;
      const ancestors = await this.#client!.ancestors(
        target,
        task.controller.signal,
      );
      this.#checkReveal(task);
      const chain = ancestors.result,
        seen = new Set([target]);
      for (let index = 0; index < chain.length; ++index) {
        const ancestor = chain[index]!;
        if (seen.has(ancestor.ref))
          inconsistent(
            "Ancestor chain repeats a reference or includes its target",
          );
        seen.add(ancestor.ref);
        if (index) checkChild(chain[index - 1]!, ancestor);
      }
      let page = this.#data.root;
      for (let index = 0; index <= chain.length; ++index) {
        this.#checkReveal(task);
        const expected = chain[index];
        const node = await this.#findInstance(
          page,
          expected?.ref ?? target,
          task,
        );
        this.#checkReveal(task);
        if (
          expected &&
          (node.info.childCount !== expected.childCount ||
            node.info.path.length !== expected.path.length ||
            node.info.path.some(
              (part, offset) => part !== expected.path[offset],
            ))
        )
          inconsistent(
            "Loaded instance disagrees with the Core ancestor chain",
          );
        if (this.#showScopes)
          this.#dirty = this.#data.openScopes(node) || this.#dirty;
        if (!expected) {
          this.#revealState = Object.freeze({
            status: "success",
            ref: task.ref,
            rowId: this.#data.nodeId(node),
          });
          this.#dirty = true;
          // Keep the task current through notification: dispose still wins over success.
          this.#flush(task.command);
          this.#checkReveal(task);
          task.active = false;
          this.#reveal = undefined;
          return;
        }
        if (node.info.childCount === 0)
          inconsistent("A leaf cannot be an ancestor of another instance");
        this.#dirty =
          this.#data.setExpanded(this.#data.nodeId(node), true, false) ||
          this.#dirty;
        page = node.page;
        this.#flush(task.command);
      }
    } catch (caught) {
      const error = taskError(caught);
      if (task.active && this.#reveal === task && !this.#disposed) {
        task.command.failure = error;
        const diagnostic = this.#prepareFailure(error);
        if (
          !diagnostic ||
          !task.active ||
          this.#reveal !== task ||
          this.#disposed
        )
          throw error;
        task.active = false;
        this.#reveal = undefined;
        this.#revealState = Object.freeze({
          status: "failed",
          ref: task.ref,
          error: diagnostic,
        });
        this.#dirty = true;
        this.#flush(task.command);
      }
      throw error;
    }
  }
}
