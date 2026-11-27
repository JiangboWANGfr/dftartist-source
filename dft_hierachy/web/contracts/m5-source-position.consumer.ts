import type { HierClient, Unsubscribe } from "@hier/client";
import type { ObjectRef, SnapshotId } from "@hier/protocol-types";
import {
  SourceCandidatesModel,
  type SourceCandidatesQuery,
  type SourceDocument,
  type SourceDocumentErrorCode,
  type SourceDocumentModel as ProductionSourceDocumentModel,
  type SourceDocumentState,
} from "@hier/viewmodel";
import {
  SourceDocumentModel,
  SourcePositionError,
  type SourcePositionErrorCode,
} from "./m5-source-position.js";

declare const client: HierClient;
declare const document: SourceDocument;
declare const ref: ObjectRef;
declare const report: (error: unknown) => void;
declare const display: (
  text: string,
  click: (utf16Offset: number) => void,
) => void;

const source = new SourceDocumentModel(client);
const candidates = new SourceCandidatesModel(client);
const inheritedModel: ProductionSourceDocumentModel = source;
const snapshotId: SnapshotId = source.snapshotId;
const disposed: boolean = source.disposed;
const state: SourceDocumentState = source.state;
const unsubscribe: Unsubscribe = source.subscribe(() => {
  // A synchronous derived read is permitted during a success notification.
  const current = source.state;
  if (current.status === "success") {
    try {
      const point = source.queryAt(current.data, 0);
      const column: number = point.col;
      void column;
    } catch (error) {
      report(error);
    }
  }
});

// Type wiring only: capture the data wrapper actually supplied to the display.
// This is not a SourceView or a host lifecycle/selection implementation.
if (state.status === "success") {
  const displayedDocument = state.data;
  const onClick = (utf16Offset: number): void => {
    try {
      const query = source.queryAt(displayedDocument, utf16Offset);
      // No await, queue or intervening host action between mapping and load.
      void candidates.load(query).catch(report);
    } catch (error) {
      report(error);
    }
  };
  display(displayedDocument.content.result.text, onClick);

  // If a host defers a click, queue the callback, not its previously mapped
  // query: onClick invokes queryAt again when the queued work actually runs.
  const enqueueClick = (utf16Offset: number): void => {
    queueMicrotask(() => onClick(utf16Offset));
  };
  void enqueueClick;
}

const point = source.queryAt(document, 0);
const query: SourceCandidatesQuery = point;
const column: number = point.col;
const wholeLine: SourceCandidatesQuery = {
  snapshotId,
  file: "f:0",
  line: 1,
};
const error = new SourcePositionError(
  "stale_document",
  "Document was replaced",
);
const nativeError: Error = error;
const positionCodes: Record<SourcePositionErrorCode, true> = {
  disposed: true,
  stale_document: true,
  changed_document: true,
  invalid_argument: true,
};
type ExpectedDocumentCodes =
  | "invalid_argument"
  | "disposed"
  | "cancelled"
  | "inconsistent_reply"
  | "reentrant_change";
type AssertTrue<T extends true> = T;
type DocumentCodesUnchanged = AssertTrue<
  [SourceDocumentErrorCode] extends [ExpectedDocumentCodes]
    ? [ExpectedDocumentCodes] extends [SourceDocumentErrorCode]
      ? true
      : false
    : false
>;

const inheritedCommands: Promise<void>[] = [
  source.load(ref, "definition"),
  source.reload(),
  source.cancel(),
  source.clear(),
];
for (const command of inheritedCommands) void command.catch(report);
unsubscribe();
const disposeResult: void = source.dispose();
void [
  inheritedModel,
  disposed,
  query,
  column,
  nativeError,
  positionCodes,
  disposeResult,
];

// @ts-expect-error P01 the inherited constructor still requires a client
new SourceDocumentModel();
// @ts-expect-error P02 the original-text offset is required
source.queryAt(document);
// @ts-expect-error P03 a reference or offset is not a document
source.queryAt(0, 0);
// @ts-expect-error P04 null cannot replace a published document
source.queryAt(null, 0);
// @ts-expect-error P05 numeric strings are not UTF-16 offsets
source.queryAt(document, "0");
// @ts-expect-error P06 boxed numbers are not offsets
source.queryAt(document, new Number(0));
// @ts-expect-error P07 undefined is not an offset
source.queryAt(document, undefined);
// @ts-expect-error P08 no selection or query options are accepted
source.queryAt(document, 0, { select: true });
// @ts-expect-error P09 queryAt returns the query synchronously
const pendingQuery: Promise<SourceCandidatesQuery> = point;
// @ts-expect-error P10 the result has no asynchronous then method
point.then(() => {});
// @ts-expect-error P11 a whole-line query lacks the required point column
const missingColumn: ReturnType<SourceDocumentModel["queryAt"]> = wholeLine;
// @ts-expect-error P12 the mapped column is readonly
point.col = 2;
// @ts-expect-error P13 the mapped line is readonly
point.line = 2;
// @ts-expect-error P14 the mapped file is readonly
point.file = "f:1";
// @ts-expect-error P15 the mapped snapshot identity is readonly
point.snapshotId = "another";
// @ts-expect-error P16 synchronous mapping does not introduce cancellation
new SourcePositionError("cancelled", "x");
// @ts-expect-error P17 the position error code is readonly
error.code = "disposed";
// @ts-expect-error P18 the old document error union excludes stale_document
const oldStaleCode: SourceDocumentErrorCode = "stale_document";
// @ts-expect-error P19 the old document error union excludes changed_document
const oldChangedCode: SourceDocumentErrorCode = "changed_document";
// @ts-expect-error P20 the inherited load method remains asynchronous
const synchronousLoad: void = source.load(ref, "definition");
void [
  pendingQuery,
  missingColumn,
  oldStaleCode,
  oldChangedCode,
  synchronousLoad,
];
