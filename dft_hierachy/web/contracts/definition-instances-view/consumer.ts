import { createElement, type ReactElement } from "react";
import type { HierClient } from "@hier/client";
import {
  DefinitionInstancesModel,
  SearchModel,
  SelectionModel,
  type DefinitionInstancesPage,
  type DefinitionInstancesQuery,
} from "@hier/viewmodel";
import { SearchResultsView } from "@hier/views";
import {
  DefinitionInstancesView,
  type DefinitionInstancesViewCommand,
  type DefinitionInstancesViewFailure,
  type DefinitionInstancesViewProps,
} from "./definition-instances-view.js";

// Compile-only composition, not an executable component or host coordinator.
async function createDefinitionBrowser(client: HierClient) {
  const snapshot = await client.ready;
  const search = new SearchModel(client);
  const instances = new DefinitionInstancesModel(client);
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });

  // An explicit host action after choosing a definition in SearchResultsView.
  // Its caller consumes this Promise and owns submission feedback/lifetime.
  function showSelectedDefinition(): Promise<void> {
    const selected = selection.current;
    const item = selected.items.length === 1 ? selected.items[0] : undefined;
    if (item?.def === undefined) return Promise.resolve();
    return instances.load({ snapshotId: snapshot.snapshotId, def: item.def });
  }

  function DefinitionBrowser(): ReactElement {
    return createElement(
      "section",
      null,
      createElement(SearchResultsView, {
        search,
        selection,
        ariaLabel: "定义搜索结果",
        height: 300,
      }),
      createElement(DefinitionInstancesView, {
        instances,
        selection,
        ariaLabel: "当前定义的实例候选",
        height: 400,
      }),
    );
  }
  // The host owns mounting, explicit load, and disposal after unmount.
  // The session owns the borrowed client. No automatic selection subscription.
  return {
    DefinitionBrowser,
    showSelectedDefinition,
    search,
    instances,
    selection,
  };
}

function typeBoundary(
  client: HierClient,
  instances: DefinitionInstancesModel,
  selection: SelectionModel,
  query: DefinitionInstancesQuery,
  page: DefinitionInstancesPage,
) {
  const props = {
    instances,
    selection,
    ariaLabel: "Definition instances",
    height: 300,
    onCommandError(failure: DefinitionInstancesViewFailure) {
      const command: DefinitionInstancesViewCommand = failure.command;
      const originalQuery: DefinitionInstancesQuery = failure.query;
      const originalError: unknown = failure.error;
      if (failure.command === "select") {
        const originalPage: DefinitionInstancesPage = failure.page;
        const index: number = failure.itemIndex;
        const ref: string | undefined = originalPage.result.items[index]?.ref;
        void [originalPage, index, ref];
      }
      void [command, originalQuery, originalError];
    },
  } satisfies DefinitionInstancesViewProps;
  createElement(DefinitionInstancesView, props);
  // @ts-expect-error DIV01: No second SDK path in the view.
  DefinitionInstancesView({ ...props, instances: client });
  // @ts-expect-error DIV02: Detached state is not the borrowed model.
  DefinitionInstancesView({ ...props, instances: instances.state });
  // @ts-expect-error DIV03: Shared selection model, not a copied value.
  DefinitionInstancesView({ ...props, selection: selection.current });
  // @ts-expect-error DIV04: Accessible label is required.
  DefinitionInstancesView({ instances, selection, height: 300 });
  // @ts-expect-error DIV05: Height is numerical CSS pixels.
  DefinitionInstancesView({ ...props, height: "100%" });
  // @ts-expect-error DIV06: A second query source is not accepted.
  DefinitionInstancesView({ ...props, query });
  // @ts-expect-error DIV07: Selection has one semantic channel.
  DefinitionInstancesView({ ...props, onSelect: () => {} });
  // @ts-expect-error DIV08: Exact optional callback is omitted when absent.
  DefinitionInstancesView({ ...props, onCommandError: undefined });
  // @ts-expect-error DIV09: Exact optional class is omitted when absent.
  DefinitionInstancesView({ ...props, className: undefined });
  // @ts-expect-error DIV10: No parallel pages DTO.
  DefinitionInstancesView({ ...props, pages: [page] });
  const selected: DefinitionInstancesViewFailure = {
    command: "select",
    query,
    page,
    itemIndex: 0,
    error: undefined,
  };
  // @ts-expect-error DIV11: Selection failure retains the raw page.
  const missingPage: DefinitionInstancesViewFailure = {
    command: "select",
    query,
    itemIndex: 0,
    error: null,
  };
  // @ts-expect-error DIV12: Selection failure retains its page-local index.
  const missingIndex: DefinitionInstancesViewFailure = {
    command: "select",
    query,
    page,
    error: null,
  };
  // @ts-expect-error DIV13: Query actions have no row coordinate.
  const extraPage: DefinitionInstancesViewFailure = {
    command: "reload",
    query,
    page,
    itemIndex: 0,
    error: null,
  };
  // @ts-expect-error DIV14: Explicit load belongs to the host.
  const load: DefinitionInstancesViewCommand = "load";
  // @ts-expect-error DIV15: Captured query is readonly.
  selected.query.def = "replacement";
  // @ts-expect-error DIV16: Original reply remains deeply readonly.
  selected.page.result.items[0]!.path.push("replacement");
  // @ts-expect-error DIV17: Page-local coordinate is readonly.
  selected.itemIndex = 1;
  // @ts-expect-error DIV18: Unknown error needs host narrowing.
  selected.error.code;
  void [missingPage, missingIndex, extraPage, load];
}

void [createDefinitionBrowser, typeBoundary];
