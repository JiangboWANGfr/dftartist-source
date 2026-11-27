import type { HierClient, Unsubscribe } from "@hier/client";
import type {
  DefRef,
  ObjectRef,
  SnapshotId,
  SourceKind,
} from "@hier/protocol-types";
import { SourceDocumentModel } from "./source-document-model.js";
import type { SourceDocument } from "./source-document-types.js";
import {
  getSourceCandidatePageChain,
  SourceCandidatesModel,
} from "./source-candidates-model.js";
import type {
  SourceCandidatesOptions,
  SourceCandidatesPage,
} from "./source-candidates-types.js";
import { SelectionModel } from "./selection-model.js";
import { SourceConfirmationError } from "./source-confirmation-types.js";
import type { SourceCandidateAction } from "./source-confirmation-types.js";
import { getQueryScope } from "./query-coordination.js";
import type { QueryCommand, QueryScope } from "./query-coordination.js";
import { SourceNavigationError } from "./source-navigation-types.js";
import type {
  SourceNavigationCandidates,
  SourceNavigationRefresh,
  SourceNavigationState,
} from "./source-navigation-types.js";

interface OrderedError {
  readonly order: number;
  readonly value: unknown;
}
interface NavigationCommand {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly sources: Set<QueryCommand>;
  readonly errors: OrderedError[];
  readonly failures: unknown[];
  outstanding: number;
  starting: boolean;
  settled: boolean;
}
interface Binding {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
}
interface Intent {
  latest: number;
  covered: number;
}
interface Registration {
  listener: (() => void) | undefined;
}
interface IssuedAction {
  readonly action: SourceCandidateAction;
  readonly binding: object;
  readonly pageChain: object;
}

// Capture the original implementation: subclasses/own properties cannot run
// caller code between provenance checks and the synchronous selection commit.
const select = SelectionModel.prototype.select;
const selectionSnapshot = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "snapshotId",
)!.get!;

function command(): NavigationCommand {
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
    sources: new Set(),
    errors: [],
    failures: [],
    outstanding: 0,
    starting: true,
    settled: false,
  };
}

