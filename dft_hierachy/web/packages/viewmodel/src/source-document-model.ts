import type { HierClient, Unsubscribe } from "@hier/client";
import { validateDefinition } from "@hier/protocol-types";
import type {
  DefRef,
  ObjectRef,
  SnapshotId,
  SourceKind,
} from "@hier/protocol-types";
import { TargetDataModel } from "./target-data-model.js";
import type { TargetLoad } from "./target-data-model.js";
import { SourceDocumentError } from "./source-document-types.js";
import type {
  SourceDocument,
  SourceDocumentState,
  SourceDocumentTarget,
} from "./source-document-types.js";
import {
  projectSourceLocation,
  projectSourcePoint,
} from "./source-location.js";
import type { SourceCandidatesQuery } from "./source-candidates-types.js";
import { SourcePositionError } from "./source-position-error.js";
import { registerQueryOwner } from "./query-coordination.js";

function loadDocument(
  task: TargetLoad<SourceDocumentTarget, SourceDocument>,
): void {
  task.observe(
    (client, signal) =>
      client.source(task.target.ref, task.target.kind, signal),
    (source) => {
      // observe checks task identity again before issuing the second SDK call.
      task.observe(
        (client, signal) => client.readSource(source.result.file, signal),
        (content) => {
          const location = projectSourceLocation(source.result, content.result);
          task.complete(Object.freeze({ source, content, location }));
        },
      );
    },
  );
}

/** One explicit source target in a borrowed ready SDK snapshot. */
export class SourceDocumentModel {
  readonly #model: TargetDataModel<
    SourceDocumentTarget,
    SourceDocument,
    "source"
  >;

  constructor(client: HierClient) {
    this.#model = new TargetDataModel(client, {
      Error: SourceDocumentError,
      origin: "source",
      label: "Source",
      replyName: "source document",
      sameTarget: (left, right) =>
        left.ref === right.ref && left.kind === right.kind,
      begin: loadDocument,
    });
    registerQueryOwner(this, this.#model);
  }
  get snapshotId(): SnapshotId {
    return this.#model.snapshotId;
  }
  get state(): SourceDocumentState {
    return this.#model.state;
  }
  get disposed(): boolean {
    return this.#model.disposed;
  }
  /** Derive a byte point only from the document currently published by this model. */
  queryAt(
    document: SourceDocument,
    utf16Offset: number,
  ): SourceCandidatesQuery & { readonly col: number } {
    if (this.#model.disposed)
      throw new SourcePositionError("disposed", "Source model is disposed");
    const current = this.#model.state;
    // Identity comparison never inspects an untrusted document (even a revoked
    // Proxy). The remaining reads use the model's own frozen data only.
    if (current.status !== "success" || document !== current.data)
      throw new SourcePositionError(
        "stale_document",
        "Document is not current",
      );
    if (current.data.location.status !== "exact")
      throw new SourcePositionError(
        "changed_document",
        "Source text has changed",
      );
    const text = current.data.content.result.text;
    if (
      typeof utf16Offset !== "number" ||
      !Number.isSafeInteger(utf16Offset) ||
      utf16Offset < 0 ||
      utf16Offset > text.length
    )
      throw new SourcePositionError(
        "invalid_argument",
        "Invalid source text offset",
      );
    const point = projectSourcePoint(text, utf16Offset);
    if (point === undefined)
      throw new SourcePositionError(
        "invalid_argument",
        "Offset splits a scalar or CRLF",
      );
    return Object.freeze({
      snapshotId: this.#model.snapshotId,
      file: current.data.source.result.file,
      line: point.line,
      col: point.col,
    });
  }
  load(ref: ObjectRef | DefRef, kind: SourceKind): Promise<void> {
    return this.#model.load(() => {
      if (
        typeof ref !== "string" ||
        (!validateDefinition("ObjectRef", ref) &&
          !validateDefinition("DefRef", ref))
      )
        throw new SourceDocumentError(
          "invalid_argument",
          "An object or definition reference is required",
        );
      if (typeof kind !== "string" || !validateDefinition("SourceKind", kind))
        throw new SourceDocumentError(
          "invalid_argument",
          "A source kind is required",
        );
      return Object.freeze({ ref, kind });
    });
  }
  reload(): Promise<void> {
    return this.#model.reload();
  }
  cancel(): Promise<void> {
    return this.#model.cancel();
  }
  clear(): Promise<void> {
    return this.#model.clear();
  }
  subscribe(listener: () => void): Unsubscribe {
    return this.#model.subscribe(listener);
  }
  dispose(): void {
    this.#model.dispose();
  }
}
