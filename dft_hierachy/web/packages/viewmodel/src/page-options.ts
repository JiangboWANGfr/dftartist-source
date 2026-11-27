import { validateDefinition } from "@hier/protocol-types";
import { QueryInput } from "./query-input.js";
import type { InputFields } from "./query-input.js";

/** One boundary for the fixed page limit used by paged query models. */
export function readPageSize(
  options: unknown,
  ErrorType: new (
    code: "invalid_options" | "disposed",
    message: string,
  ) => Error,
  label: string,
): number {
  const reader: QueryInput<"invalid_options"> = new QueryInput(
    ErrorType,
    "invalid_options",
    label,
    () => false,
  );
  const captured: InputFields = Object.create(null);
  if (options !== undefined)
    reader.field(reader.record(options), "pageSize", captured);
  const value = "pageSize" in captured ? captured.pageSize : 200;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    !validateDefinition("PageLimit", value)
  )
    reader.invalid("pageSize must be a positive safe integer");
  return value;
}
