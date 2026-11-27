import type { ObjectRef, SnapshotId } from "@hier/protocol-types";

export interface AnnotationMark {
  readonly color?: string;
  readonly badge?: string;
  readonly tooltip?: string;
  readonly severity?: "info" | "warn" | "error";
}
export interface ObjectAnnotation {
  readonly ref: ObjectRef;
  readonly mark: AnnotationMark;
}
export interface AnnotationLayerOptions {
  readonly snapshotId: SnapshotId;
  readonly id: string;
  readonly label: string;
}
export interface AnnotationLayerState {
  readonly snapshotId: SnapshotId;
  readonly id: string;
  readonly label: string;
  readonly revision: number;
  readonly status: "active" | "disposed";
  readonly marks: readonly ObjectAnnotation[];
}
export type AnnotationErrorCode =
  "invalid_argument" | "snapshot_mismatch" | "disposed" | "reentrant_change" | "revision_exhausted";
export class AnnotationError extends Error {
  constructor(
    readonly code: AnnotationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnnotationError";
  }
}
export interface ResolvedObjectAnnotation {
  readonly layer: AnnotationLayerState;
  readonly entry: ObjectAnnotation;
}
