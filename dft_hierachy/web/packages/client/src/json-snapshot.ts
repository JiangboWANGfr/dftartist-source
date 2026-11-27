import { assertScalarString } from "./unicode.js";

export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

/** Reject lossy JSON values; copy before reading a caller's object asynchronously. */
export function jsonSnapshot(value: unknown, ancestors = new Set<object>()): unknown {
  return copyJSON(value, ancestors, false);
}

/** Publish a deeply immutable owning copy without a second container traversal. */
export function frozenJsonSnapshot(value: unknown): unknown {
  return copyJSON(value, new Set<object>(), true);
}

function copyJSON(value: unknown, ancestors: Set<object>, freeze: boolean): unknown {
  if (typeof value === "string") {
    assertScalarString(value);
    return value;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value))
    throw new TypeError("Expected an acyclic JSON value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const copy = Array.from(value, (v) => copyJSON(v, ancestors, freeze));
      return freeze ? Object.freeze(copy) : copy;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError("Expected a plain JSON object");
    const entries = Object.entries(value);
    // Validate keys before optional/unknown fields can be omitted at the boundary.
    for (const [key] of entries) assertScalarString(key);
    // Entries are private, with all parent values already captured. Transform
    // and compact them without allocating filter/map arrays or new tuples.
    let kept = 0;
    for (const entry of entries) {
      if (entry[1] === undefined) continue;
      entry[1] = copyJSON(entry[1], ancestors, freeze);
      entries[kept++] = entry;
    }
    entries.length = kept;
    const copy = Object.fromEntries(entries);
    return freeze ? Object.freeze(copy) : copy;
  } finally {
    ancestors.delete(value);
  }
}
