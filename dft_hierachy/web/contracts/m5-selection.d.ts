/**
 * M5-A-01 declaration proposal; normative behavior: DESIGN section 6.5.
 * Not a production export or an implementation. Pending C review / B freeze.
 */
import type { Unsubscribe } from "@hier/client";
import type {
  BitRange,
  DefRef,
  ObjectRef,
  Side,
  SnapshotId,
} from "@hier/protocol-types";

export type SelectionOrigin =
  "tree" | "graph" | "source" | "props" | "external";
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

export declare class SelectionError extends Error {
  readonly code: SelectionErrorCode;
  constructor(code: SelectionErrorCode, message: string);
}

export declare class SelectionModel {
  constructor(options?: SelectionOptions);
  readonly snapshotId: SnapshotId | undefined;
  readonly current: Selection;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly disposed: boolean;
  select(selection: Selection): void;
  back(): void;
  forward(): void;
  subscribe(listener: (selection: Selection) => void): Unsubscribe;
  dispose(): void;
}
