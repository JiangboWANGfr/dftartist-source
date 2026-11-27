/** Public connection display contract. Normative DESIGN §6.21. */
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
