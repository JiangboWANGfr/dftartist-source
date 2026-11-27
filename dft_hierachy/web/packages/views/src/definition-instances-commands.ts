import type {
  DefinitionInstancesPage,
  DefinitionInstancesQuery,
  DefinitionInstancesState,
} from "@hier/viewmodel";
import { useViewCommands } from "./view-commands.js";
import { permitsPageAction, type PageAction } from "./paged-result-actions.js";
import type {
  DefinitionInstancesViewFailure,
  DefinitionInstancesViewProps,
} from "./definition-instances-view-types.js";

function queryOf(
  state: DefinitionInstancesState,
): DefinitionInstancesQuery | null {
  return state.query;
}

export function useDefinitionInstancesCommands(
  props: DefinitionInstancesViewProps,
) {
  const { instances, selection } = props;
  return useViewCommands<
    DefinitionInstancesQuery,
    DefinitionInstancesState,
    PageAction<DefinitionInstancesPage>,
    DefinitionInstancesViewFailure
  >(
    instances,
    selection,
    props.onCommandError,
    queryOf,
    permitsPageAction<DefinitionInstancesPage>,
    (action) => {
      if (action.command !== "select") return instances[action.command]();
      const occurrence = action.page.result.items[action.itemIndex]!;
      selection.select({
        snapshotId: instances.snapshotId,
        origin: "external",
        items: [{ ref: occurrence.ref }],
      });
    },
    (action, query, error) =>
      Object.freeze(
        action.command === "select"
          ? {
              command: action.command,
              query,
              page: action.page,
              itemIndex: action.itemIndex,
              error,
            }
          : { command: action.command, query, error },
      ),
  );
}
