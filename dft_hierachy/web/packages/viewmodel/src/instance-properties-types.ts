/** Public instance properties state. Normative behavior: DESIGN section 6.9. */
import type { HierError, Reply } from "@hier/client";
import type { ObjectRef, ResultOf } from "@hier/protocol-types";
import type { TreeDiagnosticIssue } from "./tree-types.js";
import { registerModelError } from "./model-error-brand.js";

export type InstancePropertiesErrorCode =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";

export class InstancePropertiesError extends Error {
  constructor(
    readonly code: InstancePropertiesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InstancePropertiesError";
    registerModelError(this, InstancePropertiesError);
  }
}

export interface InstancePropertiesFailure {
  readonly code: InstancePropertiesErrorCode | HierError["code"];
  readonly origin: "properties" | HierError["origin"];
  readonly message: string;
  readonly data: Reply<Record<string, unknown>>["result"];
  readonly dataIssue?: TreeDiagnosticIssue;
}

/** Original SDK replies: Core remains the authority for every domain field. */
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