/** Owns two source models; borrows a ready SDK and preserves their raw data. */
export class SourceNavigationModel {
  readonly #document: SourceDocumentModel;
  readonly #candidates: SourceCandidatesModel;
  readonly #documentScope: QueryScope;
  readonly #candidateScope: QueryScope;
  readonly #snapshotId: SnapshotId;
  readonly #subscriptions: Unsubscribe[] = [];
  readonly #listeners = new Set<Registration>();
  readonly #commands = new Set<NavigationCommand>();
  readonly #notificationErrors = new WeakMap<QueryCommand, OrderedError[]>();
  readonly #actions = new WeakMap<SourceCandidateAction, IssuedAction>();
  // A lazy identity projection of only the current immutable page prefix.
  // Binding/page-chain tokens remain the authority for action provenance.
  #candidatePages: {
    readonly pages: readonly SourceCandidatesPage[];
    readonly members: ReadonlySet<SourceCandidatesPage>;
  } | undefined;
  #bindingGeneration: object = {};
  #confirming = false;
  #state: SourceNavigationState;
  #binding: Binding | null = null;
  #refresh: SourceNavigationRefresh | null = null;
  #intent: Intent | null = null;
  #queue: object | null = null;
  #disposed = false;
  #invoking = false;
  #notifying = false;
  #suppress = 0;
  #candidateCalls = 0;
  #errorOrder = 0;
  #active: readonly NavigationCommand[] = [];

  constructor(client: HierClient, options?: SourceCandidatesOptions) {
    this.#snapshotId = client.snapshot.snapshotId;
    // The candidate constructor is the single authority for option validation.
    this.#candidates = new SourceCandidatesModel(client, options);
    let document: SourceDocumentModel | undefined;
    try {
      this.#document = document = new SourceDocumentModel(client);
      this.#documentScope = getQueryScope(this.#document);
      this.#candidateScope = getQueryScope(this.#candidates);
      this.#state = Object.freeze({
        document: this.#document.state,
        candidates: null,
        refresh: null,
      });
      this.#subscriptions.push(
        this.#document.subscribe(() => this.#documentChanged()),
      );
      this.#subscriptions.push(
        this.#candidates.subscribe(() => this.#candidateChanged()),
      );
      this.#subscriptions.push(
        client.onIndexReady(() => {
          if (this.#disposed || !this.#intent || !this.#binding) return;
          this.#intent.latest++;
          this.#schedule();
        }),
      );
    } catch (error) {
      for (const off of this.#subscriptions) off();
      document?.dispose();
      this.#candidates.dispose();
      throw error;
    }
  }
  get snapshotId(): SnapshotId {
    return this.#snapshotId;
  }
  get state(): SourceNavigationState {
    return this.#state;
  }
  get disposed(): boolean {
    return this.#disposed;
  }

  load(ref: ObjectRef | DefRef, kind: SourceKind): Promise<void> {
    return this.#invoke((c) =>
      this.#child([c], this.#documentScope, () =>
        this.#document.load(ref, kind),
      ),
    );
  }
  reloadDocument(): Promise<void> {
    return this.#invoke((c) =>
      this.#child([c], this.#documentScope, () => this.#document.reload()),
    );
  }
  cancelDocument(): Promise<void> {
    return this.#invoke((c) =>
      this.#child([c], this.#documentScope, () => this.#document.cancel()),
    );
  }
  clear(): Promise<void> {
    return this.#invoke((c) => {
      this.#invalidate();
      this.#suppress++;
      try {
        this.#child([c], this.#candidateScope, () => this.#candidates.clear());
      } finally {
        this.#suppress--;
      }
      this.#child([c], this.#documentScope, () => this.#document.clear());
    });
  }
  locate(document: SourceDocument, utf16Offset: number): Promise<void> {
    return this.#invoke((c) => {
      const query = this.#document.queryAt(document, utf16Offset);
      if (
        !this.#binding ||
        this.#binding.document !== document ||
        this.#binding.utf16Offset !== utf16Offset
      ) {
        this.#invalidate();
        this.#suppress++;
        try {
          this.#child([c], this.#candidateScope, () =>
            this.#candidates.clear(),
          );
        } finally {
          this.#suppress--;
        }
        if (this.#disposed) return;
        this.#binding = {
          document,
          utf16Offset: utf16Offset === 0 ? 0 : utf16Offset,
        };
        this.#newIntent();
      } else if (!this.#intent) this.#newIntent();
      this.#child([c], this.#candidateScope, () =>
        this.#candidates.load(query),
      );
    });
  }
  loadMore(): Promise<void> {
    return this.#invoke((c) => {
      if (!this.#binding) return;
      if (!this.#intent) this.#newIntent();
      this.#child([c], this.#candidateScope, () => this.#candidates.loadMore());
    });
  }
  reloadCandidates(): Promise<void> {
    return this.#invoke((c) => {
      if (!this.#binding) return;
      this.#document.queryAt(this.#binding.document, this.#binding.utf16Offset);
      this.#newIntent();
      this.#child([c], this.#candidateScope, () => this.#candidates.reload());
    });
  }
  cancelCandidates(): Promise<void> {
    return this.#invoke((c) => {
      this.#intent = null;
      this.#queue = null;
      this.#refresh = null;
      this.#child([c], this.#candidateScope, () => this.#candidates.cancel());
    });
  }

  createCandidateAction(
    page: SourceCandidatesPage,
    itemIndex: number,
  ): SourceCandidateAction {
    this.#assertConfirmationEntry();
    this.#assertCandidatesReady();
    if (!this.#hasCandidatePage(page))
      throw new SourceConfirmationError(
        "invalid_page",
        "Candidate page is not current",
      );
    if (
      typeof itemIndex !== "number" ||
      !Number.isSafeInteger(itemIndex) ||
      itemIndex < 0 ||
      itemIndex >= page.result.items.length
    )
      throw new SourceConfirmationError(
        "invalid_index",
        "Candidate index is out of range",
      );
    const action = Object.freeze({
      page,
      itemIndex: itemIndex === 0 ? 0 : itemIndex,
    }) as SourceCandidateAction;
    this.#actions.set(action, {
      action,
      binding: this.#bindingGeneration,
      pageChain: getSourceCandidatePageChain(this.#candidates),
    });
    return action;
  }

  confirmCandidate(
    action: SourceCandidateAction,
    selection: SelectionModel,
  ): void {
    this.#assertConfirmationEntry();
    this.#confirming = true;
    try {
      // WeakMap identity lookup does not inspect foreign objects or Proxy traps.
      const issued = this.#actions.get(action);
      if (!issued)
        throw new SourceConfirmationError(
          "invalid_action",
          "Candidate action was not issued by this model",
        );
      const { page, itemIndex } = issued.action;
      if (
        issued.binding !== this.#bindingGeneration ||
        issued.pageChain !== getSourceCandidatePageChain(this.#candidates) ||
        !this.#hasCandidatePage(page)
      )
        throw new SourceConfirmationError(
          "stale_action",
          "Candidate action is no longer current",
        );
      this.#assertCandidatesReady();
      const hit = page.result.items[itemIndex]!;
      if (hit.refKind === undefined)
        throw new SourceConfirmationError(
          "address_unavailable",
          "Candidate address type is unavailable",
        );
      try {
        // This getter reads only a private field, without inspecting the target.
        // Real subclasses work; forged prototypes and proxies fail the brand.
        selectionSnapshot.call(selection);
      } catch {
        throw new SourceConfirmationError(
          "invalid_selection_model",
          "Selection destination is not a SelectionModel",
        );
      }
      // No post-commit checks or wrapping: listener exceptions may follow a
      // committed selection, and a listener may dispose either borrowed model.
      select.call(selection, {
        items: [
          hit.refKind === "definition" ? { def: hit.ref } : { ref: hit.ref },
        ],
        origin: "source",
        snapshotId: this.#snapshotId,
      });
    } finally {
      this.#confirming = false;
    }
  }

  #assertConfirmationEntry(): void {
    if (this.#disposed)
      throw new SourceConfirmationError(
        "disposed",
        "Source navigation is disposed",
      );
    if (this.#busy())
      throw new SourceConfirmationError(
        "reentrant_change",
        "Cannot confirm during input, notification or diagnostics",
      );
  }
  #assertCandidatesReady(): void {
    const document = this.#document.state;
    if (
      !this.#binding ||
      document.status !== "success" ||
      document.data !== this.#binding.document ||
      document.data.location.status !== "exact" ||
      this.#candidates.state.status !== "success"
    )
      throw new SourceConfirmationError(
        "not_ready",
        "Current source candidates are not ready",
      );
  }
  #hasCandidatePage(page: SourceCandidatesPage): boolean {
    const pages = this.#candidates.state.pages;
    if (pages.length < 2) return pages.length === 1 && pages[0] === page;
    if (this.#candidatePages?.pages !== pages) {
      const members = new Set(pages);
      this.#candidatePages = { pages, members };
    }
    return this.#candidatePages.members.has(page);
  }
  subscribe(listener: () => void): Unsubscribe {
    if (this.#disposed) throw this.#disposedError();
    if (typeof listener !== "function")
      throw new TypeError("Source navigation listener must be a function");
    const registration = { listener: listener as (() => void) | undefined };
    this.#listeners.add(registration);
    return () => {
      registration.listener = undefined;
      this.#listeners.delete(registration);
    };
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#invalidate();
    // Read raw command failures before private dispose wraps them. A diagnostic
    // getter can release us before the child's original promise handler runs.
    for (const c of this.#commands) this.#finish(c, true);
    for (const off of this.#subscriptions) off();
    this.#subscriptions.length = 0;
    this.#document.dispose();
    this.#candidates.dispose();
    this.#state = Object.freeze({
      document: this.#document.state,
      candidates: null,
      refresh: null,
    });
    for (const r of this.#listeners) r.listener = undefined;
    this.#listeners.clear();
  }

  #disposedError(): SourceNavigationError {
    return new SourceNavigationError(
      "disposed",
      "Source navigation is disposed",
    );
  }
  #busy(): boolean {
    return (
      this.#confirming ||
      this.#invoking ||
      this.#notifying ||
      this.#documentScope.busy ||
      this.#candidateScope.busy
    );
  }
  #invoke(
    action: (c: NavigationCommand) => void,
    prepared?: NavigationCommand,
  ): Promise<void> {
    const c = prepared ?? command();
    if (this.#disposed) {
      c.starting = false;
      c.settled = true;
      c.reject(this.#disposedError());
      return c.promise;
    }
    this.#commands.add(c);
    try {
      if (this.#busy())
        throw new SourceNavigationError(
          "reentrant_change",
          "Cannot change source navigation during input, notification or diagnostics",
        );
      this.#invoking = true;
      try {
        action(c);
        this.#publish(c);
      } finally {
        this.#invoking = false;
      }
    } catch (error) {
      c.failures.push(error);
    }
    c.starting = false;
    this.#finish(c);
    this.#schedule();
    return c.promise;
  }
  #child(
    owners: readonly NavigationCommand[],
    scope: QueryScope,
    action: () => Promise<void>,
  ): void {
    for (const c of owners) c.outstanding++;
    const candidate = scope === this.#candidateScope;
    if (candidate) this.#candidateCalls++;
    const done = () => {
      if (candidate) this.#candidateCalls--;
      for (const c of owners) {
        c.outstanding--;
        this.#finish(c);
      }
      this.#schedule();
    };
    const previous = this.#active;
    this.#active = owners;
    try {
      const promise = action();
      const raw = scope.command(promise);
      if (raw) for (const c of owners) c.sources.add(raw);
      // Observe before testing current intent/disposal: stale work must settle.
      void promise.then(done, (error: unknown) => {
        if (!raw) for (const c of owners) c.failures.push(error);
        done();
      });
    } catch (error) {
      for (const c of owners) c.failures.push(error);
      done();
    } finally {
      this.#active = previous;
    }
  }
  #parents(raw: QueryCommand): NavigationCommand[] {
    for (const c of this.#active) c.sources.add(raw);
    return [...this.#commands].filter((c) => c.sources.has(raw));
  }
  #documentChanged(): void {
    const raw = this.#documentScope.current!;
    const owners = this.#parents(raw);
    const state = this.#document.state;
    if (
      this.#binding &&
      (state.status !== "success" || state.data !== this.#binding.document)
    ) {
      this.#invalidate();
      this.#suppress++;
      try {
        this.#child(owners, this.#candidateScope, () =>
          this.#candidates.clear(),
        );
      } finally {
        this.#suppress--;
      }
    }
    this.#publish(raw);
  }
  #candidateChanged(): void {
    // Drop the old prefix before publication, including suppressed changes.
    // Pending/failure/cancellation keep the same prefix and may reuse it.
    if (this.#candidatePages?.pages !== this.#candidates.state.pages)
      this.#candidatePages = undefined;
    const raw = this.#candidateScope.current!;
    this.#parents(raw);
    this.#publish(raw);
  }
  #publish(owner: QueryCommand | NavigationCommand): void {
    if (this.#disposed || this.#suppress) return;
    const document = this.#document.state,
      state = this.#candidates.state;
    let candidates: SourceNavigationCandidates | null = null;
    if (
      this.#binding &&
      document.status === "success" &&
      document.data === this.#binding.document &&
      state.status !== "idle"
    ) {
      const prior = this.#state.candidates;
      candidates =
        prior &&
        prior.document === this.#binding.document &&
        prior.utf16Offset === this.#binding.utf16Offset &&
        prior.state === state
          ? prior
          : Object.freeze({ ...this.#binding, state });
    }
    if (
      this.#state.document === document &&
      this.#state.candidates === candidates &&
      this.#state.refresh === this.#refresh
    )
      return;
    this.#state = Object.freeze({
      document,
      candidates,
      refresh: this.#refresh,
    });
    const listeners = [...this.#listeners];
    this.#notifying = true;
    try {
      for (const r of listeners) {
        if (this.#disposed) break;
        if (!r.listener) continue;
        try {
          r.listener();
        } catch (value) {
          const entry = { order: this.#errorOrder++, value };
          if ("sources" in owner) owner.errors.push(entry);
          else {
            owner.errors.push(value);
            let errors = this.#notificationErrors.get(owner);
            if (!errors) {
              errors = [];
              this.#notificationErrors.set(owner, errors);
            }
            errors.push(entry);
          }
        }
      }
    } finally {
      this.#notifying = false;
    }
  }
  #finish(c: NavigationCommand, force = false): void {
    if (c.settled || (!force && (c.starting || c.outstanding))) return;
    let failed = c.failures.length > 0,
      failure = c.failures[0];
    const errors = [...c.errors];
    for (const raw of c.sources) {
      if (!failed && raw.failure !== undefined) {
        failed = true;
        failure = raw.failure;
      }
      errors.push(...(this.#notificationErrors.get(raw) ?? []));
    }
    if (errors.length) {
      errors.sort((a, b) => a.order - b.order);
      failure = new AggregateError(
        errors.map((e) => e.value),
        "Source navigation listeners failed",
        failed ? { cause: failure } : undefined,
      );
      failed = true;
    }
    if (this.#disposed) {
      const disposed = this.#disposedError();
      if (failed)
        Object.defineProperty(disposed, "cause", {
          value: failure,
          configurable: true,
          writable: true,
        });
      failure = disposed;
      failed = true;
    }
    c.settled = true;
    this.#commands.delete(c);
    if (failed) c.reject(failure);
    else c.resolve();
  }
  #invalidate(): void {
    this.#candidatePages = undefined;
    this.#bindingGeneration = {};
    this.#binding = null;
    this.#intent = null;
    this.#refresh = null;
    this.#queue = null;
  }
  #newIntent(): void {
    this.#intent = { latest: 0, covered: 0 };
    this.#refresh = null;
    this.#queue = null;
  }
  #eligible(): boolean {
    const state = this.#candidates.state;
    return (
      !this.#disposed &&
      this.#binding !== null &&
      this.#intent !== null &&
      this.#intent.latest > this.#intent.covered &&
      this.#candidateCalls === 0 &&
      state.status === "success" &&
      state.pages.some((p) => p.completeness.status === "partial")
    );
  }
  #schedule(): void {
    if (this.#queue || !this.#eligible()) return;
    const ticket = {},
      intent = this.#intent;
    this.#queue = ticket;
    queueMicrotask(() => {
      if (this.#queue !== ticket) return;
      this.#queue = null;
      if (this.#intent !== intent || !this.#eligible() || this.#busy()) return;
      const c = command();
      this.#invoke(() => {
        const binding = this.#binding!;
        this.#document.queryAt(binding.document, binding.utf16Offset);
        // This boundary precedes pending notification, including synchronous E2.
        intent!.covered = intent!.latest;
        this.#refresh = Object.freeze({ ...binding, completion: c.promise });
        this.#child([c], this.#candidateScope, () => this.#candidates.reload());
      }, c);
    });
  }
}
