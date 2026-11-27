import type { WireErrorCode } from "@hier/protocol-types";

export type ClientErrorCode =
  | "not_ready"
  | "disposed"
  | "transport_closed"
  | "protocol_error"
  | "protocol_mismatch"
  | "schema_mismatch";

const hierErrors = new WeakSet<object>();

export class HierError extends Error {
  constructor(
    readonly code: WireErrorCode | ClientErrorCode,
    readonly origin: "core" | "client" | "transport",
    message: string,
    readonly data: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "HierError";
    hierErrors.add(this);
  }
}

/** This module's constructed errors (including subclasses), without value probes. */
export function isHierError(value: unknown): value is HierError {
  return typeof value === "object" && value !== null && hierErrors.has(value);
}

export function transportError(cause?: unknown): HierError {
  if (cause instanceof HierError && cause.code === "transport_closed")
    return cause;
  return new HierError(
    "transport_closed",
    "transport",
    cause instanceof Error ? cause.message : "Transport closed",
  );
}
