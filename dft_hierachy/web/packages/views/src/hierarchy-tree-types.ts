import type {
  AnnotationLayer,
  RowId,
  SelectionModel,
  TreeModel,
} from "@hier/viewmodel";

export type TreeViewCommand =
  "loadRoots" | "setExpanded" | "loadMore" | "cancel" | "select";

export interface TreeViewCommandFailure {
  readonly command: TreeViewCommand;
  /** The triggering row, including for a status action on its owner's page. */
  readonly rowId: RowId | null;
  readonly error: unknown;
}

/** Both live models are borrowed from the host and must share a snapshot. */
export interface HierarchyTreeProps {
  readonly annotations?: readonly AnnotationLayer[] | undefined;
  readonly tree: TreeModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  /** Fixed row height in CSS pixels; defaults to 28. */
  readonly rowHeight?: number;
  /** Extra rows per viewport edge; defaults to 2. */
  readonly overscan?: number;
  readonly className?: string;
  readonly onCommandError?: (failure: TreeViewCommandFailure) => void;
}
