import * as validators from "./validators.generated.js";
import { METHODS, PARAM_DESCRIPTORS, type MethodMap } from "./registry.generated.js";
import type { WireDefinitions } from "./wire.generated.js";

export type MethodName = keyof MethodMap;
export type ParamsOf<M extends MethodName> = MethodMap[M]["params"];
export type ResultOf<M extends MethodName> = MethodMap[M]["result"];

/** Structural validation only; Core owns cross-field/domain rules. Never mutates input. */
export function validateDefinition<N extends keyof WireDefinitions>(
  name: N,
  value: unknown,
): value is WireDefinitions[N] {
  return Boolean(validators[name](value));
}

interface Descriptor {
  type?: string | string[];
  default?: unknown;
  properties?: Record<string, Descriptor>;
  items?: Descriptor;
}
const descriptors: Record<string, Descriptor> = PARAM_DESCRIPTORS;
const emptyDescriptor: Descriptor = {};
const noFields: readonly string[] = [];
// Only finite, generated schema metadata is retained, never query parameters.
// Defaults and child descriptors still come from the same generated source.
const fieldOrders = new WeakMap<Descriptor, readonly string[]>();
function indexDescriptor(descriptor: Descriptor): void {
  if (fieldOrders.has(descriptor)) return;
  const keys = descriptor.properties ? Object.keys(descriptor.properties).sort() : noFields;
  fieldOrders.set(descriptor, keys);
  for (const key of keys) indexDescriptor(descriptor.properties![key]!);
  if (descriptor.items) indexDescriptor(descriptor.items);
}
indexDescriptor(emptyDescriptor);
for (const descriptor of Object.values(descriptors)) indexDescriptor(descriptor);

function canonical(value: unknown, d: Descriptor): unknown {
  if (value === undefined) value = d.default;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((v) => canonical(v, d.items ?? emptyDescriptor));
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    // Unknown fields are accepted on input for forward compatibility but are not
    // forwarded by an older client. All supported fields come from the schema.
    const entries: [string, unknown][] = [];
    const keys = fieldOrders.get(d) ?? Object.keys(d.properties ?? {}).sort();
    for (const key of keys) {
      const item = canonical(object[key], d.properties![key]!);
      if (item !== undefined) entries.push([key, item]);
    }
    return Object.fromEntries(entries);
  }
  return value;
}

/** Call only after validation and JSON snapshotting. No hand-maintained defaults. */
export function canonicalParams<M extends MethodName>(method: M, params: ParamsOf<M>): ParamsOf<M> {
  return canonical(params, descriptors[METHODS[method].params]!) as ParamsOf<M>;
}
