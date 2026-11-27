import { HierClient, HierError } from "@hier/client";
import { SelectionModel } from "@hier/viewmodel";
import type { TreeFailure as ProductionFailure } from "@hier/viewmodel";
import type { ObjectRef } from "@hier/protocol-types";
import { TreeError, TreeModel } from "./m5-tree.js";
import type {
  RowId,
  TreeCompleteness,
  TreeDiagnosticIssue,
  TreeErrorCode,
  TreeFailure,
  TreePageState,
  TreeRevealState,
  TreeRow,
} from "./m5-tree.js";

declare const client: HierClient;
declare const id: RowId;
declare const ref: ObjectRef;
declare const row: TreeRow;

async function host() {
  const snapshot = await client.ready;
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
  const tree = new TreeModel(client, { showGenerateScopes: true, pageSize: 2 });
  const unsubscribe = tree.subscribe(() => {
    const rows: readonly TreeRow[] = tree.rows;
    void rows;
  });
  await tree.loadRoots();
  for (const visible of tree.rows) {
    if (visible.kind === "instance") {
      selection.select({
        snapshotId: tree.snapshotId,
        origin: "tree",
        items: [{ ref: visible.instance.ref }],
      });
      await tree.setExpanded(visible.id, true);
    } else if (visible.kind === "scope") {
      const segments: readonly string[] = visible.scopePath;
      void segments;
      await tree.setExpanded(visible.id, false);
    } else if (visible.owner === null) {
      await tree.loadRoots();
    } else {
      await tree.loadMore(visible.owner);
    }
  }
  await tree.reveal(ref);
  const state = tree.revealState;
  if (state.status === "success") {
    const focusTarget: RowId = state.rowId;
    void focusTarget; // View scroll/focus only; selection remains independently owned.
  }
  await tree.cancel(null);
  await tree.reload(null);
  await tree.setShowGenerateScopes(false);
  unsubscribe();
  tree.dispose();
  selection.dispose();
}

function errors(value: unknown, page: TreePageState) {
  if (value instanceof HierError) {
    const diagnostic = {
      code: value.code,
      origin: value.origin,
      data: value.data,
    };
    void diagnostic;
  } else if (value instanceof TreeError) {
    const cause: unknown = value.cause;
    void cause;
  } else if (value instanceof AggregateError) {
    const callbacks: unknown[] = value.errors;
    void callbacks;
  }
  if (page.status === "failed" || page.status === "cancelled") {
    const failure: TreeFailure = page.error;
    void failure;
  }
}

const tree = new TreeModel(client);
const oldOptions = { showGenerateScopes: false };
new TreeModel(client, oldOptions);
const expansion: Promise<void> = tree.setExpanded(id, true);
const navigation: Promise<void> = tree.reveal(ref);
const complete: TreeCompleteness = { status: "complete", reasons: [] };
const success: TreePageState = {
  status: "success",
  loadedCount: 0,
  completeness: complete,
};
void expansion;
void navigation;
void success;
void host;
void errors;

// @ts-expect-error row identities are obtained from this tree, not invented strings
tree.setExpanded("a.b", true);
// @ts-expect-error references are not row identities
tree.loadMore(ref);
// @ts-expect-error a scope/instance ID is mandatory for expansion
tree.setExpanded(null, true);
// @ts-expect-error expansion is an explicit boolean intent
tree.setExpanded(id, "toggle");
// @ts-expect-error readonly visible projection
tree.rows.push(row);
// @ts-expect-error immutable row identity
row.id = id;
// @ts-expect-error model snapshot cannot be rebound
tree.snapshotId = "later";
// @ts-expect-error grouping mode changes through its command
tree.showGenerateScopes = false;
// @ts-expect-error page size is numeric
new TreeModel(client, { pageSize: "200" });
// @ts-expect-error grouping mode is boolean
new TreeModel(client, { showGenerateScopes: 1 });
// @ts-expect-error explicit undefined is not omission
new TreeModel(client, { pageSize: undefined });
// @ts-expect-error options do not own or replace semantic selection
new TreeModel(client, { selection: new SelectionModel() });

