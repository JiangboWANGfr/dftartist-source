import type { HierClient, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { QueryDataModel } from "./query-data-model.js";
import { registerQueryOwner } from "./query-coordination.js";
import { readPathResolutionQuery } from "./path-resolution-input.js";
import { PathResolutionError } from "./path-resolution-types.js";
import type {
  PathResolutionErrorCode,
  PathResolutionQuery,
  PathResolutionReply,
  PathResolutionState,
} from "./path-resolution-types.js";

/** One original path reply, with task ownership delegated to QueryDataModel. */
export class PathResolutionModel {
  readonly #model: QueryDataModel<
    PathResolutionQuery,
    PathResolutionReply,
    "path_resolution",
    PathResolutionState,
    PathResolutionErrorCode
  >;
  constructor(client: HierClient) {
    const snapshotId = client.snapshot.snapshotId;
    this.#model = new QueryDataModel<
      PathResolutionQuery,
      PathResolutionReply,
      "path_resolution",
      PathResolutionState,
      PathResolutionErrorCode
    >(
      client,
      {
        Error: PathResolutionError,
        origin: "path_resolution",
        label: "Path resolution",
        replyName: "path.resolve",
        states: {
          idle: Object.freeze({ status: "idle", query: null }),
          target: (state) => state.query,
          status: (state) => state.status,
          pending: (query) => Object.freeze({ status: "pending", query }),
          success: (query, reply) =>
            Object.freeze({ status: "success", query, reply }),
          failure: (query, error) =>
            Object.freeze({
              status: error.code === "cancelled" ? "cancelled" : "failed",
              query,
              error,
            }),
        },
        sameTarget: (left, right) =>
          left.snapshotId === right.snapshotId && left.text === right.text,
        begin: (task) =>
          task.observe(
            (client, signal) => client.resolvePath(task.target.text, signal),
            (reply) => task.complete(reply),
          ),
      },
      snapshotId,
    );
    registerQueryOwner(this, this.#model);
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): PathResolutionState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  load(query: PathResolutionQuery): Promise<void> {
    return this.#model.load(() =>
      readPathResolutionQuery(query, () => this.disposed, this.snapshotId),
    );
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
