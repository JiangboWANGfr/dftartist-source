import type { GraphFoldGroup, GraphSessionState } from "@hier/viewmodel";
import type { DesignGraph } from "./design-graph.js";
import { diagnostic } from "./design-diagnostic.js";

interface GroupingState {
  readonly graph: GraphSessionState;
  readonly groups: readonly GraphFoldGroup[] | undefined;
  readonly status: "pending" | "success" | "failed" | "cancelled" | undefined;
  readonly error: unknown;
  readonly message: string | undefined;
}
interface Query {
  readonly graph: GraphSessionState;
  readonly controller: AbortController;
  completion: Promise<void>;
}

/** One mounted graph view's display query; Core and the projection still own membership and folding. */
export class InstanceGrouping {
  private state: GroupingState;
  private readonly listeners = new Set<() => void>();
  private unobserve: (() => void) | undefined;
  private current: Query | undefined;

  constructor(private readonly owned: Pick<DesignGraph, "graph" | "instanceGroups">) {
    this.state = this.empty();
  }
  private empty(): GroupingState {
    return Object.freeze({
      graph: this.owned.graph.state,
      groups: undefined,
      status: undefined,
      error: undefined,
      message: undefined,
    });
  }
  readonly getSnapshot = (): GroupingState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    // Construction during React render owns no external subscription or query.
    this.listeners.add(listener);
    if (!this.unobserve) {
      this.unobserve = this.owned.graph.subscribe(() => {
        if (this.state.graph !== this.owned.graph.state) this.clear();
      });
      if (this.state.graph !== this.owned.graph.state) this.clear();
    }
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      const off = this.unobserve,
        query = this.current;
      this.unobserve = undefined;
      this.current = undefined;
      this.state = this.empty();
      off?.();
      // Reentrant abort callbacks cannot restore this released view's authority.
      query?.controller.abort();
    };
  };
  private publish(state: GroupingState): void {
    this.state = Object.freeze(state);
    for (const listener of [...this.listeners]) {
      if (this.state !== state) break;
      if (!this.listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        console.error("Instance grouping subscriber failed", error);
      }
    }
  }
  private eligible(query: Query): boolean {
    return (
      this.listeners.size > 0 &&
      this.current === query &&
      !query.controller.signal.aborted &&
      this.owned.graph.state === query.graph
    );
  }
  load(): Promise<void> {
    if (!this.listeners.size) return Promise.resolve();
    const retained = this.state.graph === this.owned.graph.state ? this.state : this.empty();
    const previous = this.current;
    const query: Query = {
      graph: this.owned.graph.state,
      controller: new AbortController(),
      completion: Promise.resolve(),
    };
    this.current = query;
    query.completion = this.run(query);
    // Register the replacement first: an abort listener can issue an even newer intent.
    previous?.controller.abort();
    if (this.eligible(query))
      this.publish({
        ...retained,
        graph: query.graph,
        status: "pending",
        error: undefined,
        message: undefined,
      });
    return query.completion;
  }
  private async run(query: Query): Promise<void> {
    await Promise.resolve();
    if (!this.eligible(query)) return;
    let groups: readonly GraphFoldGroup[];
    try {
      groups = await this.owned.instanceGroups(query.graph, query.controller.signal);
    } catch (error) {
      if (!this.eligible(query)) return;
      const message = diagnostic(error);
      // Reading a foreign diagnostic can synchronously clear, replace or release the query.
      if (!this.eligible(query)) return;
      this.current = undefined;
      this.publish({ ...this.state, status: "failed", error, message });
      return;
    }
    if (!this.eligible(query)) return;
    this.current = undefined;
    this.publish({
      ...this.state,
      status: "success",
      groups,
      error: undefined,
      message: undefined,
    });
  }
  cancel(): void {
    if (!this.listeners.size) return;
    const query = this.current;
    this.current = undefined;
    this.publish({ ...this.state, status: "cancelled", error: undefined, message: undefined });
    query?.controller.abort();
  }
  clear(): void {
    if (!this.listeners.size) return;
    const query = this.current;
    this.current = undefined;
    this.publish(this.empty());
    query?.controller.abort();
  }
}
