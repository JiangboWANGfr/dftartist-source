export const positive = `
import {SourceDocumentModel,SourcePositionError,type SourcePositionErrorCode} from "@hier/viewmodel";
import {SourceDocumentError,SourceCandidatesModel,type SourceDocument,type SourceDocumentErrorCode,type SourceCandidatesQuery,type TreeDiagnosticIssue} from "@hier/viewmodel";
import type {HierClient,Unsubscribe} from "@hier/client";
import type {SnapshotId,FileRef} from "@hier/protocol-types";
declare const client:HierClient;
declare const document:SourceDocument;
const model=new SourceDocumentModel(client);
const point=model.queryAt(document,0);
const explicit:SourceCandidatesQuery & {readonly col:number}=point;
const id:SnapshotId=point.snapshotId;
const file:FileRef=point.file;
const column:number=point.col;
const line:number=point.line;
const candidates=new SourceCandidatesModel(client);
const loading:Promise<void>=candidates.load(point);
const oldCommands:Promise<void>[]=[model.load("B","definition"),model.reload(),model.cancel(),model.clear()];
const off:Unsubscribe=model.subscribe(()=>{});off();model.dispose();
const oldError=new SourceDocumentError("cancelled","B");
const oldCode:SourceDocumentErrorCode=oldError.code;
const oldCodes:readonly SourceDocumentErrorCode[]=["invalid_argument","disposed","cancelled","inconsistent_reply","reentrant_change"];
const error=new SourcePositionError("stale_document","B");
const code:SourcePositionErrorCode=error.code;
const codes:readonly SourcePositionErrorCode[]=["disposed","stale_document","changed_document","invalid_argument"];
const inherited:Error=error;
`;
export const negatives = [
  ["missing-document", "model.queryAt();"],
  ["missing-offset", "model.queryAt(document);"],
  ["null-document", "model.queryAt(null,0);"],
  ["string-document", 'model.queryAt("B",0);'],
  ["offset-string", 'model.queryAt(document,"0");'],
  ["offset-undefined", "model.queryAt(document,undefined);"],
  ["offset-null", "model.queryAt(document,null);"],
  ["offset-boxed", "model.queryAt(document,new Number(0));"],
  ["offset-object", "model.queryAt(document,{offset:0});"],
  ["extra-coordinate", "model.queryAt(document,0,1);"],
  ["point-no-promise", "const bad:Promise<SourceCandidatesQuery>=point;"],
  ["point-no-then", "point.then(()=>{});"],
  ["required-column", "const bad:typeof point=({} as SourceCandidatesQuery);"],
  ["readonly-column", "point.col=1;"],
  ["readonly-line", "point.line=1;"],
  ["readonly-file", 'point.file="B";'],
  ["readonly-snapshot", 'point.snapshotId="B";'],
  ["no-offset-field", "point.offset;"],
  ["no-text-field", "point.text;"],
  ["no-cursor-field", "point.cursor;"],
  ["no-document-field", "point.document;"],
  ["position-code-no-cancelled", 'new SourcePositionError("cancelled","B");'],
  [
    "position-code-no-reentrant",
    'new SourcePositionError("reentrant_change","B");',
  ],
  [
    "position-code-no-inconsistent",
    'new SourcePositionError("inconsistent_reply","B");',
  ],
  [
    "position-code-no-snapshot",
    'new SourcePositionError("snapshot_mismatch","B");',
  ],
  ["position-code-readonly", 'error.code="disposed";'],
  ["old-code-no-stale", 'const bad:SourceDocumentErrorCode="stale_document";'],
  [
    "old-code-no-changed",
    'const bad:SourceDocumentErrorCode="changed_document";',
  ],
  ["old-error-no-stale", 'new SourceDocumentError("stale_document","B");'],
  [
    "position-not-old-error-union",
    "const bad:SourceDocumentErrorCode=error.code;",
  ],
  ["no-document-forged-query", "model.queryAt(point,0);"],
  ["no-line-column-object", "model.queryAt(document,{line:1,col:1});"],
];