if (row.kind === "scope") {
  // @ts-expect-error scopes are not design objects
  const object: ObjectRef = row.ref;
  // @ts-expect-error scopes are not instances
  row.instance;
  // @ts-expect-error path projection is immutable
  row.scopePath.push("invented");
  void object;
}
if (row.kind === "instance") {
  // @ts-expect-error SDK instance data remains deeply readonly
  row.instance.path.push("changed");
  // @ts-expect-error child request state cannot be assigned by a view
  row.children.status = "success";
}
if (row.kind === "status") {
  // @ts-expect-error status rows have no semantic design address
  row.instance;
}
declare const failure: TreeFailure;
// @ts-expect-error diagnostics are immutable published data
failure.data.extra = true;
// @ts-expect-error failure state must carry a diagnostic
const missingError: TreePageState = { status: "failed", loadedCount: 0 };
// @ts-expect-error a successful page cannot masquerade as failed
const staleError: TreePageState = {
  status: "success",
  loadedCount: 0,
  error: failure,
};
// @ts-expect-error a successful reveal must identify its visible instance row
const missingTarget: TreeRevealState = { status: "success", ref };
// @ts-expect-error disposal is an explicit command
tree.disposed = true;
void missingError;
void staleError;
void missingTarget;

// @ts-expect-error current navigation methods reject partial at the SDK boundary
const partial: TreeCompleteness = { status: "partial", reasons: [] };
// @ts-expect-error invalid partial replies use HierError protocol_error, not a tree incomplete code
const incomplete: TreeErrorCode = "incomplete";
void partial;
void incomplete;

// C-74 proposal: optional additive metadata; existing production shapes remain valid.
declare const productionFailure: ProductionFailure;
declare const issue: TreeDiagnosticIssue;
const oldConsumer: ProductionFailure = failure;
const oldProducer: TreeFailure = productionFailure;
const unreadable: TreeFailure = {
  code: "transport_closed",
  origin: "transport",
  message: "original SDK message",
  data: {},
  dataIssue: {
    code: "data_read_failed",
    operation: "read",
    path: ["nested", "detail"],
  },
};
const emptyButReadable: TreeFailure = {
  code: "disposed",
  origin: "client",
  message: "original SDK message",
  data: {},
};
const maybeIssue: TreeDiagnosticIssue | undefined = failure.dataIssue;
const path: readonly string[] = issue.path;
void oldConsumer;
void oldProducer;
void unreadable;
void emptyButReadable;
void maybeIssue;
void path;

// @ts-expect-error diagnostic metadata is part of an immutable published failure
failure.dataIssue = issue;
// @ts-expect-error code is immutable
issue.code = "data_read_failed";
// @ts-expect-error operation is immutable
issue.operation = "inspect";
// @ts-expect-error path container is immutable
issue.path = [];
// @ts-expect-error path members are immutable
issue.path[0] = "changed";
// @ts-expect-error path cannot be extended
issue.path.push("changed");
// @ts-expect-error only the specified diagnostic code is accepted
const badIssueCode: TreeDiagnosticIssue["code"] = "protocol_error";
// @ts-expect-error operations are a closed set
const badOperation: TreeDiagnosticIssue["operation"] = "serialize";
// @ts-expect-error path segments are string keys, including array indices
const numericPath: TreeDiagnosticIssue["path"] = [0];
// @ts-expect-error successful capture omits dataIssue instead of assigning undefined
const undefinedIssue: TreeFailure = { ...failure, dataIssue: undefined };
// @ts-expect-error diagnostic-copy status is not a TreeErrorCode
const newCommandCode: TreeErrorCode = "data_read_failed";
void badIssueCode;
void badOperation;
void numericPath;
void undefinedIssue;
void newCommandCode;
