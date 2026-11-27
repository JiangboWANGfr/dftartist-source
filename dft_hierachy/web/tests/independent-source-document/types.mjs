export const positive = `
import { SourceDocumentModel, SourceDocumentError,
 type SourceDocument, type SourceDocumentTarget, type SourceDocumentState,
 type SourceDocumentFailure, type SourceDocumentLocation, type SourceTextPosition,
 type SourceTextRange, type SourceDocumentErrorCode } from "@hier/viewmodel";
import type { HierClient, HierError, Reply, Unsubscribe } from "@hier/client";
import type { ResultOf, ObjectRef, DefRef, SnapshotId } from "@hier/protocol-types";
declare const client:HierClient;
declare const document:SourceDocument;
declare const failure:SourceDocumentFailure;
declare const object:ObjectRef;
declare const definition:DefRef;
const model=new SourceDocumentModel(client);
const snapshot:SnapshotId=model.snapshotId;
const disposed:boolean=model.disposed;
const off:Unsubscribe=model.subscribe(()=>{});
const loading:Promise<void>=model.load(object,"definition");
model.load(definition,"statement");model.load(object,"instantiation");
model.reload();model.cancel();model.clear();off();model.dispose();
const target:SourceDocumentTarget={ref:definition,kind:"definition"};
const position:SourceTextPosition={offset:0,line:1,column:1};
const range:SourceTextRange={start:position,end:position};
const exact:SourceDocumentLocation={status:"exact",range};
const changed:SourceDocumentLocation={status:"changed"};
const source:Reply<ResultOf<"obj.source">>=document.source;
const content:Reply<ResultOf<"source.read">>=document.content;
const data:SourceDocument={source,content,location:changed};
const ownError=new SourceDocumentError("inconsistent_reply","B");
const code:SourceDocumentErrorCode=ownError.code;
const states:readonly SourceDocumentState[]=[
 {status:"idle",target:null},{status:"pending",target},
 {status:"success",target,data},{status:"failed",target,error:failure},
 {status:"cancelled",target,error:failure},
];
function consume(state:SourceDocumentState):string {
 switch(state.status){
 case "idle": return "";
 case "pending": return state.target.ref;
 case "success": {
  const location=state.data.location;
  return location.status==="exact"?state.data.content.result.text.slice(location.range.start.offset,location.range.end.offset):"changed";
 }
 case "failed":case "cancelled":return state.error.code+state.error.origin+state.error.message;
 default: const never:never=state;return never;
 }
}
if(failure.dataIssue){ const op:"inspect"|"enumerate"|"read"=failure.dataIssue.operation;const path:readonly string[]=failure.dataIssue.path; }
`;
export const negatives = [
  ["load-number", 'model.load(1,"definition");'],
  ["load-boxed", 'model.load(new String("x"),"definition");'],
  ["load-missing-kind", "model.load(object);"],
  ["load-bad-kind", 'model.load(object,"Definition");'],
  ["load-path-object", 'model.load({path:"x"},"definition");'],
  ["load-extra-arg", 'model.load(object,"definition",{});'],
  ["readonly-state", 'model.state={status:"idle",target:null};'],
  ["readonly-snapshot", 'model.snapshotId="new";'],
  ["readonly-disposed", "model.disposed=true;"],
  ["readonly-target", 'target.ref="other";'],
  ["readonly-kind", 'target.kind="statement";'],
  ["readonly-source", "document.source=source;"],
  ["readonly-content", "document.content=content;"],
  ["readonly-text", 'document.content.result.text="new";'],
  ["readonly-source-pos", "document.source.result.start.offset=10;"],
  ["readonly-range", "range.start=position;"],
  ["readonly-coordinate", "range.start.column=2;"],
  ["exact-needs-range", 'const bad:SourceDocumentLocation={status:"exact"};'],
  [
    "changed-forbids-range",
    'const bad:SourceDocumentLocation={status:"changed",range};',
  ],
  [
    "changed-forbids-undefined",
    'const bad:SourceDocumentLocation={status:"changed",range:undefined};',
  ],
  ["changed-no-coordinate", "changed.range.start.offset;"],
  [
    "pending-forbids-data",
    'const bad:SourceDocumentState={status:"pending",target,data};',
  ],
  [
    "pending-forbids-undefined",
    'const bad:SourceDocumentState={status:"pending",target,data:undefined};',
  ],
  ["idle-null-target", 'const bad:SourceDocumentState={status:"idle",target};'],
  [
    "success-needs-data",
    'const bad:SourceDocumentState={status:"success",target};',
  ],
  [
    "failed-needs-error",
    'const bad:SourceDocumentState={status:"failed",target};',
  ],
  [
    "cancelled-no-data",
    'const bad:SourceDocumentState={status:"cancelled",target,error:failure,data};',
  ],
  [
    "document-needs-content",
    "const bad:SourceDocument={source,location:changed};",
  ],
  [
    "document-original-reply",
    "const bad:SourceDocument={source:source.result,content,location:changed};",
  ],
  ["unknown-model-code", 'new SourceDocumentError("stale_file","B");'],
  ["readonly-error-code", 'ownError.code="disposed";'],
  [
    "failure-origin",
    'const bad:SourceDocumentFailure={code:"cancelled",origin:"properties",message:"B",data:{}};',
  ],
  ["readonly-issue-path", 'failure.dataIssue!.path.push("x");'],
  ["no-filesystem-entry", 'model.readSource("/tmp/B.sv");'],
];
