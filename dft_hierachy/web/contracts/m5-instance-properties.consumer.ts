import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type { ObjectRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import {
  InstancePropertiesError,
  InstancePropertiesModel,
  type InstanceProperties,
  type InstancePropertiesFailure,
  type InstancePropertiesState,
} from "./m5-instance-properties.js";

declare const client: HierClient;
declare const ref: ObjectRef;
declare const data: InstanceProperties;
declare const failure: InstancePropertiesFailure;
const model = new InstancePropertiesModel(client);
const snapshot: SnapshotId = model.snapshotId;
const loading: Promise<void> = model.load(ref);
const reload: Promise<void> = model.reload();
const cancel: Promise<void> = model.cancel();
const clear: Promise<void> = model.clear();
const off: Unsubscribe = model.subscribe(() => model.state);
off();
model.dispose();

function render(state: InstancePropertiesState): string {
  switch (state.status) {
    case "idle": {
      const empty: null = state.target;
      return String(empty);
    }
    case "pending":
      return state.target;
    case "success": {
      const info: Reply<ResultOf<"inst.get">> = state.data.instance;
      const ports: Reply<ResultOf<"inst.ports">> = state.data.ports;
      const params: Reply<ResultOf<"inst.params">> = state.data.params;
      const width: number | undefined = ports.result[0]?.width;
      const parameterText: string | undefined = params.result[0]?.value;
      const complete = info.completeness.status;
      return `${info.result.name} ${width} ${parameterText} ${complete}`;
    }
    case "failed":
    case "cancelled": {
      const problem = state.error;
      const path: readonly string[] | undefined = problem.dataIssue?.path;
      return `${problem.code} ${problem.origin} ${problem.message} ${path}`;
    }
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
const ownError = new InstancePropertiesError("cancelled", "Cancelled");
const cause: unknown = ownError.cause;
const states: readonly InstancePropertiesState[] = [
  { status: "idle", target: null },
  { status: "pending", target: ref },
  { status: "success", target: ref, data },
  { status: "failed", target: ref, error: failure },
  { status: "cancelled", target: ref, error: failure },
];

// @ts-expect-error P01 input must be a primitive reference, not a number
model.load(1);
// @ts-expect-error P02 there is no automatic target inference from a selection object
model.load({ ref });
// @ts-expect-error P03 null uses clear, not load
model.load(null);
// @ts-expect-error P04 no replacement client or target argument to reload
model.reload(ref);
// @ts-expect-error P05 listener must be callable
model.subscribe(0);
// @ts-expect-error P06 model is bound to one snapshot
model.snapshotId = "replacement";
// @ts-expect-error P07 state publication belongs to the model
model.state = states[0]!;
// @ts-expect-error P08 current target is read only
model.state.target = ref;
// @ts-expect-error P09 success requires all three replies
const missingData: InstancePropertiesState = { status: "success", target: ref };
// @ts-expect-error P10 failed state requires a diagnostic
const missingFailure: InstancePropertiesState = {
  status: "failed",
  target: ref,
};
// @ts-expect-error P11 pending cannot expose stale data
const staleData: InstancePropertiesState = {
  status: "pending",
  target: ref,
  data,
};
// @ts-expect-error P12 idle cannot retain an old target
const staleTarget: InstancePropertiesState = { status: "idle", target: ref };
// @ts-expect-error P13 SDK arrays remain read only
data.ports.result.push(data.ports.result[0]!);
// @ts-expect-error P14 parameter text remains read only
data.params.result[0]!.value = "new value";
// @ts-expect-error P15 no UI-owned width override
data.ports.result[0]!.width = 1;
// @ts-expect-error P16 diagnostic path is immutable
failure.dataIssue!.path.push("field");
// @ts-expect-error P17 no invented model error code
new InstancePropertiesError("unknown_target", "Invalid");
// @ts-expect-error P18 successful states omit error, including explicit undefined
const undefinedError: InstancePropertiesState = {
  status: "success",
  target: ref,
  data,
  error: undefined,
};

void [
  snapshot,
  loading,
  reload,
  cancel,
  clear,
  render,
  cause,
  states,
  missingData,
  missingFailure,
  staleData,
  staleTarget,
  undefinedError,
];
