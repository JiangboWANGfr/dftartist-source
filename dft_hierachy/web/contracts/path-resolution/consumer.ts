/** Compile-only host composition. No proposal runtime is executed here. */
import { createElement } from "react";
import type { HierClient, Reply } from "@hier/client";
import type { ResultOf } from "@hier/protocol-types";
import type { SelectionModel, TreeModel } from "@hier/viewmodel";
import {
  PathResolutionError,
  PathResolutionModel,
  PathResolutionView,
  type PathResolutionQuery,
  type PathResolutionReply,
  type PathResolutionState,
  type PathResolutionViewFailure,
  type PathResolutionViewProps,
} from "./path-resolution.js";

/** The host owns the text form and model lifetime, and consumes each Promise. */
export function panel(client: HierClient, selection: SelectionModel) {
  const resolution = new PathResolutionModel(client);
  const props: PathResolutionViewProps = {
    resolution,
    selection,
    ariaLabel: "路径定位候选",
    height: 300,
    onCommandError: (failure) => {
      // A real host may publish this original error to its error boundary.
      void failure.error;
    },
  };
  return {
    render: () => createElement(PathResolutionView, props),
    submit: (text: string) =>
      resolution.load({ snapshotId: resolution.snapshotId, text }),
    clear: () => resolution.clear(),
    dispose: () => resolution.dispose(),
  };
}

/** Explicit host action; resolving alone never calls this or changes Selection. */
export function chooseAndReveal(
  resolution: PathResolutionModel,
  selection: SelectionModel,
  tree: TreeModel,
  query: PathResolutionQuery,
  reply: PathResolutionReply,
  itemIndex: number,
): Promise<void> {
  const state = resolution.state;
  if (
    resolution.disposed ||
    selection.disposed ||
    tree.disposed ||
    tree.snapshotId !== resolution.snapshotId ||
    selection.snapshotId !== resolution.snapshotId ||
    state.status !== "success" ||
    state.query !== query ||
    state.reply !== reply ||
    !Number.isSafeInteger(itemIndex) ||
    itemIndex < 0
  )
    return Promise.resolve();
  const ref = reply.result[itemIndex];
  if (ref === undefined) return Promise.resolve();
  selection.select({
    snapshotId: resolution.snapshotId,
    origin: "external",
    items: [{ ref }],
  });
  return tree.reveal(ref);
}

export function types(
  client: HierClient,
  resolution: PathResolutionModel,
  selection: SelectionModel,
  query: PathResolutionQuery,
  state: PathResolutionState,
  props: PathResolutionViewProps,
  failure: PathResolutionViewFailure,
): void {
  void resolution.load(query);
  // @ts-expect-error PR01 snapshot is required
  void resolution.load({ text: query.text });
  // @ts-expect-error PR02 text is required
  void resolution.load({ snapshotId: resolution.snapshotId });
  // @ts-expect-error PR03 snapshot is a string
  void resolution.load({ snapshotId: 2, text: "" });
  // @ts-expect-error PR04 text is a primitive string
  void resolution.load({ snapshotId: resolution.snapshotId, text: 2 });
  // @ts-expect-error PR05 undefined is not a path
  void resolution.load({ ...query, text: undefined });
  // @ts-expect-error PR06 no path segment parser API
  void resolution.load({ snapshotId: resolution.snapshotId, path: ["top"] });
  // @ts-expect-error PR07 single reply has no pagination
  void resolution.loadMore();
  // @ts-expect-error PR08 constructor has no options
  new PathResolutionModel(client, { pageSize: 10 });
  // @ts-expect-error PR09 query ownership is readonly
  query.text = "changed";
  // @ts-expect-error PR10 bound snapshot is readonly
  resolution.snapshotId = "changed";
  // @ts-expect-error PR11 local error codes are closed
  new PathResolutionError("stale_cursor", "not a local path error");
  if (state.status === "idle") {
    // @ts-expect-error PR12 idle has no query
    void state.query.text;
  }
  if (state.status === "pending") {
    // @ts-expect-error PR13 pending has no old results
    void state.reply.result;
  }
  if (state.status === "success") {
    const original: Reply<ResultOf<"path.resolve">> = state.reply;
    void original;
    // @ts-expect-error PR14 original results are deeply readonly
    state.reply.result.push("i:0");
    // @ts-expect-error PR15 completeness is not task status
    const complete: "complete" = state.reply.completeness.status;
    void complete;
    // @ts-expect-error PR16 success has no error
    void state.error.code;
  }
  // @ts-expect-error PR17 required borrowed resolution model
  const missing: PathResolutionViewProps = {
    selection,
    ariaLabel: "x",
    height: 20,
  };
  void missing;
  // @ts-expect-error PR18 a client is not a model
  const wrongModel: PathResolutionViewProps = { ...props, resolution: client };
  void wrongModel;
  const wrongSelection: PathResolutionViewProps = {
    ...props,
    // @ts-expect-error PR19 a model is not a SelectionModel
    selection: resolution,
  };
  void wrongSelection;
  // @ts-expect-error PR20 height uses CSS pixel number
  const height: PathResolutionViewProps = { ...props, height: "100%" };
  void height;
  // @ts-expect-error PR21 exactOptional does not accept explicit undefined
  const optional: PathResolutionViewProps = { ...props, className: undefined };
  void optional;
  // @ts-expect-error PR22 Selection is the only semantic selection channel
  const onSelect: PathResolutionViewProps = { ...props, onSelect: () => {} };
  void onSelect;
  if (failure.command === "select") {
    const original: PathResolutionReply = failure.reply;
    void original;
    // @ts-expect-error PR23 original result remains readonly in feedback
    failure.reply.result[0] = "i:0";
    // @ts-expect-error PR24 error stays opaque
    void failure.error.message;
  } else {
    // @ts-expect-error PR25 query command has no result source
    void failure.reply.result;
  }
  // @ts-expect-error PR26 no pagination command in this view
  const command: PathResolutionViewFailure["command"] = "loadMore";
  void command;
}
