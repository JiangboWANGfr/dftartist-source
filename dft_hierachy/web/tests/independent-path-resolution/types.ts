import type { ReactElement } from "react";
import type { HierClient } from "@hier/client";
import {
  PathResolutionModel,
  PathResolutionError,
  SelectionModel,
} from "@hier/viewmodel";
import type {
  PathResolutionQuery,
  PathResolutionReply,
  PathResolutionErrorCode,
  PathResolutionFailure,
  PathResolutionState,
} from "@hier/viewmodel";
import { PathResolutionView } from "@hier/views";
import type {
  PathResolutionViewProps,
  PathResolutionViewCommand,
  PathResolutionViewFailure,
} from "@hier/views";
declare const client: HierClient,
  selection: SelectionModel,
  reply: PathResolutionReply,
  state: PathResolutionState,
  diagnostic: PathResolutionFailure;
const model = new PathResolutionModel(client),
  q: PathResolutionQuery = { snapshotId: "B68", text: " raw " };
const task: Promise<void> = model.load(q);
const unsubscribe: () => void = model.subscribe(() => {
  void model.state;
});
unsubscribe();
const methods: readonly Promise<void>[] = [
  model.reload(),
  model.cancel(),
  model.clear(),
];
model.dispose();
const codes: readonly PathResolutionErrorCode[] = [
  "invalid_argument",
  "snapshot_mismatch",
  "disposed",
  "cancelled",
  "inconsistent_reply",
  "reentrant_change",
];
const local = new PathResolutionError("disposed", "B68");
const states: readonly PathResolutionState[] = [
  { status: "idle", query: null },
  { status: "pending", query: q },
  { status: "success", query: q, reply },
  { status: "failed", query: q, error: diagnostic },
  { status: "cancelled", query: q, error: diagnostic },
];
if (state.status === "success") {
  const refs: readonly string[] = state.reply.result;
  void refs;
} else {
  const absent: undefined = state.reply;
  void absent;
}
const props: PathResolutionViewProps = {
  resolution: model,
  selection,
  ariaLabel: "B68",
  height: 180,
  onCommandError(f) {
    const raw: unknown = f.error;
    const original: PathResolutionQuery = f.query;
    if (f.command === "select") {
      const r: PathResolutionReply = f.reply;
      const i: number = f.itemIndex;
      void [r, i];
    } else {
      const noReply: undefined = f.reply;
      const noIndex: undefined = f.itemIndex;
      void [noReply, noIndex];
    }
    void [raw, original];
  },
};
const element: ReactElement = PathResolutionView(props),
  commands: readonly PathResolutionViewCommand[] = [
    "reload",
    "cancel",
    "select",
  ];
const selectFailure: PathResolutionViewFailure = {
  command: "select",
  query: q,
  reply,
  itemIndex: 0,
  error: undefined,
};
const reloadFailure: PathResolutionViewFailure = {
  command: "reload",
  query: q,
  error: undefined,
};
void [
  task,
  methods,
  codes,
  local,
  states,
  element,
  commands,
  selectFailure,
  reloadFailure,
];
// @ts-expect-error V01: no constructor options.
new PathResolutionModel(client, { pageSize: 1 });
// @ts-expect-error V02: borrowed SDK is required, not Selection.
new PathResolutionModel(selection);
// @ts-expect-error V03: text is required.
model.load({ snapshotId: "B68" });
// @ts-expect-error V04: raw primitive text string.
model.load({ snapshotId: "B68", text: 4 });
// @ts-expect-error V05: snapshot primitive string.
model.load({ snapshotId: 4, text: "" });
// @ts-expect-error V06: no fake paging.
model.loadMore();
// @ts-expect-error V07: own readonly state.
model.state = { status: "idle", query: null };
// @ts-expect-error V08: original result is deeply readonly.
reply.result.push("B68");
// @ts-expect-error V09: own readonly diagnostic.
diagnostic.data = {};
// @ts-expect-error V10: finite local error codes.
new PathResolutionError("invalid_options", "B68");
// @ts-expect-error V11: idle cannot have reply.
const badIdle: PathResolutionState = { status: "idle", query: null, reply };
// @ts-expect-error V12: pending has no reply.
const badPending: PathResolutionState = { status: "pending", query: q, reply };
// @ts-expect-error V13: success requires original reply.
const badSuccess: PathResolutionState = { status: "success", query: q };
// @ts-expect-error V14: failure requires diagnostic.
const badFailure: PathResolutionState = { status: "failed", query: q };
// @ts-expect-error V15: success has no error.
const badSuccessError: PathResolutionState = {
  status: "success",
  query: q,
  reply,
  error: diagnostic,
};
// @ts-expect-error V16: reload accepts no synthetic target.
model.reload(q);
// @ts-expect-error V17: explicit two-field query.
model.load("B68");
// @ts-expect-error V18: subscriber callable.
model.subscribe("B68");
// @ts-expect-error V19: even undefined extra constructor argument forbidden.
new PathResolutionModel(client, undefined);
// @ts-expect-error V20: captured query readonly.
q.text = "changed";
const dto = { state: model.state, snapshotId: "B68" };
// @ts-expect-error V21: actual model, not the same DTO.
PathResolutionView({ ...props, resolution: dto });
// @ts-expect-error V22: semantic selection model required.
PathResolutionView({ ...props, selection: model });
// @ts-expect-error V23: resolution required.
PathResolutionView({ selection, ariaLabel: "B", height: 1 });
// @ts-expect-error V24: callback callable.
PathResolutionView({ ...props, onCommandError: "wrong" });
// @ts-expect-error V25: no loadMore command.
const wrongCommand: PathResolutionViewCommand = "loadMore";
// @ts-expect-error V26: select failure requires reply.
const noReply: PathResolutionViewFailure = {
  command: "select",
  query: q,
  itemIndex: 0,
  error: null,
};
// @ts-expect-error V27: select failure requires original array index.
const noIndex: PathResolutionViewFailure = {
  command: "select",
  query: q,
  reply,
  error: null,
};
// @ts-expect-error V28: reload doesn't invent reply.
const reloadReply: PathResolutionViewFailure = {
  command: "reload",
  query: q,
  reply,
  error: null,
};
// @ts-expect-error V29: cancel doesn't invent index.
const cancelIndex: PathResolutionViewFailure = {
  command: "cancel",
  query: q,
  itemIndex: 0,
  error: null,
};
// @ts-expect-error V30: failure query required.
const noQuery: PathResolutionViewFailure = { command: "reload", error: null };
// @ts-expect-error V31: failure query readonly.
selectFailure.query = q;
// @ts-expect-error V32: failure index readonly.
selectFailure.itemIndex = 1;
// @ts-expect-error V33: raw error remains unknown.
reloadFailure.error.toString();
// @ts-expect-error V34: height primitive number.
PathResolutionView({ ...props, height: "180" });
// @ts-expect-error V35: label primitive string.
PathResolutionView({ ...props, ariaLabel: 7 });
// @ts-expect-error V36: exactOptional className.
PathResolutionView({ ...props, className: undefined });
// @ts-expect-error V37: exactOptional callback.
PathResolutionView({ ...props, onCommandError: undefined });
// @ts-expect-error V38: no second SDK prop.
PathResolutionView({ ...props, client });
// @ts-expect-error V39: no unguarded success-only result.
state.reply.result;
// @ts-expect-error V40: no old instances prop.
PathResolutionView({ ...props, instances: model });
