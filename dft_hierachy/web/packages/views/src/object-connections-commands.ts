import type {
  ObjectConnectionsState,
  ObjectConnectionsTarget,
  ObjectSelection,
} from "@hier/viewmodel";
import {
  useInspectorCommands,
  type InspectorAction,
} from "./inspector-commands.js";
import type {
  ObjectConnectionsViewProps,
  ObjectConnectionsViewFailure,
} from "./object-connections-view-types.js";

type SelectConnection = {
  readonly command: "select";
  readonly item: ObjectSelection;
  // Identifies this control within the published state, including duplicate rows.
  readonly source: string;
};
export type ConnectionAction = InspectorAction<SelectConnection>;

export function useConnectionsCommands(props: ObjectConnectionsViewProps) {
  return useInspectorCommands<
    ObjectConnectionsTarget,
    ObjectConnectionsState,
    SelectConnection,
    ObjectConnectionsViewFailure
  >(
    props.connections,
    props.selection,
    props.onCommandError,
    (action) => action.item,
    (action, target, error) =>
      Object.freeze(
        action.command === "select"
          ? { command: action.command, target, item: action.item, error }
          : { command: action.command, target, error },
      ),
  );
}

export function queryTargetSelection(
  target: ObjectConnectionsTarget,
): ObjectSelection {
  const bits = target.slice.bits;
  return Object.freeze({
    ref: target.slice.ref,
    ...(bits === undefined
      ? {}
      : { bits: Object.freeze({ lsb: bits.lsb, width: bits.width }) }),
    ...(target.side === undefined ? {} : { side: target.side }),
  });
}

export function sameConnectionAction(
  left: ConnectionAction,
  right: ConnectionAction,
): boolean {
  return (
    left.command === right.command &&
    (left.command !== "select" ||
      (right.command === "select" && left.source === right.source))
  );
}
