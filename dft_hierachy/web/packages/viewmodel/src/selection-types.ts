import type {
  BitRange,
  DefRef,
  ObjectRef,
  Side,
  SnapshotId,
} from "@hier/protocol-types";

const origins = ["tree", "graph", "source", "props", "external"] as const;
export type SelectionOrigin = (typeof origins)[number];

export function isSelectionOrigin(value: unknown): value is SelectionOrigin {
  return (
    typeof value === "string" && origins.includes(value as SelectionOrigin)
  );
}
export type SelectionBits = Readonly<Pick<BitRange, "lsb" | "width">>;

export interface ObjectSelection {
  readonly ref: ObjectRef;
  readonly bits?: SelectionBits;
  readonly side?: Side;
  readonly def?: never;
}

export interface DefinitionSelection {
  readonly def: DefRef;
  readonly ref?: never;
  readonly bits?: never;
  readonly side?: never;
}

export type SelectionItem = ObjectSelection | DefinitionSelection;

export interface Selection {
  readonly items: readonly SelectionItem[];
  readonly origin: SelectionOrigin;
  readonly snapshotId?: SnapshotId;
}

export interface SelectionOptions {
  readonly snapshotId?: SnapshotId;
  readonly historyLimit?: number;
}

export type SelectionErrorCode =
  | "invalid_options"
  | "invalid_selection"
  | "snapshot_mismatch"
  | "disposed"
  | "reentrant_change";

export class SelectionError extends Error {
  constructor(
    readonly code: SelectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SelectionError";
  }
}
