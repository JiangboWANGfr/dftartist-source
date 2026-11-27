/** Compile-only proposal. Not a production export. DESIGN section 6.7. */
import type { ReactElement } from "react";
import type { RowId, SelectionModel, TreeModel } from "@hier/viewmodel";

export type TreeViewCommand =
  "loadRoots" | "setExpanded" | "loadMore" | "cancel" | "select";

export interface TreeViewCommandFailure {
  readonly command: TreeViewCommand;
  readonly rowId: RowId | null;
  readonly error: unknown;
}

export interface HierarchyTreeProps {
  readonly tree: TreeModel;
  readonly selection: SelectionModel;
  readonly ariaLabel: string;
  readonly height: number;
  readonly rowHeight?: number;
  readonly overscan?: number;
  readonly className?: string;
  readonly onCommandError?: (failure: TreeViewCommandFailure) => void;
}

export declare function HierarchyTree(props: HierarchyTreeProps): ReactElement;
