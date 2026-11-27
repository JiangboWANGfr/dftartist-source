import type { HierClient } from "@hier/client";
import type {
  SelectionModel,
  SourceCandidatesPage,
  SourceNavigationModel as ProductionNavigation,
} from "@hier/viewmodel";
import { SourceConfirmationError, SourceNavigationModel } from "./proposal.js";
import type {
  SourceCandidateAction,
  SourceConfirmationErrorCode,
} from "./proposal.js";

declare const client: HierClient;
declare const page: SourceCandidatesPage;
declare const selection: SelectionModel;
declare const production: ProductionNavigation;

const navigation = new SourceNavigationModel(client, { pageSize: 10 });
const oldApi: ProductionNavigation = navigation;
const stillAsync: Promise<void> = navigation.loadMore();
const action = navigation.createCandidateAction(page, 0);
const originalPage: SourceCandidatesPage = action.page;
const itemIndex: number = action.itemIndex;
const confirmed: void = navigation.confirmCandidate(action, selection);
const localError: Error = new SourceConfirmationError(
  "stale_action",
  "Old row",
);
const unavailable: SourceConfirmationErrorCode = "address_unavailable";
void [
  oldApi,
  stillAsync,
  originalPage,
  itemIndex,
  confirmed,
  localError,
  unavailable,
];

// Types cannot prove issuance or freshness. Spreading keeps the static brand,
// but the contract explicitly rejects this object at runtime. Do not execute it.
const structurallyBrandedCopy: SourceCandidateAction = { ...action };
void structurallyBrandedCopy;

// @ts-expect-error C01 bare hit is not an action
navigation.confirmCandidate(page.result.items[0]!, selection);
// @ts-expect-error C02 page is not an action
navigation.confirmCandidate(page, selection);
// @ts-expect-error C03 a literal cannot construct the private brand
const forged: SourceCandidateAction = { page, itemIndex: 0 };
// @ts-expect-error C04 raw result is not a Reply
navigation.createCandidateAction(page.result, 0);
// @ts-expect-error C05 no string coercion for item index
navigation.createCandidateAction(page, "0");
// @ts-expect-error C06 index is required
navigation.createCandidateAction(page);
// @ts-expect-error C07 no raw reference overload
navigation.createCandidateAction("opaque-ref", 0);
// @ts-expect-error C08 page cannot be changed
action.page = page;
// @ts-expect-error C09 index cannot be changed
action.itemIndex = 1;
// @ts-expect-error C10 action does not duplicate a target ref
action.ref;
// @ts-expect-error C11 confirmation is synchronous
const asynchronous: Promise<void> = navigation.confirmCandidate(
  action,
  selection,
);
// @ts-expect-error C12 selection destination is required
navigation.confirmCandidate(action);
// @ts-expect-error C13 a function is not a SelectionModel
navigation.confirmCandidate(action, () => {});
// @ts-expect-error C14 a duck-typed select is not a SelectionModel
navigation.confirmCandidate(action, { select() {} });
// @ts-expect-error C15 confirmation does not accept a caller snapshot argument
navigation.confirmCandidate(action, selection, "snapshot");
// @ts-expect-error C16 local error code is closed
new SourceConfirmationError("cancelled", "Not an asynchronous command");
// @ts-expect-error C17 proposed methods are absent in the production declaration
production.createCandidateAction(page, 0);
// @ts-expect-error C18 existing async command signature is retained
const synchronous: void = navigation.reloadCandidates();
// @ts-expect-error C19 creation is synchronous
const actionPromise: Promise<SourceCandidateAction> = action;
// @ts-expect-error C20 partial ownership is not a new selection model
navigation.confirmCandidate(action, { snapshotId: navigation.snapshotId });
// @ts-expect-error C21 local error code is readonly
new SourceConfirmationError("disposed", "Closed").code = "not_ready";
// @ts-expect-error C22 action array is not an action
navigation.confirmCandidate([action], selection);
void [forged, asynchronous, synchronous, actionPromise];

// @ts-expect-error C23 the private action brand cannot be imported
import { sourceCandidateActionBrand } from "./proposal.js";
void sourceCandidateActionBrand;
