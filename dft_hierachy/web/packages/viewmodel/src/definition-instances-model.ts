import type { HierClient, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { readPageSize } from "./page-options.js";
import { PagedQueryModel } from "./paged-query-model.js";
import { registerQueryOwner } from "./query-coordination.js";
import { readDefinitionInstancesQuery } from "./definition-instances-input.js";
import { DefinitionInstancesError } from "./definition-instances-types.js";
import type {
  DefinitionInstancesErrorCode,
  DefinitionInstancesOptions,
  DefinitionInstancesPage,
  DefinitionInstancesQuery,
  DefinitionInstancesState,
} from "./definition-instances-types.js";

/** Explicit occurrence pages in one borrowed snapshot, retaining Core identity. */
export class DefinitionInstancesModel {
  readonly #model: PagedQueryModel<
    DefinitionInstancesQuery,
    DefinitionInstancesPage,
    "definition_instances",
    DefinitionInstancesErrorCode
  >;
  constructor(client: HierClient, options?: DefinitionInstancesOptions) {
    const snapshotId = client.snapshot.snapshotId;
    const pageSize = readPageSize(
      options,
      DefinitionInstancesError,
      "Definition instances",
    );
    this.#model = new PagedQueryModel(
      client,
      {
        Error: DefinitionInstancesError,
        origin: "definition_instances",
        label: "Definition instances",
        replyName: "def.instances",
        invalidPageMessage:
          "Definition instances page exceeds its limit or repeats a cursor",
        pageSize,
        sameQuery: (left, right) =>
          left.snapshotId === right.snapshotId && left.def === right.def,
        request: (client, query, page, signal) =>
          client.instancesOf(query.def, page, signal),
      },
      snapshotId,
    );
    registerQueryOwner(this, this.#model);
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): DefinitionInstancesState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  load(query: DefinitionInstancesQuery): Promise<void> {
    return this.#model.load(() =>
      readDefinitionInstancesQuery(query, () => this.disposed, this.snapshotId),
    );
  }
  loadMore(): Promise<void> {
    return this.#model.loadMore();
  }
  reload(): Promise<void> {
    return this.#model.reload();
  }
  cancel(): Promise<void> {
    return this.#model.cancel();
  }
  clear(): Promise<void> {
    return this.#model.clear();
  }
  subscribe(listener: () => void): Unsubscribe {
    return this.#model.subscribe(listener);
  }
  dispose(): void {
    this.#model.dispose();
  }
}
