export const positive = `
import {SourceNavigationModel,SourceNavigationError,type SourceNavigationErrorCode,type SourceNavigationState,type SourceNavigationCandidates,type SourceNavigationRefresh} from "@hier/viewmodel";
import {SourceDocumentModel,SourceCandidatesModel,SourceDocumentError,SourceCandidatesError,SourcePositionError,type SourceDocument,type SourceDocumentState,type SourceCandidatesState,type SourceCandidatesOptions,type SourceDocumentErrorCode,type SourceCandidatesErrorCode,type SourcePositionErrorCode} from "@hier/viewmodel";
import type {HierClient,Unsubscribe} from "@hier/client";
import type {SnapshotId} from "@hier/protocol-types";
declare const client:HierClient;declare const document:SourceDocument;
const model=new SourceNavigationModel(client,{pageSize:2});
const snap:SnapshotId=model.snapshotId;
const state:SourceNavigationState=model.state;
const docState:SourceDocumentState=state.document;
if(state.candidates){const binding:SourceNavigationCandidates=state.candidates;const doc:SourceDocument=binding.document;const offset:number=binding.utf16Offset;const candidates:Exclude<SourceCandidatesState,{readonly status:"idle"}>=binding.state;const col:number|undefined=binding.state.query.col;}
if(state.refresh){const refresh:SourceNavigationRefresh=state.refresh;const original:SourceDocument=refresh.document;const offset:number=refresh.utf16Offset;const completion:Promise<void>=refresh.completion;}
const commands:Promise<void>[]=[model.load("B","definition"),model.reloadDocument(),model.cancelDocument(),model.clear(),model.locate(document,0),model.loadMore(),model.reloadCandidates(),model.cancelCandidates()];
const off:Unsubscribe=model.subscribe(()=>{});off();model.dispose();
const codes:readonly SourceNavigationErrorCode[]=["disposed","reentrant_change"];
const error=new SourceNavigationError("disposed","B");const inherited:Error=error;
const oldDocument=new SourceDocumentModel(client),oldCandidates=new SourceCandidatesModel(client);
const oldPosition=oldDocument.queryAt(document,0);const byteColumn:number=oldPosition.col;
const oldDocCodes:readonly SourceDocumentErrorCode[]=["invalid_argument","disposed","cancelled","inconsistent_reply","reentrant_change"];
const oldCandidateCodes:readonly SourceCandidatesErrorCode[]=["invalid_options","invalid_argument","snapshot_mismatch","disposed","cancelled","inconsistent_reply","reentrant_change"];
const oldPositionCodes:readonly SourcePositionErrorCode[]=["disposed","stale_document","changed_document","invalid_argument"];
`;
export const negatives = [
  ["constructor-missing", "new SourceNavigationModel();"],
  ["constructor-null", "new SourceNavigationModel(null);"],
  ["options-null", "new SourceNavigationModel(client,null);"],
  ["options-array", "new SourceNavigationModel(client,[]);"],
  ["page-size-string", "new SourceNavigationModel(client,{pageSize:'1'});"],
  [
    "page-size-undefined",
    "new SourceNavigationModel(client,{pageSize:undefined});",
  ],
  [
    "state-readonly",
    "model.state={document:docState,candidates:null,refresh:null};",
  ],
  ["snapshot-readonly", "model.snapshotId='B';"],
  ["disposed-readonly", "model.disposed=false;"],
  ["document-branch-readonly", "state.document=docState;"],
  ["binding-branch-readonly", "state.candidates=null;"],
  ["refresh-branch-readonly", "state.refresh=null;"],
  [
    "binding-document-readonly",
    "if(state.candidates)state.candidates.document=document;",
  ],
  [
    "binding-offset-readonly",
    "if(state.candidates)state.candidates.utf16Offset=2;",
  ],
  [
    "binding-state-readonly",
    "if(state.candidates)state.candidates.state=state.candidates.state;",
  ],
  [
    "binding-cannot-idle",
    "const badBinding:SourceNavigationCandidates={document,utf16Offset:0,state:{status:'idle',query:null,pages:[]}};",
  ],
  [
    "refresh-document-readonly",
    "if(state.refresh)state.refresh.document=document;",
  ],
  ["refresh-offset-readonly", "if(state.refresh)state.refresh.utf16Offset=2;"],
  [
    "completion-readonly",
    "if(state.refresh)state.refresh.completion=Promise.resolve();",
  ],
  [
    "completion-not-void",
    "if(state.refresh){const wrong:void=state.refresh.completion;}",
  ],
  [
    "completion-not-result",
    "if(state.refresh){const wrong:Promise<string>=state.refresh.completion;}",
  ],
  [
    "refresh-missing-completion",
    "const wrong:SourceNavigationRefresh={document,utf16Offset:0};",
  ],
  ["load-missing-kind", "model.load('B');"],
  ["load-bad-kind", "model.load('B','invalid');"],
  ["load-numeric-ref", "model.load(1,'definition');"],
  ["locate-missing-document", "model.locate();"],
  ["locate-missing-offset", "model.locate(document);"],
  ["locate-null", "model.locate(null,0);"],
  ["locate-query-not-document", "model.locate(oldPosition,0);"],
  ["locate-string-offset", "model.locate(document,'0');"],
  ["locate-coordinates-not-offset", "model.locate(document,{line:1,col:1});"],
  ["locate-async", "const wrong:void=model.locate(document,0);"],
  ["load-more-async", "const wrong:void=model.loadMore();"],
  ["cancel-async", "const wrong:void=model.cancelCandidates();"],
  ["error-code-readonly", "error.code='disposed';"],
  [
    "error-not-input",
    "const code:SourceNavigationErrorCode='invalid_argument';",
  ],
  ["error-not-query", "new SourceNavigationError('cancelled','B');"],
  [
    "old-doc-no-navigation-code",
    "const code:SourceDocumentErrorCode='stale_document';",
  ],
  [
    "old-candidate-no-navigation-code",
    "const code:SourceCandidatesErrorCode='changed_document';",
  ],
  [
    "old-position-no-navigation-code",
    "const code:SourcePositionErrorCode='reentrant_change';",
  ],
  ["private-document-not-public", "model.documentModel;"],
  ["private-candidates-not-public", "model.candidatesModel;"],
  ["no-selection-mapping", "model.selectCandidate('B');"],
  ["no-exposed-queryAt", "model.queryAt(document,0);"],
  ["no-parallel-flat-items", "state.candidates?.items;"],
  ["no-implicit-Node-platform", "const pid=process.pid;"],
];
