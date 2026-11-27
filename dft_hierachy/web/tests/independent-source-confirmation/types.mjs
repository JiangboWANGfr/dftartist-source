export const positive = `
import {SourceNavigationModel,SourceConfirmationError,type SourceCandidateAction,type SourceConfirmationErrorCode} from "@hier/viewmodel";
import {SelectionModel,type SourceCandidatesPage,type SourceNavigationState,type SourceDocument} from "@hier/viewmodel";
import type {HierClient} from "@hier/client";
declare const client:HierClient,page:SourceCandidatesPage,document:SourceDocument;
const nav=new SourceNavigationModel(client,{pageSize:2}),sel=new SelectionModel({snapshotId:nav.snapshotId});
const a:SourceCandidateAction=nav.createCandidateAction(page,0),p:SourceCandidatesPage=a.page,i:number=a.itemIndex;
const done:void=nav.confirmCandidate(a,sel);
const state:SourceNavigationState=nav.state;
const old:Promise<void>[]=[nav.load("B","definition"),nav.reloadDocument(),nav.cancelDocument(),nav.clear(),nav.locate(document,0),nav.loadMore(),nav.reloadCandidates(),nav.cancelCandidates()];
const code:SourceConfirmationErrorCode="stale_action",err:Error=new SourceConfirmationError(code,"B");
const ownError=new SourceConfirmationError("invalid_index","B");
const all:readonly SourceConfirmationErrorCode[]=["disposed","reentrant_change","not_ready","invalid_page","invalid_index","invalid_action","stale_action","address_unavailable","invalid_selection_model"];
class Derived extends SelectionModel{};nav.confirmCandidate(a,new Derived({snapshotId:nav.snapshotId}));
`;
export const negatives = [
  ["create-missing-page", "nav.createCandidateAction();"],
  ["create-missing-index", "nav.createCandidateAction(page);"],
  ["create-null-page", "nav.createCandidateAction(null,0);"],
  ["create-result", "nav.createCandidateAction(page.result,0);"],
  ["index-string", "nav.createCandidateAction(page,'0');"],
  ["index-boxed", "nav.createCandidateAction(page,new Number(0));"],
  ["index-coordinates", "nav.createCandidateAction(page,{line:1,col:1});"],
  [
    "create-not-promise",
    "const wrong:Promise<SourceCandidateAction>=nav.createCandidateAction(page,0);",
  ],
  [
    "confirm-not-promise",
    "const wrong:Promise<void>=nav.confirmCandidate(a,sel);",
  ],
  ["confirm-missing-action", "nav.confirmCandidate();"],
  ["confirm-missing-selection", "nav.confirmCandidate(a);"],
  ["confirm-null-action", "nav.confirmCandidate(null,sel);"],
  ["confirm-raw-page", "nav.confirmCandidate(page,sel);"],
  ["confirm-raw-hit", "nav.confirmCandidate(page.result.items[0]!,sel);"],
  [
    "confirm-structural-action",
    "nav.confirmCandidate({page,itemIndex:0},sel);",
  ],
  [
    "action-brand-required",
    "const wrong:SourceCandidateAction={page,itemIndex:0};",
  ],
  ["confirm-null-selection", "nav.confirmCandidate(a,null);"],
  ["confirm-structural-selection", "nav.confirmCandidate(a,{select(){}});"],
  ["page-readonly", "a.page=page;"],
  ["index-readonly", "a.itemIndex=1;"],
  ["no-copied-hit", "a.hit;"],
  ["no-copied-ref", "a.ref;"],
  ["no-copied-refKind", "a.refKind;"],
  ["no-action-constructor", "new SourceCandidateAction();"],
  [
    "no-public-brand",
    "import {sourceCandidateActionBrand} from '@hier/viewmodel';",
  ],
  ["error-code-readonly", "ownError.code='disposed';"],
  ["error-wrong-code", "new SourceConfirmationError('cancelled','B');"],
  [
    "error-union-no-core",
    "const wrong:SourceConfirmationErrorCode='not_found';",
  ],
  [
    "error-union-no-selection",
    "const wrong:SourceConfirmationErrorCode='snapshot_mismatch';",
  ],
  ["old-async-not-void", "const wrong:void=nav.clear();"],
  ["no-extra-selection-state", "nav.current;"],
  ["no-extra-history", "nav.back();"],
  ["no-selection-field", "state.selection;"],
  ["no-auto-select", "nav.selectFirstCandidate();"],
  ["no-node-leak", "const wrong=process.pid;"],
  ["no-react-leak", "const wrong:React.ReactNode=null;"],
  [
    "action-not-runtime-constructor",
    "import {SourceCandidateAction as Ctor} from '@hier/viewmodel';new Ctor();",
  ],
];
