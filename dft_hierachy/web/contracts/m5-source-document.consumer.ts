import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type {
  DefRef,
  ObjectRef,
  ResultOf,
  SnapshotId,
} from "@hier/protocol-types";
import {
  SourceDocumentError,
  SourceDocumentModel,
  type SourceDocument,
  type SourceDocumentFailure,
  type SourceDocumentLocation,
  type SourceDocumentState,
  type SourceDocumentTarget,
  type SourceTextRange,
} from "./m5-source-document.js";

declare const client: HierClient;
declare const object: ObjectRef;
declare const definition: DefRef;
declare const data: SourceDocument;
declare const failure: SourceDocumentFailure;
declare const range: SourceTextRange;
const model = new SourceDocumentModel(client);
const snapshot: SnapshotId = model.snapshotId;
const loading: Promise<void> = model.load(object, "instantiation");
const defining: Promise<void> = model.load(definition, "definition");
const statement: Promise<void> = model.load(object, "statement");
const reload: Promise<void> = model.reload();
const cancel: Promise<void> = model.cancel();
const clear: Promise<void> = model.clear();
const off: Unsubscribe = model.subscribe(() => model.state);
off();
model.dispose();
const target: SourceDocumentTarget = { ref: definition, kind: "definition" };
const ownError = new SourceDocumentError("inconsistent_reply", "Invalid span");
const cause: unknown = ownError.cause;

function locate(document: SourceDocument): string {
  const source: Reply<ResultOf<"obj.source">> = document.source;
  const content: Reply<ResultOf<"source.read">> = document.content;
  switch (document.location.status) {
    case "exact": {
      const { start, end } = document.location.range;
      return content.result.text.slice(start.offset, end.offset);
    }
    case "changed":
      return `Source changed: ${source.result.path}`;
    default: {
      const exhaustive: never = document.location;
      return exhaustive;
    }
  }
}
function render(state: SourceDocumentState): string {
  switch (state.status) {
    case "idle": {
      const empty: null = state.target;
      return String(empty);
    }
    case "pending":
      return `${state.target.ref} ${state.target.kind}`;
    case "success":
      return locate(state.data);
    case "failed":
    case "cancelled": {
      const path: readonly string[] | undefined = state.error.dataIssue?.path;
      return `${state.error.origin} ${state.error.code} ${path}`;
    }
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
const states: readonly SourceDocumentState[] = [
  { status: "idle", target: null },
  { status: "pending", target },
  { status: "success", target, data },
  { status: "failed", target, error: failure },
  { status: "cancelled", target, error: failure },
];
const locations: readonly SourceDocumentLocation[] = [
  { status: "exact", range },
  { status: "changed" },
];

// @ts-expect-error S01 no implicit reference coercion
model.load(1, "definition");
// @ts-expect-error S02 explicit kind is mandatory
model.load(object);
// @ts-expect-error S03 SourceKind belongs to the generated protocol
model.load(object, "auto");
// @ts-expect-error S04 callers supply primitives, not a target object
model.load(target, "definition");
// @ts-expect-error S05 clearing has its own command
model.load(null, "definition");
// @ts-expect-error S06 model owns its current target on reload
model.reload(object);
// @ts-expect-error S07 listeners must be callable
model.subscribe(1);
// @ts-expect-error S08 model never rebinds a snapshot
model.snapshotId = "replacement";
// @ts-expect-error S09 state publication belongs to the model
model.state = states[0]!;
// @ts-expect-error S10 target is immutable
target.kind = "statement";
// @ts-expect-error S11 current source text is immutable
data.content.result.text = "new text";
// @ts-expect-error S12 Core byte positions remain immutable
data.source.result.start.offset = 1;
// @ts-expect-error S13 presentation positions are immutable
range.start.column = 1;
// @ts-expect-error S14 exact location requires its range
const missingRange: SourceDocumentLocation = { status: "exact" };
// @ts-expect-error S15 changed text cannot carry an exact range
const staleRange: SourceDocumentLocation = { status: "changed", range };
// @ts-expect-error S16 pending cannot carry old data
const staleData: SourceDocumentState = { status: "pending", target, data };
// @ts-expect-error S17 success requires the complete document
const missingData: SourceDocumentState = { status: "success", target };
// @ts-expect-error S18 failed state requires a diagnostic
const missingFailure: SourceDocumentState = { status: "failed", target };
// @ts-expect-error S19 idle cannot retain a target
const staleTarget: SourceDocumentState = { status: "idle", target };
// @ts-expect-error S20 diagnostic metadata remains immutable
failure.dataIssue!.path.push("field");
// @ts-expect-error S21 error codes are closed
new SourceDocumentError("stale_file", "Invalid");
// @ts-expect-error S22 omitted range cannot be explicit undefined
const undefinedRange: SourceDocumentLocation = {
  status: "changed",
  range: undefined,
};
// @ts-expect-error S23 both original replies and location are required
const missingContent: SourceDocument = {
  source: data.source,
  location: data.location,
};
// @ts-expect-error S24 this model has no filesystem-path read API
model.readSource("/tmp/design.sv");

void [
  snapshot,
  loading,
  defining,
  statement,
  reload,
  cancel,
  clear,
  cause,
  render,
  states,
  locations,
  missingRange,
  staleRange,
  staleData,
  missingData,
  missingFailure,
  staleTarget,
  undefinedRange,
  missingContent,
];
