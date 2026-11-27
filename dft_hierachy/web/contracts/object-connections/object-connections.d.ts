/** Compile-only proposal; no production export. Normative DESIGN section 6.20. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  ParamsOf,
  RequestedBitRange,
  ResultOf,
  Side,
  SliceRequest,
  SnapshotId,
} from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

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

export declare class ObjectConnectionsError extends Error {
  readonly code: ObjectConnectionsErrorCode;
  constructor(code: ObjectConnectionsErrorCode, message: string);
}

export interface ObjectConnectionsFailure {
  readonly code: ObjectConnectionsErrorCode | HierError["code"];
  readonly origin: "connections" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}

/** Original SDK replies; success does not narrow completeness to complete. */
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

export declare class ObjectConnectionsModel {
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: ObjectConnectionsState;
  readonly disposed: boolean;
  load(target: ObjectConnectionsTarget): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
