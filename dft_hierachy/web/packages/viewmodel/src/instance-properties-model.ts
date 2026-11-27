import type { HierClient, Unsubscribe } from "@hier/client";
import { validateDefinition } from "@hier/protocol-types";
import type { ObjectRef, SnapshotId } from "@hier/protocol-types";
import { TargetDataModel } from "./target-data-model.js";
import type { TargetLoad } from "./target-data-model.js";
import { InstancePropertiesError } from "./instance-properties-types.js";
import type {
  InstanceProperties,
  InstancePropertiesState,
} from "./instance-properties-types.js";

function loadProperties(task: TargetLoad<ObjectRef, InstanceProperties>): void {
  const target = task.target;
  task.observe(
    (client, signal) => client.instance(target, signal),
    (instance) => {
      if (instance.result.ref !== target)
        throw new InstancePropertiesError(
          "inconsistent_reply",
          "Instance reply does not match its requested target",
        );
      let ports: InstanceProperties["ports"] | undefined;
      let params: InstanceProperties["params"] | undefined;
      const complete = () => {
        if (ports && params)
          task.complete(Object.freeze({ instance, ports, params }));
      };
      task.observe(
        (client, signal) => client.ports(target, signal),
        (reply) => {
          ports = reply;
          complete();
        },
      );
      task.observe(
        (client, signal) => client.params(target, signal),
        (reply) => {
          params = reply;
          complete();
        },
      );
    },
  );
}

/** One explicit instance target in a borrowed ready SDK snapshot. */
export class InstancePropertiesModel {
  readonly #model: TargetDataModel<ObjectRef, InstanceProperties, "properties">;
  constructor(client: HierClient) {
    this.#model = new TargetDataModel(client, {
      Error: InstancePropertiesError,
      origin: "properties",
      label: "Properties",
      replyName: "instance properties",
      sameTarget: (left, right) => left === right,
      begin: loadProperties,
    });
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): InstancePropertiesState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  load(inst: ObjectRef): Promise<void> {
    return this.#model.load(() => {
      if (typeof inst !== "string" || !validateDefinition("ObjectRef", inst))
        throw new InstancePropertiesError(
          "invalid_argument",
          "An instance reference is required",
        );
      return inst;
    });
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
