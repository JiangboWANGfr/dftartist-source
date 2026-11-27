import { validateDefinition } from "@hier/protocol-types";
import type { SnapshotId } from "@hier/protocol-types";
import { QueryInput, type InputFields } from "./query-input.js";
import {
  PathResolutionError,
  type PathResolutionQuery,
} from "./path-resolution-types.js";

/** Capture original text once; Core owns all path syntax and normalization. */
export function readPathResolutionQuery(
  input: unknown,
  isDisposed: () => boolean,
  snapshotId: SnapshotId,
): PathResolutionQuery {
  const reader: QueryInput<"invalid_argument"> = new QueryInput(
    PathResolutionError,
    "invalid_argument",
    "Path resolution",
    isDisposed,
  );
  reader.assertActive();
  const source = reader.record(input);
  const captured: InputFields = Object.create(null);
  for (const key of ["snapshotId", "text"]) reader.field(source, key, captured);
  const requestedSnapshot = captured.snapshotId;
  if (
    typeof requestedSnapshot !== "string" ||
    !validateDefinition("SnapshotId", requestedSnapshot)
  )
    reader.invalid("snapshotId must be a valid snapshot identifier");
  const text = captured.text;
  if (typeof text !== "string" || !validateDefinition("Text", text))
    reader.invalid("text must be a valid string");
  if (requestedSnapshot !== snapshotId)
    throw new PathResolutionError(
      "snapshot_mismatch",
      "Path resolution query belongs to a different snapshot",
    );
  return Object.freeze({ snapshotId: requestedSnapshot, text });
}
