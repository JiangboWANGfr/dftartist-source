import { validateDefinition } from "@hier/protocol-types";
import type { SnapshotId } from "@hier/protocol-types";
import { SourceCandidatesError } from "./source-candidates-types.js";
import type { SourceCandidatesQuery } from "./source-candidates-types.js";

import { readPageSize } from "./page-options.js";
import { QueryInput } from "./query-input.js";
import type { InputFields as Fields } from "./query-input.js";

type InputCode = "invalid_options" | "invalid_argument";

class SourceCandidatesInput extends QueryInput<InputCode> {
  constructor(code: InputCode, isDisposed: () => boolean) {
    super(SourceCandidatesError, code, "Source candidates", isDisposed);
  }

  positiveInteger(
    value: unknown,
    definition: "UInt" | "PageLimit",
    name: string,
  ): number {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      !validateDefinition(definition, value)
    )
      this.invalid(`${name} must be a positive safe integer`);
    return value;
  }
}

export function readSourceCandidatesOptions(options: unknown): number {
  return readPageSize(options, SourceCandidatesError, "Source candidates");
}

/** The owning model holds its input reentry guard for this entire call. */
export function readSourceCandidatesQuery(
  input: unknown,
  isDisposed: () => boolean,
  snapshotId: SnapshotId,
): SourceCandidatesQuery {
  const reader: SourceCandidatesInput = new SourceCandidatesInput(
    "invalid_argument",
    isDisposed,
  );
  reader.assertActive();
  const source = reader.record(input);
  const captured: Fields = Object.create(null);
  for (const key of ["snapshotId", "file", "line", "col"])
    reader.field(source, key, captured);

  // Validate only owned values, after every declared field has been projected.
  const requestedSnapshot = captured.snapshotId;
  if (
    typeof requestedSnapshot !== "string" ||
    !validateDefinition("SnapshotId", requestedSnapshot)
  )
    reader.invalid("snapshotId must be a valid snapshot identifier");
  const file = captured.file;
  if (typeof file !== "string" || !validateDefinition("FileRef", file))
    reader.invalid("file must be a valid file reference");
  const line = reader.positiveInteger(captured.line, "UInt", "line");
  const col =
    "col" in captured
      ? reader.positiveInteger(captured.col, "UInt", "col")
      : undefined;
  if (requestedSnapshot !== snapshotId)
    throw new SourceCandidatesError(
      "snapshot_mismatch",
      "Source candidates query belongs to a different snapshot",
    );
  return Object.freeze({
    snapshotId: requestedSnapshot,
    file,
    line,
    ...(col === undefined ? {} : { col }),
  });
}
