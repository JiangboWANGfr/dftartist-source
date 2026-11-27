import { validateDefinition } from "@hier/protocol-types";
import { QueryInput } from "./query-input.js";
import type { InputFields } from "./query-input.js";
import { ObjectConnectionsError } from "./object-connections-types.js";
import type { ObjectConnectionsTarget } from "./object-connections-types.js";

function integer(
  reader: QueryInput<"invalid_argument">,
  value: unknown,
  definition: "UInt" | "PositiveInt",
  name: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    !validateDefinition(definition, value)
  )
    reader.invalid(`${name} must satisfy ${definition} as a safe integer`);
  return value;
}

/** Capture declared fields before validation; the owner guards command reentry. */
export function readConnectionsTarget(
  input: unknown,
  isDisposed: () => boolean,
): ObjectConnectionsTarget {
  const reader: QueryInput<"invalid_argument"> = new QueryInput(
    ObjectConnectionsError,
    "invalid_argument",
    "Object connections",
    isDisposed,
  );
  reader.assertActive();
  const source = reader.record(input);
  const root: InputFields = Object.create(null);
  for (const key of ["slice", "reach", "side"]) reader.field(source, key, root);
  const sliceSource = reader.record(root.slice);
  const slice: InputFields = Object.create(null);
  for (const key of ["ref", "bits"]) reader.field(sliceSource, key, slice);
  let capturedBits: InputFields | undefined;
  if ("bits" in slice) {
    const bitsSource = reader.record(slice.bits);
    capturedBits = Object.create(null) as InputFields;
    for (const key of ["lsb", "width"])
      reader.field(bitsSource, key, capturedBits);
  }

  const ref = slice.ref;
  if (typeof ref !== "string" || !validateDefinition("ObjectRef", ref))
    reader.invalid("slice.ref must be a valid object reference");
  const reach = root.reach;
  if (reach !== "local" && reach !== "hier")
    reader.invalid("reach must be local or hier");
  const side = root.side;
  if ("side" in root && side !== "inside" && side !== "outside")
    reader.invalid("side must be inside or outside when present");
  const bits =
    capturedBits === undefined
      ? undefined
      : Object.freeze({
          lsb: integer(reader, capturedBits.lsb, "UInt", "bits.lsb"),
          width: integer(
            reader,
            capturedBits.width,
            "PositiveInt",
            "bits.width",
          ),
        });
  return Object.freeze({
    slice: Object.freeze({ ref, ...(bits === undefined ? {} : { bits }) }),
    reach,
    ...(side === "inside" || side === "outside" ? { side } : {}),
  });
}

/** Only owned, validated targets reach this comparison. */
export function sameConnectionsTarget(
  left: ObjectConnectionsTarget,
  right: ObjectConnectionsTarget,
): boolean {
  const a = left.slice.bits;
  const b = right.slice.bits;
  return (
    left.slice.ref === right.slice.ref &&
    left.reach === right.reach &&
    left.side === right.side &&
    (a === undefined
      ? b === undefined
      : b !== undefined && a.lsb === b.lsb && a.width === b.width)
  );
}
