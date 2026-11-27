// Agent B. Type-only consumers of DESIGN 6.7, never runtime/GUI evidence.
import { HierarchyTree } from "@hier/views";
import type {
  HierarchyTreeProps,
  TreeViewCommand,
  TreeViewCommandFailure,
} from "@hier/views";
import type { SelectionModel, TreeModel, RowId } from "@hier/viewmodel";
import type { ReactElement, ComponentType } from "react";

declare const tree: TreeModel;
declare const selection: SelectionModel;
declare const id: RowId;
declare const value: unknown;
declare const props: HierarchyTreeProps;
declare const failure: TreeViewCommandFailure;

const base: HierarchyTreeProps = {
  tree,
  selection,
  ariaLabel: "Hierarchy",
  height: 280,
};
const full: HierarchyTreeProps = {
  ...base,
  rowHeight: 28,
  overscan: 0,
  className: "",
  onCommandError(f) {
    const command: TreeViewCommand = f.command;
    const row: RowId | null = f.rowId;
    const original: unknown = f.error;
    void [command, row, original];
  },
};
const element: ReactElement = HierarchyTree(base);
const component: ComponentType<HierarchyTreeProps> = HierarchyTree;
HierarchyTree(Object.freeze({ ...full }));
// Numeric value constraints belong to render-time validation, not number types.
HierarchyTree({ ...base, height: NaN, rowHeight: Infinity, overscan: -0.5 });
HierarchyTree({ ...base, ariaLabel: "   " });
// TS void callback compatibility does not make async callback errors UI-owned.
HierarchyTree({ ...base, onCommandError: async () => {} });
const commands: readonly TreeViewCommand[] = [
  "loadRoots",
  "setExpanded",
  "loadMore",
  "cancel",
  "select",
];
const failures: readonly TreeViewCommandFailure[] = commands.flatMap(
  (command) => [
    { command, rowId: null, error: undefined },
    { command, rowId: id, error: value },
  ],
);
const erased: unknown = failure.error;
type AsyncView = (p: HierarchyTreeProps) => Promise<ReactElement>;
void [element, component, commands, failures, erased];

// @ts-expect-error V01: borrowed tree is required
HierarchyTree({ selection, ariaLabel: "B", height: 28 });
// @ts-expect-error V02: borrowed selection is required
HierarchyTree({ tree, ariaLabel: "B", height: 28 });
// @ts-expect-error V03: accessible label is required
HierarchyTree({ tree, selection, height: 28 });
// @ts-expect-error V04: viewport height is required
HierarchyTree({ tree, selection, ariaLabel: "B" });
// @ts-expect-error V05: selection is not a TreeModel
HierarchyTree({ ...base, tree: selection });
// @ts-expect-error V06: tree is not a SelectionModel
HierarchyTree({ ...base, selection: tree });
// @ts-expect-error V07: label is a string
HierarchyTree({ ...base, ariaLabel: 1 });
// @ts-expect-error V08: height does not coerce text
HierarchyTree({ ...base, height: "28" });
// @ts-expect-error V09: rowHeight does not coerce text
HierarchyTree({ ...base, rowHeight: "28" });
// @ts-expect-error V10: overscan does not coerce text
HierarchyTree({ ...base, overscan: "2" });
// @ts-expect-error V11: className is a string
HierarchyTree({ ...base, className: 1 });
// @ts-expect-error V12: error callback must be callable
HierarchyTree({ ...base, onCommandError: "log" });
// @ts-expect-error V13: exact optional rowHeight is narrower than runtime
HierarchyTree({ ...base, rowHeight: undefined });
// @ts-expect-error V14: exact optional overscan is narrower than runtime
HierarchyTree({ ...base, overscan: undefined });
// @ts-expect-error V15: exact optional className rejects present undefined
HierarchyTree({ ...base, className: undefined });
// @ts-expect-error V16: exact optional callback rejects present undefined
HierarchyTree({ ...base, onCommandError: undefined });
// @ts-expect-error V17: null is not a tree
HierarchyTree({ ...base, tree: null });
// @ts-expect-error V18: null is not a selection
HierarchyTree({ ...base, selection: null });
// @ts-expect-error V19: null is not a label
HierarchyTree({ ...base, ariaLabel: null });
// @ts-expect-error V20: null is not a height
HierarchyTree({ ...base, height: null });
// @ts-expect-error V21: null is not a rowHeight
HierarchyTree({ ...base, rowHeight: null });
// @ts-expect-error V22: null is not an overscan
HierarchyTree({ ...base, overscan: null });
// @ts-expect-error V23: null is not a className
HierarchyTree({ ...base, className: null });
// @ts-expect-error V24: null is not a callback
HierarchyTree({ ...base, onCommandError: null });
// @ts-expect-error V25: borrowed tree prop is readonly
props.tree = tree;
// @ts-expect-error V26: borrowed selection prop is readonly
props.selection = selection;
// @ts-expect-error V27: label prop is readonly
props.ariaLabel = "changed";
// @ts-expect-error V28: height prop is readonly
props.height = 28;
// @ts-expect-error V29: rowHeight prop is readonly
props.rowHeight = 28;
// @ts-expect-error V30: overscan prop is readonly
props.overscan = 2;
// @ts-expect-error V31: className prop is readonly
props.className = "changed";
// @ts-expect-error V32: callback prop is readonly
props.onCommandError = () => {};
// @ts-expect-error V33: reveal coordination is not a view command
const invalidCommand: TreeViewCommand = "reveal";
// @ts-expect-error V34: unbranded row text is not a RowId
const textRow: TreeViewCommandFailure = { ...failure, rowId: "row" };
// @ts-expect-error V35: numeric row is not a RowId
const numberRow: TreeViewCommandFailure = { ...failure, rowId: 0 };
// @ts-expect-error V36: command error stays unknown, not assumed Error
void failure.error.message;
// @ts-expect-error V37: command metadata is readonly
failure.command = "select";
// @ts-expect-error V38: row metadata is readonly
failure.rowId = id;
// @ts-expect-error V39: original error slot is readonly
failure.error = value;
// @ts-expect-error V40: command discriminator is required
const noCommand: TreeViewCommandFailure = { rowId: null, error: value };
// @ts-expect-error V41: row slot is required even when null
const noRow: TreeViewCommandFailure = { command: "loadRoots", error: value };
// @ts-expect-error V42: original error slot is required even for undefined
const noError: TreeViewCommandFailure = { command: "loadRoots", rowId: null };
// @ts-expect-error V43: failure does not expose a separate mutable status
const extra: TreeViewCommandFailure = { ...failure, status: "failed" };
// @ts-expect-error V44: component always returns a ReactElement
const nullResult: null = HierarchyTree(base);
// @ts-expect-error V45: view does not accept independently owned rows
HierarchyTree({ ...base, rows: tree.rows });
// @ts-expect-error V46: component render is not an asynchronous command
const asyncView: AsyncView = HierarchyTree;
