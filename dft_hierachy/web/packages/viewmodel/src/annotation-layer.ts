import { validateDefinition, type ObjectRef, type SnapshotId } from "@hier/protocol-types";
import { captureJSON } from "./json-input.js";
import { QueryInput, type InputFields } from "./query-input.js";
import { AnnotationError } from "./annotation-types.js";
import type {
  AnnotationLayerOptions,
  AnnotationLayerState,
  ObjectAnnotation,
  ResolvedObjectAnnotation,
} from "./annotation-types.js";

const emptyMarks: readonly ObjectAnnotation[] = Object.freeze([]);
type Reader = QueryInput<"invalid_argument">;
const readerFor = (disposed = () => false): Reader =>
  new QueryInput(AnnotationError, "invalid_argument", "Annotation", disposed);

function fields(value: unknown, required: string[], optional: string[], r: Reader): InputFields {
  const record = r.record(value);
  if (
    required.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !required.includes(key) && !optional.includes(key))
  )
    r.invalid("Annotation record has missing or unknown fields");
  return record;
}
function opaque(value: unknown, kind: "SnapshotId" | "ObjectRef", r: Reader): void {
  if (!validateDefinition(kind, value)) r.invalid(`Invalid annotation ${kind}`);
}

// Shallow capture is essential here: layers are real owned models, not JSON records.
function captureList(input: unknown, r: Reader): unknown[] {
  if (!r.read(() => Array.isArray(input))) r.invalid("Annotation input must be an array");
  const array = input as unknown[];
  const keys = r.read(() => Reflect.ownKeys(array));
  const length = r.read(() => array.length);
  if (
    !Number.isInteger(length) ||
    length < 0 ||
    length > 0xffffffff ||
    keys.length !== length + 1 ||
    !keys.includes("length") ||
    keys.filter((key) => key !== "length").some((key, i) => key !== String(i))
  )
    r.invalid("Annotation arrays require only contiguous own slots");
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) result.push(r.read(() => array[i]));
  return result;
}

// Assigned inside the class so pure queries use its private brand and a consistent
// state/index pair without invoking overridable instance accessors or methods.
let readLayer: (value: unknown) => {
  state: AnnotationLayerState;
  byRef: ReadonlyMap<ObjectRef, ObjectAnnotation>;
};

/** A host-owned synchronous layer of immutable, snapshot-bound display marks. */
export class AnnotationLayer {
  #state: AnnotationLayerState;
  #byRef = new Map<ObjectRef, ObjectAnnotation>();
  #changing = false;
  #listeners = new Set<{ listener: () => void }>();

