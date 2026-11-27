import type {
  AnnotationLayer,
  FoldedGraphProjection,
  FoldProjectionId,
  FoldedGraphTarget,
  GraphFoldOptions,
  FoldedLayoutIdentity,
  GraphElementTarget,
  GraphSession,
  GraphSessionId,
  LayoutDirection,
  LayoutIdentity,
  LayoutService,
  SelectionModel,
} from "@hier/viewmodel";

export type SchematicViewCommand = "layout" | "retry" | "cancel" | "select";
export type SchematicViewFailure =
  | {
      readonly command: "layout" | "retry" | "cancel";
      readonly sessionId: GraphSessionId;
      readonly graphRevision: number;
      readonly target?: never;
      readonly layoutIdentity?: never;
      readonly error: unknown;
    }
  | {
      readonly command: "select";
      readonly sessionId: GraphSessionId;
      readonly graphRevision: number;
      readonly target: GraphElementTarget;
      readonly layoutIdentity: LayoutIdentity;
      readonly error: unknown;
    };
export interface SchematicViewProps {
  readonly projection?: never;
  readonly onFoldChange?: never;
  readonly annotations?: readonly AnnotationLayer[] | undefined;
  readonly graph: GraphSession;
  readonly layout: LayoutService;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  /** Applies to the next explicit layout; changing this never schedules work. */
  readonly direction?: LayoutDirection;
  readonly className?: string;
  readonly onCommandError?: (failure: SchematicViewFailure) => void;
}

interface FoldedFailureBase {
  readonly sessionId: GraphSessionId;
  readonly graphRevision: number;
  readonly projectionId: FoldProjectionId;
  readonly error: unknown;
}
export type FoldedSchematicViewFailure = FoldedFailureBase &
  (
    | {
        readonly command: "layout" | "retry" | "cancel";
        readonly target?: never;
        readonly layoutIdentity?: never;
        readonly groupKey?: never;
        readonly collapsed?: never;
      }
    | {
        readonly command: "select";
        readonly target: FoldedGraphTarget;
        readonly layoutIdentity: FoldedLayoutIdentity;
        readonly groupKey?: never;
        readonly collapsed?: never;
      }
    | {
        readonly command: "fold";
        readonly groupKey: string;
        readonly collapsed: boolean;
        readonly target?: never;
        readonly layoutIdentity?: never;
      }
  );
export interface FoldedSchematicViewProps extends Omit<
  SchematicViewProps,
  "layout" | "onCommandError" | "projection" | "onFoldChange"
> {
  readonly layout: LayoutService<"folded">;
  readonly projection: FoldedGraphProjection;
  /** Synchronous controlled intent; the host publishes a new immutable projection. */
  readonly onFoldChange: (options: GraphFoldOptions) => void;
  readonly onCommandError?: (failure: FoldedSchematicViewFailure) => void;
}

export type AnySchematicViewProps = SchematicViewProps | FoldedSchematicViewProps;
