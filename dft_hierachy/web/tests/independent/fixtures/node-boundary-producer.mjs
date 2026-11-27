// B-owned raw process producer only, not a Core model/query implementation.
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
const snapshot={protocol:2,schemaVersion:7,snapshotId:"B-boundary",
 inputHash:"0123456789abcdef".repeat(4),inputHashComplete:true,frontend:{name:"B",version:"0"},
 bodySharing:"fast",tops:[],definitionCount:0,bodyCount:0,indexState:"ready",
 openedAt:"2000-02-29T00:00:00.000Z",topCandidates:[]};
process.stdout.on("error",()=>{}); // Adapter fault/close may end the owned pipe.
process.stdout.write(JSON.stringify({event:"hello",protocol:2,snapshot,capabilities:["cancel","progress"]})+"\n");
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on("line",line=>{
 const request=JSON.parse(line),action=request.params.action;
 if(action==="duplicate-id")
   process.stdout.write('{"id":1,"\\u0069d":1,"ok":true,"result":[],"completeness":{"status":"complete","reasons":[]}}\n');
 else if(action==="duplicate-unicode")
   process.stdout.write('{"id":1,"ok":true,"result":[],"completeness":{"status":"complete","reasons":[]},"extra":{"位":0,"\\u4f4d":1}}\n');
 else {
   const text=action==="large"?"é".repeat(2*1024*1024+17):"B echo";
   process.stdout.write(JSON.stringify({id:request.id,ok:true,result:{text,
    contentHash:createHash("sha256").update(text).digest("hex"),matchesSnapshot:true},
    completeness:{status:"complete",reasons:[]}})+"\n");
 }
});
input.on("close",()=>process.stdout.end());
