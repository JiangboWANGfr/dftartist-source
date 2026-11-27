import type { HierClient } from "@hier/client";
import { SelectionModel, TreeModel } from "@hier/viewmodel";
import { HierarchyTree } from "./m5-tree-view.js";
import type {
  HierarchyTreeProps,
  TreeViewCommandFailure,
} from "./m5-tree-view.js";

declare const client: HierClient;

async function host() {
  const snapshot = await client.ready;
  const tree = new TreeModel(client);
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
  const props = {
    tree,
    selection,
    ariaLabel: "Design hierarchy",
    height: 336,
    onCommandError(failure: TreeViewCommandFailure) {
      const original: unknown = failure.error;
      if (original instanceof Error)
        console.error(failure.command, original.message);
    },
  } satisfies HierarchyTreeProps;
  // A ready-bound, unpreloaded model is a valid view input (real roots idle row).
  HierarchyTree(props);
  await tree.loadRoots();
  HierarchyTree({ ...props, rowHeight: 28, overscan: 2, className: "tree" });

  // @ts-expect-error The view consumes a TreeModel, not the SDK or raw tree data.
  HierarchyTree({ ...props, tree: client });
  // @ts-expect-error A semantic selection array is not a SelectionModel.
  HierarchyTree({ ...props, selection: [] });
  // @ts-expect-error A meaningful accessible name is required.
  HierarchyTree({ tree, selection, height: 336 });
  // @ts-expect-error Fixed numerical viewport height; CSS string is not accepted.
  HierarchyTree({ ...props, height: "100%" });
  // @ts-expect-error UI does not expose a second expanded-node state.
  HierarchyTree({ ...props, expandedIds: [] });
  // @ts-expect-error UI does not expose a second semantic selection callback.
  HierarchyTree({ ...props, onSelect: () => {} });
  // @ts-expect-error Exact optional properties: omit overscan to get its default.
  HierarchyTree({ ...props, overscan: undefined });
}

declare const failure: TreeViewCommandFailure;
// @ts-expect-error Error records are readonly.
failure.command = "cancel";
// @ts-expect-error Original errors require narrowing before use.
failure.error.code;
void host;
