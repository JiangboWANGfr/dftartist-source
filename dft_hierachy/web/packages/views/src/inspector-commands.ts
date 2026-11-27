import type { SnapshotId } from "@hier/protocol-types";
import type { ObjectSelection, SelectionModel } from "@hier/viewmodel";

export type InspectorAction<Select extends { readonly command: "select" }> =
  { readonly command: "reload" | "cancel" } | Select;
interface InspectorState<Target> {
  readonly target: Target | null;
  readonly status: "idle" | "pending" | "success" | "failed" | "cancelled";
}
export interface InspectorModel<State> {
  readonly state: State;
  readonly disposed: boolean;
  readonly snapshotId: SnapshotId;
  subscribe(listener: () => void): () => void;
  reload(): Promise<void>;
  cancel(): Promise<void>;
}

import { useViewCommands } from "./view-commands.js";

function inspectorTarget<Target>(state: InspectorState<Target>): Target | null {
  return state.target;
}

export function useInspectorCommands<
  Target,
  State extends InspectorState<Target>,
  Select extends { readonly command: "select" },
  Failure,
>(
  model: InspectorModel<State>,
  selection: SelectionModel,
  onCommandError: ((failure: Failure) => void) | undefined,
  selectionItem: (action: Select) => ObjectSelection,
  commandFailure: (
    action: InspectorAction<Select>,
    target: Target,
    error: unknown,
  ) => Failure,
) {
  return useViewCommands<Target, State, InspectorAction<Select>, Failure>(
    model,
    selection,
    onCommandError,
    inspectorTarget,
    (state, action) =>
      action.command === "select"
        ? state.status === "success"
        : action.command === "cancel"
          ? state.status === "pending"
          : state.status !== "pending",
    (action) => {
      if (action.command === "select") {
        selection.select({
          snapshotId: model.snapshotId,
          origin: "props",
          items: [selectionItem(action)],
        });
      } else return model[action.command]();
    },
    commandFailure,
  );
}
