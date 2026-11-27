import type { HierClient, Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import { TargetDataModel } from "./target-data-model.js";
import type { TargetLoad } from "./target-data-model.js";
import {
  readConnectionsTarget,
  sameConnectionsTarget,
} from "./object-connections-input.js";
import { ObjectConnectionsError } from "./object-connections-types.js";
import type {
  ObjectConnections,
  ObjectConnectionsState,
  ObjectConnectionsTarget,
} from "./object-connections-types.js";

function loadConnections(
  task: TargetLoad<ObjectConnectionsTarget, ObjectConnections>,
): void {
  const target = task.target;
  task.observe(
    (client, signal) => client.object(target.slice.ref, signal),
    (object) => {
      if (object.result.ref !== target.slice.ref)
        throw new ObjectConnectionsError(
          "inconsistent_reply",
          "Object reply does not match its requested target",
        );
      let drivers: ObjectConnections["drivers"] | undefined;
      let loads: ObjectConnections["loads"] | undefined;
      const complete = () => {
        if (drivers && loads)
          task.complete(Object.freeze({ object, drivers, loads }));
      };
      // Each reply retains its own completeness; partial is a valid result.
      task.observe(
        (client, signal) => client.drivers(target, signal),
        (reply) => {
          drivers = reply;
          complete();
        },
      );
      task.observe(
        (client, signal) => client.loads(target, signal),
        (reply) => {
          loads = reply;
          complete();
        },
      );
    },
  );
}

/** One explicit object/slice target in a borrowed, ready SDK snapshot. */
export class ObjectConnectionsModel {
  readonly #model: TargetDataModel<
    ObjectConnectionsTarget,
    ObjectConnections,
    "connections"
  >;
  constructor(client: HierClient) {
    this.#model = new TargetDataModel(client, {
      Error: ObjectConnectionsError,
      origin: "connections",
      label: "Object connections",
      replyName: "object connections",
      sameTarget: sameConnectionsTarget,
      begin: loadConnections,
    });
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): ObjectConnectionsState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  load(target: ObjectConnectionsTarget): Promise<void> {
    return this.#model.load(() =>
      readConnectionsTarget(target, () => this.#model.disposed),
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
