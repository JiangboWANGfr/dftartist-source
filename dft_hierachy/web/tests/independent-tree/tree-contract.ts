// B independent public type oracle. Compiled, never used as runtime evidence.
import { TreeModel, TreeError } from "@hier/viewmodel";
import type {
  RowId,
  TreeRow,
  InstanceTreeRow,
  ScopeTreeRow,
  StatusTreeRow,
  TreeOptions,
  TreePageState,
  TreeRevealState,
  TreeFailure,
  TreeErrorCode,
  TreeInstance,
  TreeCompleteness,
} from "@hier/viewmodel";
import type { HierClient, Unsubscribe } from "@hier/client";
import type { ObjectRef, SnapshotId } from "@hier/protocol-types";
declare const client: HierClient,
  ref: ObjectRef,
  id: RowId,
  failure: TreeFailure;
declare const instRow: InstanceTreeRow,
  scopeRow: ScopeTreeRow,
  statusRow: StatusTreeRow;
declare const opts: TreeOptions;
const tree = new TreeModel(client);
new TreeModel(client, { showGenerateScopes: false, pageSize: 1 });
new TreeModel(client, {
  get showGenerateScopes() {
    return true;
  },
  get pageSize() {
    return 200;
  },
});
const snap: SnapshotId = tree.snapshotId,
  rows: readonly TreeRow[] = tree.rows;
const page: TreePageState = tree.rootState,
  reveal: TreeRevealState = tree.revealState;
const definitionOnlyOpaqueText: ObjectRef = "d:17";
const commands: Promise<void>[] = [
  tree.loadRoots(),
  tree.setExpanded(id, true),
  tree.loadMore(id),
  tree.reload(id),
  tree.reload(null),
  tree.cancel(id),
  tree.cancel(null),
  tree.setShowGenerateScopes(false),
  tree.reveal(ref),
  tree.reveal(definitionOnlyOpaqueText),
];
const off: Unsubscribe = tree.subscribe(() => {
  void tree.rows;
});
off();
tree.dispose();
const bound: boolean = tree.disposed,
  show: boolean = tree.showGenerateScopes;
const detail: TreeInstance = instRow.instance,
  completeness: TreeCompleteness = { status: "complete", reasons: [] };
const codes: readonly TreeErrorCode[] = [
  "invalid_options",
  "invalid_argument",
  "invalid_row",
  "disposed",
  "cancelled",
  "inconsistent_reply",
  "reentrant_change",
];
const err = new TreeError("cancelled", "B explicit");
const originalCause: unknown = err.cause;
const states: readonly TreePageState[] = [
  { status: "idle", loadedCount: 0 },
  { status: "pending", loadedCount: 0 },
  { status: "success", loadedCount: 1, next: "B-cursor", completeness },
  { status: "failed", loadedCount: 1, error: failure },
  { status: "cancelled", loadedCount: 1, error: failure },
];
const revealStates: readonly TreeRevealState[] = [
  { status: "idle" },
  { status: "pending", ref },
  { status: "success", ref, rowId: id },
  { status: "failed", ref, error: failure },
  { status: "cancelled", ref, error: failure },
];
for (const r of rows) {
  const parent: RowId | null = r.parentId,
    depth: number = r.depth;
  if (r.kind === "instance") {
    const childState: TreePageState = r.children;
    void childState;
  }
  if (r.kind === "scope") {
    const owner: ObjectRef = r.owner,
      path: readonly string[] = r.scopePath;
    void [owner, path];
  }
  if (r.kind === "status") {
    const owner: RowId | null = r.owner;
    void owner;
  }
  void [parent, depth];
}
void [
  snap,
  page,
  reveal,
  commands,
  bound,
  show,
  detail,
  codes,
  originalCause,
  states,
  revealStates,
];

