import { validateDefinition } from "@hier/protocol-types";
import { TreeError } from "./tree-types.js";
import type { TreeOptions } from "./tree-types.js";

function optionAccess<T>(read: () => T): T {
  try {
    return read();
  } catch (cause) {
    const error = new TreeError(
      "invalid_options",
      "Tree option access threw an exception",
    );
    Object.defineProperty(error, "cause", {
      value: cause,
      writable: true,
      configurable: true,
    });
    throw error;
  }
}

/** Capture caller accessors once before validating either declared option. */
export function readTreeOptions(options: TreeOptions | undefined): TreeOptions {
  const values: Record<string, unknown> = Object.create(null);
  if (options !== undefined) {
    if (
      options === null ||
      typeof options !== "object" ||
      optionAccess(() => Array.isArray(options))
    )
      throw new TreeError(
        "invalid_options",
        "Tree options require a non-array object",
      );
    for (const key of ["showGenerateScopes", "pageSize"] as const)
      if (optionAccess(() => key in options))
        values[key] = optionAccess(() => options[key]);
  }
  if (
    "showGenerateScopes" in values &&
    typeof values.showGenerateScopes !== "boolean"
  )
    throw new TreeError(
      "invalid_options",
      "showGenerateScopes must be a boolean",
    );
  if (
    "pageSize" in values &&
    (typeof values.pageSize !== "number" ||
      !validateDefinition("PageLimit", values.pageSize))
  )
    throw new TreeError(
      "invalid_options",
      "pageSize must be a valid PageLimit",
    );
  return {
    showGenerateScopes:
      (values.showGenerateScopes as boolean | undefined) ?? true,
    ...("pageSize" in values ? { pageSize: values.pageSize as number } : {}),
  };
}