  static {
    readLayer = (value) => {
      const layer = value as AnnotationLayer;
      return { state: layer.#state, byRef: layer.#byRef };
    };
  }

  constructor(options: AnnotationLayerOptions) {
    const r = readerFor();
    const owned = fields(
      captureJSON(options, r, "Annotation"),
      ["snapshotId", "id", "label"],
      [],
      r,
    );
    opaque(owned.snapshotId, "SnapshotId", r);
    for (const key of ["id", "label"])
      if (typeof owned[key] !== "string" || !(owned[key] as string).trim())
        r.invalid(`Annotation ${key} must be nonblank`);
    this.#state = Object.freeze({
      snapshotId: owned.snapshotId as SnapshotId,
      id: owned.id as string,
      label: owned.label as string,
      status: "active",
      revision: 0,
      marks: emptyMarks,
    });
  }

  get state(): AnnotationLayerState {
    return this.#state;
  }
  get disposed(): boolean {
    return this.#state.status === "disposed";
  }

  set(marks: readonly ObjectAnnotation[]): void {
    this.#replace(marks);
  }
  clear(): void {
    this.#replace(emptyMarks);
  }

  #replace(input: readonly ObjectAnnotation[]): void {
    const r: Reader = readerFor(() => this.#state.status === "disposed");
    r.assertActive();
    if (this.#changing)
      throw new AnnotationError("reentrant_change", "Annotation change is in progress");
    this.#changing = true;
    try {
      const owned = captureJSON(input, r, "Annotation");
      if (!Array.isArray(owned)) r.invalid("Annotation marks must be an array");
      const byRef = new Map<ObjectRef, ObjectAnnotation>();
      for (const item of owned) {
        const entry = fields(item, ["ref", "mark"], [], r);
        opaque(entry.ref, "ObjectRef", r);
        const mark = fields(entry.mark, [], ["color", "badge", "tooltip", "severity"], r);
        for (const key of Object.keys(mark)) {
          const value = mark[key];
          if (typeof value !== "string") r.invalid(`Annotation ${key} must be text`);
          if (key === "color" && !/^#[0-9a-fA-F]{6}$/.test(value as string))
            r.invalid("Annotation color must be #RRGGBB");
          if (key === "severity" && !["info", "warn", "error"].includes(value as string))
            r.invalid("Invalid annotation severity");
        }
        const ref = entry.ref as ObjectRef;
        if (byRef.has(ref)) r.invalid("Duplicate annotation object ref");
        byRef.set(ref, item as ObjectAnnotation);
      }
      if (this.#state.revision === Number.MAX_SAFE_INTEGER)
        throw new AnnotationError("revision_exhausted", "Annotation revision is exhausted");
      this.#byRef = byRef;
      this.#state = Object.freeze({
        ...this.#state,
        revision: this.#state.revision + 1,
        marks: owned as ObjectAnnotation[],
      });
      const errors: unknown[] = [];
      for (const registration of [...this.#listeners]) {
        if (this.#state.status === "disposed") break;
        if (!this.#listeners.has(registration)) continue;
        try {
          registration.listener();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Annotation listeners failed");
    } finally {
      this.#changing = false;
    }
  }

  subscribe(listener: () => void): () => void {
    const r = readerFor(() => this.#state.status === "disposed");
    r.assertActive();
    if (typeof listener !== "function") r.invalid("Annotation listener must be a function");
    const registration = { listener };
    this.#listeners.add(registration);
    return () => {
      this.#listeners.delete(registration);
    };
  }

  dispose(): void {
    if (this.#state.status === "disposed") return;
    this.#state = Object.freeze({ ...this.#state, status: "disposed", marks: emptyMarks });
    this.#byRef.clear();
    this.#listeners.clear();
  }
}

export function resolveObjectAnnotations(
  snapshotId: SnapshotId,
  refs: readonly ObjectRef[],
  layers: readonly AnnotationLayer[],
): readonly ResolvedObjectAnnotation[] {
  const r = readerFor();
  opaque(snapshotId, "SnapshotId", r);
  const capturedRefs = captureList(refs, r);
  const capturedLayers = captureList(layers, r);
  for (const ref of capturedRefs) opaque(ref, "ObjectRef", r);
  const ids = new Set<string>();
  const states = capturedLayers.map((value) => {
    let captured: ReturnType<typeof readLayer>;
    try {
      captured = readLayer(value);
    } catch {
      return r.invalid("Expected a genuine AnnotationLayer");
    }
    if (ids.has(captured.state.id)) r.invalid("Duplicate annotation layer id");
    ids.add(captured.state.id);
    return captured;
  });
  if (states.some(({ state }) => state.snapshotId !== snapshotId))
    throw new AnnotationError("snapshot_mismatch", "Annotation layers must share the snapshot");
  const uniqueRefs = [...new Set(capturedRefs as ObjectRef[])];
  const result: ResolvedObjectAnnotation[] = [];
  for (const { state, byRef } of states) {
    if (state.status === "disposed") continue;
    for (const ref of uniqueRefs) {
      const entry = byRef.get(ref);
      if (entry) result.push(Object.freeze({ layer: state, entry }));
    }
  }
  return Object.freeze(result);
}
