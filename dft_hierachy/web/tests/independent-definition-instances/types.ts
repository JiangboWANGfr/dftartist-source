// DESIGN §6.24; independent strict public consumer, no A consumer/witness.
import {
  DefinitionInstancesModel,
  DefinitionInstancesError,
} from "@B/definition-instances";
import type {
  DefinitionInstancesQuery,
  DefinitionInstancesOptions,
  DefinitionInstancesPage,
  DefinitionInstancesErrorCode,
  DefinitionInstancesFailure,
  DefinitionInstancesState,
} from "@B/definition-instances";
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type {
  SnapshotId,
  DefRef,
  ObjectRef,
  ResultOf,
  InstKind,
} from "@hier/protocol-types";
declare const client: HierClient;
declare const snapshotId: SnapshotId;
declare const sdkError: HierError;
const query: DefinitionInstancesQuery = {
  snapshotId,
  def: "B:opaque-definition",
};
const options: DefinitionInstancesOptions = { pageSize: 1 };
const model = new DefinitionInstancesModel(client, options);
const defaultModel = new DefinitionInstancesModel(client, undefined);
const commands: readonly Promise<void>[] = [
  model.load(query),
  model.loadMore(),
  model.reload(),
  model.cancel(),
  model.clear(),
];
const off: Unsubscribe = model.subscribe(() => {});
off();
const bound: SnapshotId = model.snapshotId;
const disposed: boolean = model.disposed;
const codes: readonly DefinitionInstancesErrorCode[] = [
  "invalid_options",
  "invalid_argument",
  "snapshot_mismatch",
  "disposed",
  "cancelled",
  "inconsistent_reply",
  "reentrant_change",
];
const local = new DefinitionInstancesError("invalid_argument", "B");
const baseError: Error = local;
const diagnostic: DefinitionInstancesFailure = {
  code: local.code,
  origin: "definition_instances",
  message: "B",
  data: {},
  dataIssue: { code: "data_read_failed", operation: "read", path: [] },
};
const remote: DefinitionInstancesFailure = {
  code: sdkError.code,
  origin: sdkError.origin,
  message: sdkError.message,
  data: sdkError.data,
};
declare const page: DefinitionInstancesPage;
declare const original: Reply<ResultOf<"def.instances">>;
const fromOriginal: DefinitionInstancesPage = original;
const toOriginal: Reply<ResultOf<"def.instances">> = page;
const ref: ObjectRef | undefined = page.result.items[0]?.ref;
const def: DefRef | undefined = page.result.items[0]?.def;
const kind: InstKind | undefined = page.result.items[0]?.kind;
const path: readonly string[] | undefined = page.result.items[0]?.path;
const extension: unknown = page.result.items[0]?.B_extension;
const states: readonly DefinitionInstancesState[] = [
  { status: "idle", query: null, pages: [] },
  { status: "pending", query, pages: [] },
  { status: "success", query, pages: [page] },
  { status: "failed", query, pages: [], error: diagnostic },
  { status: "cancelled", query, pages: [], error: remote },
];
declare const state: DefinitionInstancesState;
switch (state.status) {
  case "idle": {
    const q: null = state.query;
    void q;
    break;
  }
  case "pending":
  case "success": {
    const q: DefinitionInstancesQuery = state.query;
    const absent: undefined = state.error;
    void [q, absent];
    break;
  }
  case "failed":
  case "cancelled": {
    const e: DefinitionInstancesFailure = state.error;
    void e;
    break;
  }
  default: {
    const never: never = state;
    void never;
  }
}
// @ts-expect-error DI-T01: explicit snapshot binding mandatory
model.load({ def: "B" });
// @ts-expect-error DI-T02: definition mandatory
model.load({ snapshotId });
// @ts-expect-error DI-T03: definition is a string, no numeric address
model.load({ snapshotId, def: 1 });
// @ts-expect-error DI-T04: query has no text search field
model.load({ snapshotId, def: "B", text: "leaf" });
// @ts-expect-error DI-T05: explicit undefined is not a definition
model.load({ snapshotId, def: undefined });
// @ts-expect-error DI-T06: exact optional pageSize cannot be undefined
new DefinitionInstancesModel(client, { pageSize: undefined });
// @ts-expect-error DI-T07: pageSize is numeric
new DefinitionInstancesModel(client, { pageSize: "1" });
// @ts-expect-error DI-T08: captured definition readonly
query.def = "other";
// @ts-expect-error DI-T09: captured snapshot readonly
query.snapshotId = "other";
// @ts-expect-error DI-T10: model bound snapshot readonly
model.snapshotId = "other";
// @ts-expect-error DI-T11: published state readonly
model.state = { status: "idle", query: null, pages: [] };
// @ts-expect-error DI-T12: released state readonly
model.disposed = false;
// @ts-expect-error DI-T13: page prefixes readonly
state.pages.push(page);
// @ts-expect-error DI-T14: InstInfo array deeply readonly
page.result.items.push(page.result.items[0]!);
// @ts-expect-error DI-T15: occurrence identity readonly
page.result.items[0]!.ref = "other";
// @ts-expect-error DI-T16: definition identity readonly
page.result.items[0]!.def = "other";
// @ts-expect-error DI-T17: original paths readonly
page.result.items[0]!.path.push("other");
// @ts-expect-error DI-T18: original next readonly
page.result.next = "other";
// @ts-expect-error DI-T19: idle query must be null
const badIdle: DefinitionInstancesState = { status: "idle", query, pages: [] };
// @ts-expect-error DI-T20: failed requires diagnostic
const badFailed: DefinitionInstancesState = {
  status: "failed",
  query,
  pages: [],
};
// @ts-expect-error DI-T21: pending forbids diagnostic
const badPending: DefinitionInstancesState = {
  status: "pending",
  query,
  pages: [],
  error: diagnostic,
};
// @ts-expect-error DI-T22: local code does not include SDK-only stale cursor
new DefinitionInstancesError("stale_cursor", "B");
// @ts-expect-error DI-T23: original diagnostic data readonly
diagnostic.data.B = 1;
// @ts-expect-error DI-T24: command is Promise<void>, never void
const wrongVoid: void = model.loadMore();
model.dispose();
void [
  defaultModel,
  commands,
  bound,
  disposed,
  codes,
  baseError,
  fromOriginal,
  toOriginal,
  ref,
  def,
  kind,
  path,
  extension,
  states,
];
