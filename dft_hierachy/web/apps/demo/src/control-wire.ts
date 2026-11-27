import type { DemoFailure, DemoPickOptions, DemoReply } from "./bridge.js";
import type { ElectronFailure } from "@hier/client/electron/renderer";
import { validateDefinition } from "@hier/protocol-types";

export const channels = {
  pick: "hier:demo:pick",
  open: "hier:demo:open",
  close: "hier:demo:close",
} as const;
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
export function pickOptions(value: unknown): value is DemoPickOptions {
  return (
    record(value) &&
    Object.keys(value).every((key) => key === "kind" || key === "top") &&
    (value.kind === "source" || value.kind === "filelist") &&
    (!Object.hasOwn(value, "top") || (nonempty(value.top) && !/[\0\r\n]/.test(value.top)))
  );
}
export function failure(code: DemoFailure["code"], message: string): DemoReply<never> {
  return { ok: false, error: { code, origin: "demo", message } };
}

function json(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(json);
  return record(value) && Object.values(value).every(json);
}
function cause(value: unknown): ElectronFailure | undefined {
  if (
    !record(value) ||
    typeof value.code !== "string" ||
    (!validateDefinition("WireErrorCode", value.code) &&
      ![
        "not_ready",
        "disposed",
        "transport_closed",
        "protocol_error",
        "protocol_mismatch",
        "schema_mismatch",
      ].includes(value.code)) ||
    !["core", "client", "transport"].includes(String(value.origin)) ||
    typeof value.message !== "string" ||
    !record(value.data) ||
    !json(value.data)
  )
    return undefined;
  return {
    code: value.code as ElectronFailure["code"],
    origin: value.origin as ElectronFailure["origin"],
    message: value.message,
    data: value.data,
  };
}

/** Reject malformed replies at the IPC boundary; never infer a session to close. */
export function reply<T>(value: unknown, accepts: (value: unknown) => value is T): DemoReply<T> {
  if (record(value)) {
    if (value.ok === true && accepts(value.value)) return { ok: true, value: value.value };
    if (value.ok === false && record(value.error)) {
      const error = value.error;
      if (
        error.origin === "demo" &&
        typeof error.message === "string" &&
        typeof error.code === "string" &&
        ["bad_request", "busy", "stale_choice", "host_failure", "ipc_unavailable"].includes(
          error.code,
        ) &&
        !Object.hasOwn(error, "stack")
      ) {
        const detail = Object.hasOwn(error, "cause") ? cause(error.cause) : undefined;
        if (Object.hasOwn(error, "cause") && !detail)
          return failure("ipc_unavailable", "Invalid demo diagnostic");
        return {
          ok: false,
          error: {
            code: error.code as DemoFailure["code"],
            origin: "demo",
            message: error.message,
            ...(detail === undefined ? {} : { cause: detail }),
          },
        };
      }
    }
  }
  return failure("ipc_unavailable", "Invalid demo control reply");
}
