import type { ObjectRef } from "@hier/protocol-types";
import type { InstancePropertiesState } from "@hier/viewmodel";
import type {
  PropertiesPanelProps,
  PropertiesPanelCommandFailure,
} from "./properties-panel-types.js";
import { useInspectorCommands } from "./inspector-commands.js";

export type PanelAction =
  | { readonly command: "reload" | "cancel" }
  | { readonly command: "select"; readonly ref: ObjectRef };

export function usePropertiesCommands(props: PropertiesPanelProps) {
  return useInspectorCommands<
    ObjectRef,
    InstancePropertiesState,
    Extract<PanelAction, { command: "select" }>,
    PropertiesPanelCommandFailure
  >(
    props.properties,
    props.selection,
    props.onCommandError,
    (action) => ({ ref: action.ref }),
    (action, target, error) => Object.freeze({ ...action, target, error }),
  );
}
