// B-owned controllable producer, NOT a Core simulator or acceptance oracle.
import { createInterface } from "node:readline";
const mode = process.argv[2] ?? "normal";
const snapshot = {protocol:2,schemaVersion:7,snapshotId:"B-node-snapshot",
  inputHash:"0123456789abcdef".repeat(4),inputHashComplete:true,
  frontend:{name:"B-producer",version:"0"},bodySharing:"fast",tops:[],
  definitionCount:0,bodyCount:0,indexState:"ready",openedAt:"2000-02-29T00:00:00.000Z",topCandidates:[]};
const hello = {event:"hello",protocol:2,snapshot,capabilities:["cancel","progress"],
  B_argv:process.argv.slice(3),B_cwd:process.cwd(),B_env:process.env.B_M4_TEST_ENV ?? null};
process.stdout.write(JSON.stringify(hello)+"\n");
const input = createInterface({input:process.stdin,crlfDelay:Infinity});
let chain = Promise.resolve();
const write = bytes => new Promise((resolve,reject) => process.stdout.write(bytes,error=>error?reject(error):resolve()));
input.on("line", line => { chain=chain.then(async () => {
  const request=JSON.parse(line), action=request.params.action;
  const reply={id:request.id,ok:true,result:{items:[],B_echo:request.params},completeness:{status:"complete",reasons:[]}};
  if(action==="fragments") {
    const frame=Buffer.from(JSON.stringify(reply)+"\r\n");
    for(const byte of frame) await write(Buffer.from([byte]));
    await write(JSON.stringify({...reply,id:request.id+1})+"\n"+JSON.stringify({...reply,id:request.id+2})+"\n");
  } else if(action==="bad-json") await write("{]\n");
  else if(action==="bad-utf8") await write(Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d,0x0a]));
  else if(action==="eof-fragment") { await write('{"event":'); process.stdout.end(); input.close(); process.stdin.destroy(); }
  else if(action==="stderr-exit") {
    await new Promise(resolve=>process.stderr.write("x".repeat(131072)+"B_STDERR_TAIL",resolve));
    process.exitCode=7; input.close(); process.stdin.destroy(); process.stdout.end();
  } else await write(JSON.stringify(reply)+"\n");
}); });
input.on("close", () => {
  chain.then(() => { if(mode==="ignore-eof") setInterval(()=>{},1000); });
});
