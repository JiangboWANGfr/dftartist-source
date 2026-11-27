// Independent B strict consumer of the approved public declaration, not A consumers.
import {
  InstancePropertiesModel,
  InstancePropertiesError,
} from "@B/instance-properties";
import type {
  InstancePropertiesState,
  InstanceProperties,
  InstancePropertiesFailure,
  InstancePropertiesErrorCode,
} from "@B/instance-properties";
import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type { SnapshotId, ResultOf } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";
declare const sdk: HierClient,
  model: InstancePropertiesModel,
  data: InstanceProperties,
  failure: InstancePropertiesFailure;
const m = new InstancePropertiesModel(sdk);
const pending: Promise<void>[] = [
  m.load("opaque ref"),
  m.reload(),
  m.cancel(),
  m.clear(),
];
const off: Unsubscribe = m.subscribe(() => {
  void m.state;
});
off();
m.dispose();
const snapshot: SnapshotId = m.snapshotId,
  disposed: boolean = m.disposed;
const states: readonly InstancePropertiesState[] = [
  { status: "idle", target: null },
  { status: "pending", target: "a" },
  { status: "success", target: "a", data },
  { status: "failed", target: "a", error: failure },
  { status: "cancelled", target: "a", error: failure },
];
for (const state of states) {
  if (state.status === "success") {
    const i: Reply<ResultOf<"inst.get">> = state.data.instance;
    const p: Reply<ResultOf<"inst.ports">> = state.data.ports;
    const n: Reply<ResultOf<"inst.params">> = state.data.params;
    const completeness: "complete" | "partial" = p.completeness.status;
    void [i, n, completeness];
  }
  if (state.status === "failed" || state.status === "cancelled") {
    const issue: TreeDiagnosticIssue | undefined = state.error.dataIssue;
    void issue;
  }
}
const codes: readonly InstancePropertiesErrorCode[] = [
  "invalid_argument",
  "disposed",
  "cancelled",
  "inconsistent_reply",
  "reentrant_change",
];
const error = new InstancePropertiesError("cancelled", "B model diagnostic"),
  cause: unknown = error.cause;
const cycle: { self?: unknown } = {};
cycle.self = cycle;
const own: InstancePropertiesFailure = {
  code: "transport_closed",
  origin: "transport",
  message: "B",
  data: cycle,
};
// @ts-expect-error IP-T01: constructor requires a real typed SDK.
new InstancePropertiesModel(0);
// @ts-expect-error IP-T02: no second constructor options contract.
new InstancePropertiesModel(sdk, {});
// @ts-expect-error IP-T03: load only raw ObjectRef string.
model.load(1);
// @ts-expect-error IP-T04: null is not a target.
model.load(null);
// @ts-expect-error IP-T05: model does not consume Selection or infer first item.
model.load({ items: [{ ref: "a" }] });
// @ts-expect-error IP-T06: reload has no target argument.
model.reload("a");
// @ts-expect-error IP-T07: cancel has no row/target argument.
model.cancel(null);
// @ts-expect-error IP-T08: subscribe requires a function.
model.subscribe(0);
// @ts-expect-error IP-T09: read-only snapshot.
model.snapshotId = "other";
// @ts-expect-error IP-T10: read-only state.
model.state = { status: "idle", target: null };
// @ts-expect-error IP-T11: read-only disposed.
model.disposed = false;
// @ts-expect-error IP-T12: closed model error-code vocabulary.
new InstancePropertiesError("unknown", "bad");
// @ts-expect-error IP-T13: success requires data.
const missing: InstancePropertiesState = { status: "success", target: "a" };
// @ts-expect-error IP-T14: idle target must be null.
const wrongIdle: InstancePropertiesState = { status: "idle", target: "a" };
// @ts-expect-error IP-T15: pending cannot expose partial data.
const partial: InstancePropertiesState = {
  status: "pending",
  target: "a",
  data,
};
// @ts-expect-error IP-T16: failed requires diagnostic.
const noError: InstancePropertiesState = { status: "failed", target: "a" };
// @ts-expect-error IP-T17: source is not properties/core/client/transport.
const wrongOrigin: InstancePropertiesFailure["origin"] = "tree";
// @ts-expect-error IP-T18: reply wrapper is not a naked array.
const naked: InstanceProperties["ports"] = [];
// @ts-expect-error IP-T19: instance reply retains deep readonly facts.
data.instance.result.name = "rewritten";
// @ts-expect-error IP-T20: ports array is deeply readonly.
data.ports.result.push(data.ports.result[0]!);
// @ts-expect-error IP-T21: method-level complete rule does not narrow generic Reply type.
const completeOnly: "complete" = data.ports.completeness.status;
// @ts-expect-error IP-T22: issue cannot be explicitly undefined under exact optional rules.
const explicit: InstancePropertiesFailure = {
  code: "cancelled",
  origin: "properties",
  message: "",
  data: {},
  dataIssue: undefined,
};
void [
  pending,
  snapshot,
  disposed,
  codes,
  cause,
  own,
  missing,
  wrongIdle,
  partial,
  noError,
  wrongOrigin,
  naked,
  completeOnly,
  explicit,
];
