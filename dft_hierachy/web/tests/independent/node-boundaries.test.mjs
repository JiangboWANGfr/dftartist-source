// B public-only Node boundary oracles, DESIGN5.6.2/5.6.5/5.6.7.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HierError } from "@hier/client";
const fixture=fileURLToPath(new URL("./fixtures/node-boundary-producer.mjs",import.meta.url));
const bounds={timeout:5000}; // Harness bound, never a product SLA or race chooser.
const watch=p=>{p.catch(()=>{});return p;};
const request=action=>({id:1,method:"B_fixture_control",snapshot:"B-boundary",params:{action}});
function receiver(){const pending=[],buffered=[];return{handler:value=>{
 const done=pending.shift();if(done)done(value);else buffered.push(value);},
 next:()=>buffered.length?Promise.resolve(buffered.shift()):new Promise(done=>pending.push(done))};}
const errorIs=(code,origin)=>error=>{assert.ok(error instanceof HierError);assert.equal(error.code,code);
 assert.equal(error.origin,origin);assert.ok(error.message.length>0);return true;};
async function setup(t,bind=true){
 const {createProcessTransport}=await import("@hier/client/node");
 const transport=createProcessTransport({command:process.execPath,args:[fixture],shutdownGraceMillis:0});
 watch(transport.exited);t.after(async()=>{transport.close();await transport.exited.catch(()=>{});});
 const received=receiver();
 if(bind){const off=transport.onMessage(received.handler);t.after(()=>{off();off();});assert.equal((await received.next()).event,"hello");}
 return{transport,received};
}
test("B Node boundary: before receiver send rejects and closed state has priority",bounds,async t=>{
 const {transport}=await setup(t,false);
 assert.throws(()=>transport.send(request("echo")),errorIs("not_ready","client"));
 transport.close();assert.throws(()=>transport.send(request("echo")),errorIs("transport_closed","transport"));
 await transport.exited;
});
test("B Node boundary: second active receiver rejection does not poison the first",bounds,async t=>{
 const {transport,received}=await setup(t);
 assert.throws(()=>transport.onMessage(()=>{}),errorIs("bad_request","client"));
 transport.send(request("echo"));
 const value=await received.next();assert.equal(value.id,1);assert.equal(value.result.text,"B echo");
});
test("B Node boundary: same close callback registrations are independent and late delivery cancellable",bounds,async t=>{
 const {transport}=await setup(t);let calls=0,done;
 const twice=new Promise(resolve=>done=resolve),handler=()=>{calls++;if(calls===2)done();};
 const first=transport.onClose(handler),second=transport.onClose(handler);
 transport.close();assert.equal(calls,0);await twice;assert.equal(calls,2);
 first();second();transport.close();await new Promise(queueMicrotask);assert.equal(calls,2);
 let returned=false,lateDone;
 const lateSeen=new Promise(resolve=>lateDone=resolve);
 const off=transport.onClose(()=>{assert.equal(returned,true);calls++;lateDone();});
 returned=true;await lateSeen;assert.equal(calls,3);off();off();
 const cancelled=transport.onClose(()=>assert.fail("cancelled queued late-close callback"));
 cancelled();await new Promise(queueMicrotask);assert.equal(calls,3);await transport.exited;
});
for(const action of ["duplicate-id","duplicate-unicode"])
 test("B Node boundary: decoded escaped duplicate keys close "+action,bounds,async t=>{
  const {transport}=await setup(t);
  const closed=new Promise(done=>transport.onClose(done));transport.send(request(action));
  errorIs("transport_closed","transport")(await closed);await transport.exited;
 });
test("B Node boundary: after first delivery a source-sized result may exceed4MiB",bounds,async t=>{
 const {transport,received}=await setup(t);transport.send(request("large"));
 const value=await received.next();assert.equal(value.id,1);
 assert.equal(Buffer.byteLength(value.result.text),4*1024*1024+34);
 assert.equal(value.result.text,"é".repeat(2*1024*1024+17));
 assert.equal(value.completeness.status,"complete");
});
