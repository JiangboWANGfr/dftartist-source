import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type { ObjectRef, ResultOf, SnapshotId } from "@hier/protocol-types";
import {
  SourceCandidatesModel,
  SourceDocumentModel,
  type SourceCandidatesPage,
  type SourceCandidatesQuery,
  type SourceCandidatesState,
  type SourceDocument,
  type SourceDocumentErrorCode,
  type SourceDocumentState,
  type SourcePositionErrorCode,
} from "@hier/viewmodel";
import {
  SourceNavigationModel,
  SourceNavigationError,
  type SourceNavigationCandidates,
  type SourceNavigationErrorCode,
  type SourceNavigationRefresh,
  type SourceNavigationState,
} from "./m5-source-navigation.js";

declare const client: HierClient;
declare const ref: ObjectRef;
declare const document: SourceDocument;
declare const query: SourceCandidatesQuery;
declare const binding: SourceNavigationCandidates;
declare const refresh: SourceNavigationRefresh;
declare const page: SourceCandidatesPage;
// These example feedback sinks do not throw or mutate the model. They represent
// host reporting only; this compile-only consumer does not implement a host.
declare const report: (error: unknown) => void;
declare const reportRefreshSuccess: (task: SourceNavigationRefresh) => void;
declare const display: (
  text: string,
  click: (utf16Offset: number) => void,
) => void;

// The host owns this coordinator. Its child models are not exposed or supplied.
const navigation = new SourceNavigationModel(client, { pageSize: 100 });
const snapshotId: SnapshotId = navigation.snapshotId;
const state: SourceNavigationState = navigation.state;
const documentState: SourceDocumentState = state.document;
const observedRefresh = new WeakSet<SourceNavigationRefresh>();
const observeRefresh = (): void => {
  const task = navigation.state.refresh;
  if (task === null || observedRefresh.has(task)) return;
  observedRefresh.add(task);
  // Observe the original completion immediately. Promise feedback runs later,
  // so check the current task identity and disposal again inside each handler.
  void task.completion.then(
    () => {
      if (!navigation.disposed && navigation.state.refresh === task)
        reportRefreshSuccess(task);
    },
    (error: unknown) => {
      if (!navigation.disposed && navigation.state.refresh === task)
        report(error);
    },
  );
};
const unsubscribe: Unsubscribe = navigation.subscribe(observeRefresh);
observeRefresh(); // subscribe does not replay the current state.

// Rendering is separate from the notification observer above. A click carries
// the exact document wrapper that supplied the displayed text, even if a later
// publication has replaced it by the time the user clicks.
if (documentState.status === "success") {
  const displayedDocument = documentState.data;
  display(displayedDocument.content.result.text, (utf16Offset) => {
    const command: Promise<void> = navigation.locate(
      displayedDocument,
      utf16Offset,
    );
    void command.catch(report);
  });
}

function observeCommand(command: Promise<void>): void {
  void command.catch(report);
}
// Commands are invoked outside subscription callbacks. Each returned original
// promise is observed immediately; no await is hidden in the observer.
observeCommand(navigation.load(ref, "definition"));
observeCommand(navigation.reloadDocument());
observeCommand(navigation.cancelDocument());
observeCommand(navigation.locate(document, 0));
observeCommand(navigation.loadMore());
observeCommand(navigation.reloadCandidates());
observeCommand(navigation.cancelCandidates());
observeCommand(navigation.clear());

if (state.candidates !== null) {
  const boundDocument: SourceDocument = state.candidates.document;
  const originalState: SourceCandidatesState = state.candidates.state;
  for (const originalPage of originalState.pages) {
    const raw: Reply<ResultOf<"source.resolve">> = originalPage;
    void raw;
  }
  void boundDocument;
}
const completion: Promise<void> = refresh.completion;
const error = new SourceNavigationError("disposed", "Navigation is disposed");
const nativeError: Error = error;
const codes: Record<SourceNavigationErrorCode, true> = {
  disposed: true,
  reentrant_change: true,
};

