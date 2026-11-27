import type { HierClient } from "@hier/client";
import { QueryDataModel } from "./query-data-model.js";
import type {
  QueryDataPolicy,
  QueryErrorCode,
  QueryFailure,
} from "./query-data-model.js";
export type { TargetLoad } from "./query-data-model.js";

type TargetDataState<Target, Data, Origin extends string> =
  | {
      readonly status: "idle";
      readonly target: null;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "pending";
      readonly target: Target;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "success";
      readonly target: Target;
      readonly data: Data;
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly target: Target;
      readonly data?: never;
      readonly error: QueryFailure<Origin, QueryErrorCode>;
    };

type TargetDataPolicy<Target, Data, Origin extends string> = Omit<
  QueryDataPolicy<
    Target,
    Data,
    Origin,
    TargetDataState<Target, Data, Origin>,
    QueryErrorCode
  >,
  "states"
>;
const idle = Object.freeze({ status: "idle", target: null } as const);
/** Single-result projection retained for Properties and SourceDocument. */
export class TargetDataModel<
  Target,
  Data,
  Origin extends string,
> extends QueryDataModel<
  Target,
  Data,
  Origin,
  TargetDataState<Target, Data, Origin>
> {
  constructor(
    client: HierClient,
    policy: TargetDataPolicy<Target, Data, Origin>,
  ) {
    super(client, {
      ...policy,
      states: {
        idle,
        target: (state) => state.target,
        status: (state) => state.status,
        pending: (target) => Object.freeze({ status: "pending", target }),
        success: (target, data) =>
          Object.freeze({ status: "success", target, data }),
        failure: (target, error) =>
          Object.freeze({
            status: error.code === "cancelled" ? "cancelled" : "failed",
            target,
            error,
          }),
      },
    });
  }
}
