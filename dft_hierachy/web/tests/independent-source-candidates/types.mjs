export const positive = `
import {SourceCandidatesModel,SourceCandidatesError,type SourceCandidatesQuery,type SourceCandidatesState,type SourceCandidatesOptions,type SourceCandidatesPage,type SourceCandidatesFailure,type SourceCandidatesErrorCode} from "@hier/viewmodel";
import type {TreeDiagnosticIssue} from "@hier/viewmodel";
import type {HierClient,Reply,Unsubscribe} from "@hier/client";
import type {ResultOf,SnapshotId,FileRef} from "@hier/protocol-types";
declare const client:HierClient;
declare const snapshot:SnapshotId;
declare const file:FileRef;
declare const failure:SourceCandidatesFailure;
declare const reply:Reply<ResultOf<"source.resolve">>;
const query:SourceCandidatesQuery={snapshotId:snapshot,file,line:1};
const point:SourceCandidatesQuery={...query,col:1};
const options:SourceCandidatesOptions={pageSize:2};
const model=new SourceCandidatesModel(client,options);
const id:SnapshotId=model.snapshotId;
const disposed:boolean=model.disposed;
const off:Unsubscribe=model.subscribe(()=>{});
const commands:Promise<void>[]=[model.load(query),model.load(point),model.loadMore(),model.reload(),model.cancel(),model.clear()];
off();model.dispose();
const page:SourceCandidatesPage=reply;
const pages:readonly SourceCandidatesPage[]=[page];
const states:readonly SourceCandidatesState[]=[
 {status:"idle",query:null,pages:[]},{status:"pending",query,pages},
 {status:"success",query,pages},{status:"failed",query,pages,error:failure},
 {status:"cancelled",query,pages,error:failure},
];
const error=new SourceCandidatesError("inconsistent_reply","B");
const code:SourceCandidatesErrorCode=error.code;
const allCodes:readonly SourceCandidatesErrorCode[]=["invalid_options","invalid_argument","snapshot_mismatch","disposed","cancelled","inconsistent_reply","reentrant_change"];
function consume(s:SourceCandidatesState):string{
 switch(s.status){
 case "idle":const n:null=s.query;return "";
 case "pending":case "success":return s.query.file+s.pages.flatMap(p=>p.result.items).map(h=>h.kind+h.ref).join(",");
 case "failed":case "cancelled":return s.error.origin+s.error.code+s.error.message;
 default:const never:never=s;return never;
 }
}
if(failure.dataIssue){const issue:TreeDiagnosticIssue=failure.dataIssue;const path:readonly string[]=issue.path;}
`;
export const negatives = [
  ["query-snapshot-required", "const bad:SourceCandidatesQuery={file,line:1};"],
  [
    "query-file-required",
    "const bad:SourceCandidatesQuery={snapshotId:snapshot,line:1};",
  ],
  [
    "query-line-required",
    "const bad:SourceCandidatesQuery={snapshotId:snapshot,file};",
  ],
  ["query-number-file", "model.load({...query,file:1});"],
  ["query-string-line", 'model.load({...query,line:"1"});'],
  ["query-string-col", 'model.load({...query,col:"1"});'],
  ["query-explicit-undefined-col", "model.load({...query,col:undefined});"],
  ["query-readonly-file", 'query.file="B";'],
  ["query-readonly-snapshot", 'query.snapshotId="B";'],
  ["query-readonly-line", "query.line=2;"],
  ["query-readonly-col", "query.col=2;"],
  ["options-string", 'new SourceCandidatesModel(client,{pageSize:"2"});'],
  [
    "options-explicit-undefined",
    "new SourceCandidatesModel(client,{pageSize:undefined});",
  ],
  ["options-readonly", "options.pageSize=1;"],
  ["load-null", "model.load(null);"],
  ["load-document", "model.load({source:reply,content:reply});"],
  ["load-missing", "model.load();"],
  ["load-extra", "model.load(query,{});"],
  ["load-more-extra", "model.loadMore(query);"],
  ["reload-extra", "model.reload(query);"],
  ["subscribe-noncallable", "model.subscribe(1);"],
  ["readonly-model-state", "model.state=states[0]!;"],
  ["readonly-model-snapshot", 'model.snapshotId="B";'],
  ["readonly-model-disposed", "model.disposed=true;"],
  ["readonly-state-status", 'states[0]!.status="success";'],
  ["readonly-state-query", "states[0]!.query=query;"],
  ["readonly-pages", "states[0]!.pages=[];"],
  ["no-page-push", "pages.push(page);"],
  ["no-items-push", "page.result.items.push(page.result.items[0]!);"],
  ["readonly-hit", 'page.result.items[0]!.kind="statement";'],
  ["readonly-span", "page.result.items[0]!.span.start.offset=2;"],
  ["readonly-reasons", 'page.completeness.reasons.push({code:"indexing"});'],
  [
    "idle-query-null",
    'const bad:SourceCandidatesState={status:"idle",query,pages};',
  ],
  [
    "pending-needs-query",
    'const bad:SourceCandidatesState={status:"pending",query:null,pages};',
  ],
  [
    "success-needs-pages",
    'const bad:SourceCandidatesState={status:"success",query};',
  ],
  [
    "success-forbids-error",
    'const bad:SourceCandidatesState={status:"success",query,pages,error:failure};',
  ],
  [
    "success-forbids-undefined",
    'const bad:SourceCandidatesState={status:"success",query,pages,error:undefined};',
  ],
  [
    "failed-needs-error",
    'const bad:SourceCandidatesState={status:"failed",query,pages};',
  ],
  [
    "cancelled-needs-error",
    'const bad:SourceCandidatesState={status:"cancelled",query,pages};',
  ],
  ["no-flat-items", "states[0]!.items;"],
  ["original-reply-required", "const bad:SourceCandidatesPage=reply.result;"],
  ["unknown-error", 'new SourceCandidatesError("stale_file","B");'],
  ["readonly-error-code", 'error.code="disposed";'],
  [
    "wrong-origin",
    'const bad:SourceCandidatesFailure={code:"cancelled",origin:"source",message:"B",data:{}};',
  ],
  ["readonly-diagnostic-path", 'failure.dataIssue!.path.push("B");'],
  ["no-selection", "model.select(page.result.items[0]!);"],
  ["no-utf16-adapter", "model.fromSourceDocument({});"],
];
