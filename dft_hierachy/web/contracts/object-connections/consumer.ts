/** This host is compiled only. It cannot run until the production model exists. */
import type { HierClient, Reply } from "@hier/client";
import type { ParamsOf, ResultOf } from "@hier/protocol-types";
import {
  ObjectConnectionsError,
  ObjectConnectionsModel,
  type ObjectConnectionsState,
  type ObjectConnectionsTarget,
} from "./object-connections.js";

export async function host(
  client: HierClient,
  target: ObjectConnectionsTarget,
  publish: (state: ObjectConnectionsState) => void,
): Promise<void> {
  await client.ready;
  const model = new ObjectConnectionsModel(client);
  const unsubscribe = model.subscribe(() => publish(model.state));
  try {
    await model.load(target);
    const state = model.state;
    if (state.status === "success") {
      const object: Reply<ResultOf<"obj.get">> = state.data.object;
      // Both flags and their reasons remain available, even for empty arrays.
      for (const reply of [state.data.drivers, state.data.loads]) {
        const status: "partial" | "complete" = reply.completeness.status;
        const reasons = reply.completeness.reasons;
        for (const endpoint of reply.result) {
          const queried = endpoint.queried;
          const at = endpoint.at;
          const bits = endpoint.bits;
          const source = endpoint.source;
          void [status, reasons, object, queried, at, bits, source];
        }
      }
    }
    await model.reload();
    await model.cancel();
    await model.clear();
  } finally {
    unsubscribe();
    model.dispose();
    // The caller still owns client and its transport.
  }
}

export function typeBoundaries(
  model: ObjectConnectionsModel,
  target: ObjectConnectionsTarget,
  state: ObjectConnectionsState,
): void {
  const drivers: ParamsOf<"conn.drivers"> = target;
  const loads: ParamsOf<"conn.loads"> = target;
  const valid: ObjectConnectionsTarget = {
    slice: { ref: "p:0:0", bits: { lsb: 0, width: 2 } },
    reach: "hier",
    side: "inside",
  };
  void [drivers, loads, valid];
  // @ts-expect-error O01 reach is required
  void model.load({ slice: { ref: "s:0:0" } });
  // @ts-expect-error O02 reference is required
  void model.load({ slice: {}, reach: "local" });
  // @ts-expect-error O03 ref is a string
  void model.load({ slice: { ref: 3 }, reach: "local" });
  // @ts-expect-error O04 generated reach union
  void model.load({ slice: { ref: "s:0:0" }, reach: "all" });
  // @ts-expect-error O05 side has no invented default value
  void model.load({ slice: { ref: "p:0:0" }, reach: "local", side: "both" });
  // @ts-expect-error O06 explicitly undefined bits is not omission
  void model.load({ slice: { ref: "s:0:0", bits: undefined }, reach: "local" });
  // @ts-expect-error O07 explicitly undefined side is not omission
  void model.load({ slice: { ref: "s:0:0" }, reach: "local", side: undefined });
  // @ts-expect-error O08 target is readonly
  target.reach = "hier";
  // @ts-expect-error O09 nested ref is readonly
  target.slice.ref = "s:0:1";
  if (target.slice.bits) {
    // @ts-expect-error O10 nested bits are readonly
    target.slice.bits.width = 1;
  }
  // @ts-expect-error O11 snapshot binding is readonly
  model.snapshotId = "other";
  // @ts-expect-error O12 stable error code union
  new ObjectConnectionsError("timeout", "invalid model code");
  if (state.status === "success") {
    // @ts-expect-error O13 original endpoint array is deep readonly
    state.data.drivers.result.push({});
    // @ts-expect-error O14 original completeness is readonly
    state.data.loads.completeness.status = "complete";
    // @ts-expect-error O15 success does not imply complete
    const complete: "complete" = state.data.drivers.completeness.status;
    void complete;
  }
  if (state.status === "pending") {
    // @ts-expect-error O16 no previous data during a new task
    void state.data.drivers;
  }
}
