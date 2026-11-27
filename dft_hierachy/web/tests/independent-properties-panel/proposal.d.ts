/** Compile-only proposal. No production export. Normative DESIGN section 6.19. */
import type { ReactElement } from "react";
import type { ObjectRef } from "@hier/protocol-types";
import type { InstancePropertiesModel, SelectionModel } from "@hier/viewmodel";

export type PropertiesPanelCommand = "reload" | "cancel" | "select";

/** Capture the instance target at invocation; select also captures its source ref. */
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

export declare function PropertiesPanel(
  props: PropertiesPanelProps,
): ReactElement;
