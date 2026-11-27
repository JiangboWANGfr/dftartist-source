/** DESIGN 6.9 proposal. Not a production export or an implementation. */
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type { ObjectRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "@hier/viewmodel";

export type InstancePropertiesErrorCode =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";

export declare class InstancePropertiesError extends Error {
  readonly code: InstancePropertiesErrorCode;
  constructor(code: InstancePropertiesErrorCode, message: string);
}

/** Owns the same diagnostic projection defined in DESIGN 6.6.6. */
export interface InstancePropertiesFailure {
  readonly code: InstancePropertiesErrorCode | HierError["code"];
  readonly origin: "properties" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}

/** Original SDK replies; Core owns every domain field and completeness. */
export interface InstanceProperties {
  readonly instance: Reply<ResultOf<"inst.get">>;
  readonly ports: Reply<ResultOf<"inst.ports">>;
  readonly params: Reply<ResultOf<"inst.params">>;
}

export type InstancePropertiesState =
  | {
      readonly status: "idle";
      readonly target: null;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "pending";
      readonly target: ObjectRef;
      readonly data?: never;
      readonly error?: never;
    }
  | {
      readonly status: "success";
      readonly target: ObjectRef;
      readonly data: InstanceProperties;
      readonly error?: never;
    }
  | {
      readonly status: "failed" | "cancelled";
      readonly target: ObjectRef;
      readonly data?: never;
      readonly error: InstancePropertiesFailure;
    };

export declare class InstancePropertiesModel {
  /** Borrow a ready SDK; construction performs no queries or subscriptions. */
  constructor(client: HierClient);
  readonly snapshotId: SnapshotId;
  readonly state: InstancePropertiesState;
  readonly disposed: boolean;
  load(inst: ObjectRef): Promise<void>;
  reload(): Promise<void>;
  cancel(): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
