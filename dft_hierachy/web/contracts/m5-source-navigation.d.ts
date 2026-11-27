/** Isolated proposal only; normative behavior is DESIGN section 6.13. */
import type { HierClient, Unsubscribe } from "@hier/client";
import type {
  DefRef,
  ObjectRef,
  SnapshotId,
  SourceKind,
} from "@hier/protocol-types";
import type {
  SourceCandidatesOptions,
  SourceCandidatesState,
  SourceDocument,
  SourceDocumentState,
} from "@hier/viewmodel";

export interface SourceNavigationCandidates {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly state: Exclude<SourceCandidatesState, { readonly status: "idle" }>;
}
export interface SourceNavigationRefresh {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly completion: Promise<void>;
}
export interface SourceNavigationState {
  readonly document: SourceDocumentState;
  readonly candidates: SourceNavigationCandidates | null;
  readonly refresh: SourceNavigationRefresh | null;
}
export type SourceNavigationErrorCode = "disposed" | "reentrant_change";
export declare class SourceNavigationError extends Error {
  readonly code: SourceNavigationErrorCode;
  constructor(code: SourceNavigationErrorCode, message: string);
}
export declare class SourceNavigationModel {
  constructor(client: HierClient, options?: SourceCandidatesOptions);
  readonly snapshotId: SnapshotId;
  readonly state: SourceNavigationState;
  readonly disposed: boolean;
  load(ref: ObjectRef | DefRef, kind: SourceKind): Promise<void>;
  reloadDocument(): Promise<void>;
  cancelDocument(): Promise<void>;
  clear(): Promise<void>;
  locate(document: SourceDocument, utf16Offset: number): Promise<void>;
  loadMore(): Promise<void>;
  reloadCandidates(): Promise<void>;
  cancelCandidates(): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
  dispose(): void;
}
