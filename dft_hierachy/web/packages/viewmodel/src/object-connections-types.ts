/** Public object connection state. Normative behavior: DESIGN section 6.20. */
import type { HierError, Reply } from "@hier/client";
import type {
  ParamsOf,
  RequestedBitRange,
  ResultOf,
  Side,
  SliceRequest,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { registerModelError } from "./model-error-brand.js";

export type ObjectConnectionsTarget = {
  readonly slice: Readonly<Pick<SliceRequest, "ref">> & {
    readonly bits?: Readonly<Pick<RequestedBitRange, "lsb" | "width">>;
  };
  readonly reach: ParamsOf<"conn.drivers">["reach"];
  readonly side?: Side;
};

export type ObjectConnectionsErrorCode =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";

export class ObjectConnectionsError extends Error {
  constructor(
    readonly code: ObjectConnectionsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ObjectConnectionsError";
    registerModelError(this, ObjectConnectionsError);
  }
}

export interface ObjectConnectionsFailure {
  readonly code: ObjectConnectionsErrorCode | HierError["code"];
  readonly origin: "connections" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}

/** Original SDK replies; success does not imply complete connectivity. */
export interface ObjectConnections {
  readonly object: Reply<ResultOf<"obj.get">>;
  readonly drivers: Reply<ResultOf<"conn.drivers">>;
  readonly loads: Reply<ResultOf<"conn.loads">>;
}

export type ObjectConnectionsState =
  | {
      readonly status: "idle";
      readonly target: null;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "pending";
      readonly target: ObjectConnectionsTarget;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "success";
      readonly target: ObjectConnectionsTarget;
      readonly data: ObjectConnections;
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly target: ObjectConnectionsTarget;
      readonly data?: never;
      readonly error: ObjectConnectionsFailure;
    };
