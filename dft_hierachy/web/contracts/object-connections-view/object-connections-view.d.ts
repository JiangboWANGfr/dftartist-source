/** Compile-only proposal, not a production export. Normative DESIGN §6.21. */
import type { ReactElement } from "react";
import type {
  ObjectConnectionsModel,
  ObjectConnectionsTarget,
  ObjectSelection,
  SelectionModel,
} from "@hier/viewmodel";

export type ObjectConnectionsViewCommand = "reload" | "cancel" | "select";

export type ObjectConnectionsViewFailure =
  | {
      readonly command: "reload" | "cancel";
      readonly target: ObjectConnectionsTarget;
      readonly item?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly target: ObjectConnectionsTarget;
      readonly item: ObjectSelection;
      readonly error: unknown;
    };

export interface ObjectConnectionsViewProps {
  readonly connections: ObjectConnectionsModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly onCommandError?: (failure: ObjectConnectionsViewFailure) => void;
}

export declare function ObjectConnectionsView(
  props: ObjectConnectionsViewProps,
): ReactElement;
