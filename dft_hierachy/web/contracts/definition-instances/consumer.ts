/** Compile-only consumers; not a production model or selection coordinator. */
import type { HierClient, Reply } from "@hier/client";
import type { ResultOf } from "@hier/protocol-types";
import type { SelectionModel } from "@hier/viewmodel";
import {
  DefinitionInstancesError,
  DefinitionInstancesModel,
  type DefinitionInstancesPage,
  type DefinitionInstancesQuery,
  type DefinitionInstancesState,
} from "./definition-instances.js";

export async function host(
  client: HierClient,
  query: DefinitionInstancesQuery,
  publish: (state: DefinitionInstancesState) => void,
): Promise<void> {
  await client.ready;
  const model = new DefinitionInstancesModel(client, { pageSize: 50 });
  const unsubscribe = model.subscribe(() => publish(model.state));
  try {
    await model.load(query);
    const page: Reply<ResultOf<"def.instances">> | undefined =
      model.state.pages.at(-1);
    if (
      page?.completeness.status === "complete" &&
      page.result.next !== undefined
    )
      await model.loadMore();
    await model.reload();
    await model.cancel();
    await model.clear();
  } finally {
    unsubscribe();
    model.dispose();
  }
}

/** An explicit caller action; loading a definition never invokes this function. */
export function chooseDisplayedOccurrence(
  model: DefinitionInstancesModel,
  selection: SelectionModel,
  query: DefinitionInstancesQuery,
  page: DefinitionInstancesPage,
  itemIndex: number,
): void {
  const state = model.state;
  if (
    model.disposed ||
    selection.disposed ||
    selection.snapshotId !== model.snapshotId ||
    state.status !== "success" ||
    state.query !== query ||
    !state.pages.includes(page) ||
    !Number.isSafeInteger(itemIndex) ||
    itemIndex < 0
  )
    return;
  const occurrence = page.result.items[itemIndex];
  if (!occurrence) return;
  selection.select({
    snapshotId: model.snapshotId,
    origin: "external",
    items: [{ ref: occurrence.ref }],
  });
}

export function typeBoundaries(
  client: HierClient,
  model: DefinitionInstancesModel,
  query: DefinitionInstancesQuery,
  state: DefinitionInstancesState,
): void {
  void model.load(query);
  // @ts-expect-error D01 explicit snapshot is required
  void model.load({ def: query.def });
  // @ts-expect-error D02 definition is required
  void model.load({ snapshotId: model.snapshotId });
  // @ts-expect-error D03 snapshot must be a string
  void model.load({ snapshotId: 5, def: query.def });
  // @ts-expect-error D04 definition must be a string
  void model.load({ ...query, def: 5 });
  // @ts-expect-error D05 definition is not optional
  void model.load({ ...query, def: undefined });
  // @ts-expect-error D06 ObjectSelection is not a query envelope
  void model.load({ snapshotId: model.snapshotId, ref: query.def });
  // @ts-expect-error D07 page size is numeric
  new DefinitionInstancesModel(client, { pageSize: "5" });
  // @ts-expect-error D08 own undefined pageSize is not omission
  new DefinitionInstancesModel(client, { pageSize: undefined });
  // @ts-expect-error D09 captured definition is readonly
  query.def = "another";
  // @ts-expect-error D10 snapshot binding is readonly
  model.snapshotId = "another";
  // @ts-expect-error D11 local error code is a closed union
  new DefinitionInstancesError("timeout", "unsupported local code");
  // @ts-expect-error D12 pages are readonly
  state.pages.push({});
  const page = state.pages[0];
  if (page) {
    // @ts-expect-error D13 original items are deeply readonly
    page.result.items.push({});
    const occurrence = page.result.items[0];
    if (occurrence) {
      // @ts-expect-error D14 occurrence identity is readonly
      occurrence.ref = "another";
      // @ts-expect-error D15 path segments are deeply readonly
      occurrence.path.push("invented");
    }
    // @ts-expect-error D16 success does not mean complete
    const complete: "complete" = page.completeness.status;
    void complete;
  }
  if (state.status === "idle") {
    // @ts-expect-error D17 idle has no target
    void state.query.def;
  }
  if (state.status === "success") {
    // @ts-expect-error D18 success has no error
    void state.error.code;
  }
}
