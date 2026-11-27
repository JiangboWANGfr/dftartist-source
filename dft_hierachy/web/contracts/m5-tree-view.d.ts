/** Compile-only proposal. Not a production export. DESIGN section 6.7. */
import type { ReactElement } from "react";
import type { RowId, SelectionModel, TreeModel } from "@hier/viewmodel";

export type TreeViewCommand =
  "loadRoots" | "setExpanded" | "loadMore" | "cancel" | "select";

export interface TreeViewCommandFailure {
  readonly command: TreeViewCommand;
  /** Triggering row captured before invocation, never the status owner's id.
   * This revision has no rowless action; null remains in the declared type. */
  readonly rowId: RowId | null;
  /** Original synchronous throw or Promise rejection, including AggregateError. */
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
  /** Runs after notification and settlement; synchronous failures use a microtask.
   * Stale mount/session feedback is discarded. See DESIGN 6.7.3. */
  readonly onCommandError?: (failure: TreeViewCommandFailure) => void;
}

export declare function HierarchyTree(props: HierarchyTreeProps): ReactElement;