// Existing public models remain independently usable with their original APIs.
const oldDocument = new SourceDocumentModel(client);
const oldCandidates = new SourceCandidatesModel(client, { pageSize: 100 });
observeCommand(oldDocument.load(ref, "definition"));
observeCommand(oldDocument.reload());
observeCommand(oldDocument.cancel());
observeCommand(oldDocument.clear());
const point: SourceCandidatesQuery & { readonly col: number } =
  oldDocument.queryAt(document, 0);
observeCommand(oldCandidates.load(query));
observeCommand(oldCandidates.loadMore());
observeCommand(oldCandidates.reload());
observeCommand(oldCandidates.cancel());
observeCommand(oldCandidates.clear());
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<T extends true> = T;
type DocumentCodesUnchanged = AssertTrue<
  Equal<
    SourceDocumentErrorCode,
    | "invalid_argument"
    | "disposed"
    | "cancelled"
    | "inconsistent_reply"
    | "reentrant_change"
  >
>;
type PositionCodesUnchanged = AssertTrue<
  Equal<
    SourcePositionErrorCode,
    "disposed" | "stale_document" | "changed_document" | "invalid_argument"
  >
>;
unsubscribe();
const disposeResult: void = navigation.dispose();
oldDocument.dispose();
oldCandidates.dispose();
void [snapshotId, completion, nativeError, codes, point, disposeResult];

// @ts-expect-error N01 coordinator state is readonly
navigation.state = state;
// @ts-expect-error N02 the coordinator snapshot cannot be rebound
navigation.snapshotId = "another";
// @ts-expect-error N03 the published document state is readonly
state.document = documentState;
// @ts-expect-error N04 the published candidate binding is readonly
state.candidates = null;
// @ts-expect-error N05 the published refresh handle is readonly
state.refresh = null;
// @ts-expect-error N06 consumers cannot retarget a candidate binding
binding.document = document;
// @ts-expect-error N07 the bound original-text offset is readonly
binding.utf16Offset = 2;
// @ts-expect-error N08 the original candidate page array remains readonly
binding.state.pages.push(page);
// @ts-expect-error N09 consumers cannot retarget a refresh handle
refresh.document = document;
// @ts-expect-error N10 consumers cannot replace the original completion promise
refresh.completion = Promise.resolve();
// @ts-expect-error N11 refresh completion carries no candidate or numeric result
const numericCompletion: Promise<number> = refresh.completion;
// @ts-expect-error N12 construction still requires a ready SDK client
new SourceNavigationModel();
// @ts-expect-error N13 the reused page size option is numeric
new SourceNavigationModel(client, { pageSize: "100" });
// @ts-expect-error N14 locate requires the original-text offset
navigation.locate(document);
// @ts-expect-error N15 a raw snapshot query is not a displayed document
navigation.locate(query, 0);
// @ts-expect-error N16 numeric strings are not UTF-16 offsets
navigation.locate(document, "0");
// @ts-expect-error N17 source kind uses the existing enum
navigation.load(ref, "source");
// @ts-expect-error N18 callers cannot provide a pagination cursor
navigation.loadMore("cursor");
const idleBinding = {
  document,
  utf16Offset: 0,
  state: { status: "idle" as const, query: null, pages: [] },
};
// @ts-expect-error N19 a nonnull binding cannot wrap an idle candidate state
const invalidBinding: SourceNavigationCandidates = idleBinding;
// @ts-expect-error N20 the owned document model is not exposed
navigation.documentModel;
// @ts-expect-error N21 the owned candidate model is not exposed
navigation.candidatesModel;
// @ts-expect-error N22 the coordinator does not expose a Selection model
navigation.selection;
// @ts-expect-error N23 source candidates are not automatically selected
navigation.selectFirst();
// @ts-expect-error N24 locate has an observable asynchronous result
const synchronousLocate: void = navigation.locate(document, 0);
// @ts-expect-error N25 existing input errors are not a new navigation error code
new SourceNavigationError("invalid_argument", "x");
// @ts-expect-error N26 the old document API is not renamed or augmented
oldDocument.reloadDocument();
// @ts-expect-error N27 the old candidate model still accepts explicit queries
oldCandidates.locate(document, 0);
// @ts-expect-error N28 the old document error union remains unchanged
const oldCode: SourceDocumentErrorCode = "stale_document";
void [numericCompletion, invalidBinding, synchronousLocate, oldCode];
