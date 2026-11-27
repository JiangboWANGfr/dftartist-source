import type {
  PathResolutionQuery,
  PathResolutionReply,
  PathResolutionState,
} from "@hier/viewmodel";
import { useViewCommands } from "./view-commands.js";
import type {
  PathResolutionViewFailure,
  PathResolutionViewProps,
} from "./path-resolution-view-types.js";

export type PathResolutionAction =
  | { readonly command: "reload" | "cancel" }
  | {
      readonly command: "select";
      readonly reply: PathResolutionReply;
      readonly itemIndex: number;
    };

function queryOf(state: PathResolutionState): PathResolutionQuery | null {
  return state.query;
}
function permits(
  state: PathResolutionState,
  action: PathResolutionAction,
): boolean {
  switch (action.command) {
    case "reload":
      return state.query !== null && state.status !== "pending";
    case "cancel":
      return state.status === "pending";
    case "select":
      return (
        state.status === "success" &&
        state.reply === action.reply &&
        Number.isInteger(action.itemIndex) &&
        action.itemIndex >= 0 &&
        action.itemIndex < action.reply.result.length
      );
  }
}
export function samePathResolutionAction(
  left: PathResolutionAction,
  right: PathResolutionAction,
): boolean {
  return (
    left.command === right.command &&
    (left.command !== "select" ||
      (right.command === "select" &&
        left.reply === right.reply &&
        left.itemIndex === right.itemIndex))
  );
}
export function usePathResolutionCommands(props: PathResolutionViewProps) {
  const { resolution, selection } = props;
  return useViewCommands<
    PathResolutionQuery,
    PathResolutionState,
    PathResolutionAction,
    PathResolutionViewFailure
  >(
    resolution,
    selection,
    props.onCommandError,
    queryOf,
    permits,
    (action) => {
      if (action.command !== "select") return resolution[action.command]();
      selection.select({
        snapshotId: resolution.snapshotId,
        origin: "external",
        items: [{ ref: action.reply.result[action.itemIndex]! }],
      });
    },
    (action, query, error) =>
      Object.freeze(
        action.command === "select"
          ? {
              command: action.command,
              query,
              reply: action.reply,
              itemIndex: action.itemIndex,
              error,
            }
          : { command: action.command, query, error },
      ),
  );
}
