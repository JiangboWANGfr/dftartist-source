import { validateDefinition } from "@hier/protocol-types";
import type { HitKind, SnapshotId } from "@hier/protocol-types";
import { QueryInput } from "./query-input.js";
import type { InputFields } from "./query-input.js";
import { SearchError } from "./search-types.js";
import type { SearchQuery } from "./search-types.js";

/** Capture every own array slot before validating any element. */
function captureKinds(
  reader: QueryInput<"invalid_argument">,
  value: unknown,
): unknown[] {
  if (!reader.read(() => Array.isArray(value)))
    reader.invalid("kinds must be an array");
  // Array.isArray above is guarded by QueryInput so revoked proxies and dispose
  // have the same precedence as every other caller-controlled operation.
  const array = value as unknown[];
  const length: unknown = reader.read(() => Reflect.get(array, "length"));
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 0xffffffff
  )
    reader.invalid("kinds length must be a valid array length");
  const captured: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const key = String(index);
    const descriptor = reader.read(() =>
      Object.getOwnPropertyDescriptor(array, key),
    );
    // A missing slot is invalid just like undefined, but does not stop the
    // projection of later getters. No inherited value or iterator is read.
    captured.push(
      descriptor === undefined
        ? undefined
        : reader.read(() => Reflect.get(array, key)),
    );
  }
  return captured;
}

/** Called while QueryDataModel owns the input reentry guard. */
export function readSearchQuery(
  input: unknown,
  isDisposed: () => boolean,
  snapshotId: SnapshotId,
): SearchQuery {
  const reader: QueryInput<"invalid_argument"> = new QueryInput(
    SearchError,
    "invalid_argument",
    "Search",
    isDisposed,
  );
  reader.assertActive();
  const source = reader.record(input);
  const captured: InputFields = Object.create(null);
  for (const key of ["snapshotId", "text", "kinds", "scope"])
    reader.field(source, key, captured);
  const projectedKinds =
    "kinds" in captured ? captureKinds(reader, captured.kinds) : undefined;

  const requestedSnapshot = captured.snapshotId;
  if (
    typeof requestedSnapshot !== "string" ||
    !validateDefinition("SnapshotId", requestedSnapshot)
  )
    reader.invalid("snapshotId must be a valid snapshot identifier");
  const text = captured.text;
  if (typeof text !== "string" || !validateDefinition("Text", text))
    reader.invalid("text must be a string");
  const kinds = projectedKinds?.map((kind): HitKind => {
    if (typeof kind !== "string" || !validateDefinition("HitKind", kind))
      reader.invalid("kinds must contain valid hit kinds");
    return kind;
  });
  const scope = captured.scope;
  if (
    "scope" in captured &&
    (typeof scope !== "string" || !validateDefinition("ObjectRef", scope))
  )
    reader.invalid("scope must be a valid object reference");
  if (requestedSnapshot !== snapshotId)
    throw new SearchError(
      "snapshot_mismatch",
      "Search query belongs to a different snapshot",
    );
  return Object.freeze({
    snapshotId: requestedSnapshot,
    text,
    ...(kinds === undefined ? {} : { kinds: Object.freeze(kinds) }),
    ...(typeof scope === "string" ? { scope } : {}),
  });
}
