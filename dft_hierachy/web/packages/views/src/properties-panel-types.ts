import type { ObjectRef } from "@hier/protocol-types";
import type { InstancePropertiesModel, SelectionModel } from "@hier/viewmodel";

export type PropertiesPanelCommand = "reload" | "cancel" | "select";

/** The instance target and (for selection) source ref captured at invocation. */
export type PropertiesPanelCommandFailure =
  | {
      readonly command: "reload" | "cancel";
      readonly target: ObjectRef;
      readonly ref?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly target: ObjectRef;
      readonly ref: ObjectRef;
      readonly error: unknown;
    };

export interface PropertiesPanelProps {
  readonly properties: InstancePropertiesModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: PropertiesPanelCommandFailure) => void;
}
