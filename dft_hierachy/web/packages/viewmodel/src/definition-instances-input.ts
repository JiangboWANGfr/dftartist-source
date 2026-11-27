import { validateDefinition } from "@hier/protocol-types";
import type { SnapshotId } from "@hier/protocol-types";
import { QueryInput } from "./query-input.js";
import type { InputFields } from "./query-input.js";
import { DefinitionInstancesError } from "./definition-instances-types.js";
import type { DefinitionInstancesQuery } from "./definition-instances-types.js";

/** Capture both own fields before validation while the task owns input reentry. */
export function readDefinitionInstancesQuery(
  input: unknown,
  isDisposed: () => boolean,
  snapshotId: SnapshotId,
): DefinitionInstancesQuery {
  const reader: QueryInput<"invalid_argument"> = new QueryInput(
    DefinitionInstancesError,
    "invalid_argument",
    "Definition instances",
    isDisposed,
  );
  reader.assertActive();
  const source = reader.record(input);
  const captured: InputFields = Object.create(null);
  for (const key of ["snapshotId", "def"]) reader.field(source, key, captured);
  const requestedSnapshot = captured.snapshotId;
  if (
    typeof requestedSnapshot !== "string" ||
    !validateDefinition("SnapshotId", requestedSnapshot)
  )
    reader.invalid("snapshotId must be a valid snapshot identifier");
  const def = captured.def;
  if (typeof def !== "string" || !validateDefinition("DefRef", def))
    reader.invalid("def must be a valid definition reference");
  if (requestedSnapshot !== snapshotId)
    throw new DefinitionInstancesError(
      "snapshot_mismatch",
      "Definition instances query belongs to a different snapshot",
    );
  return Object.freeze({ snapshotId: requestedSnapshot, def });
}