// @ts-expect-error B-T01: grouping option is not numeric
new TreeModel(client, { showGenerateScopes: 1 });
// @ts-expect-error B-T02: page size is not text
new TreeModel(client, { pageSize: "2" });
// @ts-expect-error B-T03: exact optional grouping rejects present undefined
new TreeModel(client, { showGenerateScopes: undefined });
// @ts-expect-error B-T04: exact optional page size rejects present undefined
new TreeModel(client, { pageSize: undefined });
// @ts-expect-error B-T05: plain text is not nominal RowId
tree.setExpanded("B-row", true);
// @ts-expect-error B-T06: loadMore requires nominal RowId
tree.loadMore("B-row");
// @ts-expect-error B-T07: reload does not accept unbranded text
tree.reload("B-row");
// @ts-expect-error B-T08: cancel does not accept unbranded text
tree.cancel("B-row");
// @ts-expect-error B-T09: expanded is primitive boolean
tree.setExpanded(id, 1);
// @ts-expect-error B-T10: grouping mode is primitive boolean
tree.setShowGenerateScopes("true");
// @ts-expect-error B-T11: ref is not null
tree.reveal(null);
// @ts-expect-error B-T12: subscription callback must be callable
tree.subscribe(3);
// @ts-expect-error B-T13: error code is a closed public union
new TreeError("other_error", "B");
// @ts-expect-error B-T14: options fields are readonly
opts.showGenerateScopes = false;
// @ts-expect-error B-T15: fixed snapshot getter is readonly
tree.snapshotId = "B-other";
// @ts-expect-error B-T16: row collection getter is readonly
tree.rows = [];
// @ts-expect-error B-T17: page-state getter is readonly
tree.rootState = { status: "idle", loadedCount: 0 };
// @ts-expect-error B-T18: lifetime getter is readonly
tree.disposed = false;
// @ts-expect-error B-T19: published row array is readonly
tree.rows.push(instRow);
// @ts-expect-error B-T20: row identity is readonly
instRow.id = id;
// @ts-expect-error B-T21: row depth is readonly
instRow.depth = 3;
// @ts-expect-error B-T22: nested Core instance fields are readonly
instRow.instance.childCount = 3;
// @ts-expect-error B-T23: nested Core path array is readonly
instRow.instance.path.push("B-more");
// @ts-expect-error B-T24: scope path is readonly
scopeRow.scopePath[0] = "B-more";
// @ts-expect-error B-T25: scope owner is readonly
scopeRow.owner = ref;
// @ts-expect-error B-T26: scope is not a semantic ObjectRef
void scopeRow.ref;
// @ts-expect-error B-T27: status is not a fake InstInfo
void statusRow.instance;
// @ts-expect-error B-T28: nested page state is readonly
instRow.children.loadedCount = 2;
// @ts-expect-error B-T29: diagnostics data is readonly
failure.data["x"] = "B-more";
// @ts-expect-error B-T30: failed page requires owned diagnostic
const failedWithoutError: TreePageState = { status: "failed", loadedCount: 0 };
// @ts-expect-error B-T31: successful page cannot carry failure
const successfulWithError: TreePageState = {
  status: "success",
  loadedCount: 0,
  error: failure,
};
// @ts-expect-error B-T32: successful reveal requires row id
const revealedWithoutRow: TreeRevealState = { status: "success", ref };
// @ts-expect-error B-T33: error code is readonly
err.code = "cancelled";
void [failedWithoutError, successfulWithError, revealedWithoutRow];
// Revised fixed6b03e1d Complete-only boundary; this consumer has not run/frozen before revision.
// @ts-expect-error B-T34: unpublished incomplete code was removed, not a local current Tree error
new TreeError("incomplete", "B unsupported old proposal");
declare const partial: {
  readonly status: "partial";
  readonly reasons: readonly [];
};
// @ts-expect-error B-T35: TreeCompleteness is authoritative Complete, not general QueryResult completeness
const forbiddenPartial: TreeCompleteness = partial;
void forbiddenPartial;
