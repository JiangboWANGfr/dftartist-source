import {
  ObjectConnectionsModel,
  ObjectConnectionsError,
} from "@B/object-connections";
import type {
  ObjectConnectionsTarget,
  ObjectConnectionsState,
  ObjectConnections,
  ObjectConnectionsFailure,
} from "@B/object-connections";
import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type { ParamsOf, ResultOf } from "@hier/protocol-types";
declare const client: HierClient;
const model = new ObjectConnectionsModel(client);
const t: ObjectConnectionsTarget = {
  slice: { ref: "opaque", bits: { lsb: 0, width: 1 } },
  reach: "hier",
  side: "inside",
};
const d: ParamsOf<"conn.drivers"> = t;
const l: ParamsOf<"conn.loads"> = t;
const promise: Promise<void> = model.load(t);
const ps: Promise<void>[] = [model.reload(), model.cancel(), model.clear()];
const off: Unsubscribe = model.subscribe(() => {});
off();
model.dispose();
const code = new ObjectConnectionsError("invalid_argument", "B").code;
declare const s: ObjectConnectionsState;
if (s.status === "success") {
  const r: Reply<ResultOf<"conn.drivers">> = s.data.drivers;
  const r2: Reply<ResultOf<"conn.loads">> = s.data.loads;
  const r3: Reply<ResultOf<"obj.get">> = s.data.object;
  const status: "complete" | "partial" = r.completeness.status;
}
declare const driverReply: Reply<ResultOf<"conn.drivers">>;
declare const connectionData: ObjectConnections;
// @ts-expect-error OC-T01: endpoint arrays are readonly
driverReply.result.push({
  kind: "unconnected",
  queried: { lsb: 0, width: 1 },
  via: [],
});
// @ts-expect-error OC-T02: completeness not narrowed to complete
const wrongComplete: "complete" = driverReply.completeness.status;
// @ts-expect-error OC-T03: wrapper readonly
connectionData.drivers = driverReply;
// @ts-expect-error OC-T04: slice readonly
t.slice = { ref: "other" };
// @ts-expect-error OC-T05: ref readonly
t.slice.ref = "other";
// @ts-expect-error OC-T06: bits readonly
t.slice.bits!.width = 2;
// @ts-expect-error OC-T07: reach readonly
t.reach = "local";
// @ts-expect-error OC-T08: side readonly
t.side = "outside";
// @ts-expect-error OC-T09: reach mandatory
model.load({ slice: { ref: "B" } });
// @ts-expect-error OC-T10: only local/hier
model.load({ slice: { ref: "B" }, reach: "all" });
// @ts-expect-error OC-T11: exact optional side
model.load({ slice: { ref: "B" }, reach: "local", side: undefined });
// @ts-expect-error OC-T12: exact optional bits
model.load({ slice: { ref: "B", bits: undefined }, reach: "local" });
// @ts-expect-error OC-T13: ref required
model.load({ slice: {}, reach: "local" });
// @ts-expect-error OC-T14: primitive string ref
model.load({ slice: { ref: 1 }, reach: "local" });
const badNumericSlice = { ref: "B", bits: { lsb: "0", width: 1 } };
// @ts-expect-error OC-T15: numeric bits
model.load({ slice: badNumericSlice, reach: "local" });
// @ts-expect-error OC-T16: side enum
model.load({ slice: { ref: "B" }, reach: "local", side: "both" });
// @ts-expect-error OC-T17: error code closed
new ObjectConnectionsError("internal", "B");
// @ts-expect-error OC-T18: pending cannot contain data
const bad: ObjectConnectionsState = {
  status: "pending",
  target: t,
  data: {} as ObjectConnections,
};
// @ts-expect-error OC-T19: idle target must null
const bad2: ObjectConnectionsState = { status: "idle", target: t };
// @ts-expect-error OC-T20: failed needs error
const bad3: ObjectConnectionsState = { status: "failed", target: t };
// @ts-expect-error OC-T21: snapshot readonly
model.snapshotId = "B";
// @ts-expect-error OC-T22: state readonly
model.state = { status: "idle", target: null };
// @ts-expect-error OC-T23: async not void
const wrongPromise: void = model.reload();
declare const failure: ObjectConnectionsFailure;
// @ts-expect-error OC-T24: origin union
const wrongOrigin: "source" = failure.origin;
void [d, l, promise, ps, code];
