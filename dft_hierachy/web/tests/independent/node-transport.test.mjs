// Independent Node transport candidates from DESIGN5.6.5; producer != real Core.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import * as main from "@hier/client";
const fixture=fileURLToPath(new URL("./fixtures/node-producer.mjs",import.meta.url));
const cwd=fileURLToPath(new URL("./fixtures/",import.meta.url));
const bound={timeout:5000}; // Harness bound only, not a production latency SLA.
const watch=p=>{p.catch(()=>{});return p;};
const tick=()=>new Promise(queueMicrotask);
const errorIs=code=>e=>{
  assert.equal(typeof main.HierError,"function"); assert.ok(e instanceof main.HierError);
  assert.equal(e.code,code); assert.equal(e.origin,"transport");
  assert.ok(e.message.length>0); assert.equal(typeof e.data,"object"); return true;
};
function receiver() {
  const buffered=[],pending=[],all=[];
  return {
    all,
    handler:value=>{all.push(value);const waiter=pending.shift(); if(waiter) waiter(value); else buffered.push(value);},
    next:()=>buffered.length?Promise.resolve(buffered.shift()):new Promise(done=>pending.push(done))
  };
}
async function factory() {
  let module;
  try { module=await import("@hier/client/node"); }
  catch(e) { assert.fail("M4 must expose @hier/client/node: "+e.code); }
  assert.equal(typeof module.createProcessTransport,"function","public Node transport factory required");
  return module.createProcessTransport;
}
async function product(t,overrides={}) {
  const create=await factory();
  const transport=create({command:process.execPath,args:[fixture,"normal"],shutdownGraceMillis:0,...overrides});
  assert.equal(typeof transport.onClose,"function"); assert.equal(typeof transport.onMessage,"function");
  assert.equal(typeof transport.send,"function"); assert.equal(typeof transport.close,"function");
  assert.ok(transport.exited instanceof Promise); watch(transport.exited);
  t.after(async()=>{transport.close();await transport.exited.catch(()=>{});});
  return transport;
}
function bind(t,transport) {
  const received=receiver(); const off=transport.onMessage(received.handler);
  assert.equal(typeof off,"function"); t.after(()=>{off();off();}); return received;
}
const request=(id,action,more={})=>({id,method:"B_fixture_control",snapshot:"B-node-snapshot",params:{action,...more}});
test("M4 Node: command args stay literal and cwd/env are passed",bound,async t=>{
  const literal=["space value","; echo unsafe","$(touch B_NEVER_CREATE)","中文"];
  const transport=await product(t,{args:[fixture,"normal",...literal],cwd,env:{...process.env,B_M4_TEST_ENV:"B explicit"}});
  const received=bind(t,transport), hello=await received.next();
  assert.deepEqual(hello.B_argv,literal); assert.equal(hello.B_cwd,resolve(cwd)); assert.equal(hello.B_env,"B explicit");
  assert.equal(hello.event,"hello"); assert.equal(hello.snapshot.schemaVersion,7);
});
test("M4 Node: omitted cwd/env inherit the caller",bound,async t=>{
  const transport=await product(t), received=bind(t,transport),hello=await received.next();
  assert.equal(hello.B_cwd,process.cwd()); assert.equal(hello.B_env,process.env.B_M4_TEST_ENV ?? null);
});
test("M4 Node: bytewise UTF8/CRLF writes and coalesced frames preserve content/order",bound,async t=>{
  const transport=await product(t),received=bind(t,transport); await received.next();
  const params={text:"位𝒟é",array:[1,"x"]};transport.send(request(1,"fragments",params));
  const frames=[await received.next(),await received.next(),await received.next()];
  assert.deepEqual(frames.map(x=>x.id),[1,2,3]);
  for(const frame of frames) assert.deepEqual(frame.result.B_echo,{action:"fragments",...params});
  // OS may coalesce writes; this is integration coverage, not every internal read split.
});
for(const action of ["bad-json","bad-utf8","eof-fragment"])
  test("M4 Node: decoder fault closes and reaps "+action,bound,async t=>{
    const transport=await product(t),received=bind(t,transport);await received.next();
    const closed=new Promise(done=>transport.onClose(done));transport.send(request(1,action));
    errorIs("transport_closed")(await closed);await transport.exited;
    assert.throws(()=>transport.send(request(2,"echo")),errorIs("transport_closed"));
});
test("M4 Node: normal close is idempotent and survives external unsubscribe",bound,async t=>{
  const transport=await product(t,{shutdownGraceMillis:2000}),received=bind(t,transport);await received.next();
  let calls=0;let done;const notified=new Promise(resolve=>done=resolve);
  const off=transport.onClose(()=>{calls++;done();});const removed=transport.onClose(()=>assert.fail("cancelled close callback"));
  removed();removed();transport.close();transport.close();await notified;off();off();
  const exited=await transport.exited;assert.equal(exited.code,0);assert.equal(exited.signal,null);assert.equal(calls,1);
  await tick();assert.equal(calls,1);
});
test("M4 Node: unique message receiver cannot be reacquired after unsubscribe",bound,async t=>{
  const transport=await product(t),received=receiver(),off=transport.onMessage(received.handler);
  await received.next();off();off();
  assert.throws(()=>transport.onMessage(()=>{}),e=>{
    assert.equal(e.code,"bad_request");assert.equal(e.origin,"client");return true;
  });
  const closed=new Promise(done=>transport.onClose(done));transport.close();await closed;await transport.exited;
});
test("M4 Node: failed spawn stays rejected and late close registrations notify asynchronously",bound,async t=>{
  const transport=await product(t,{command:"/B_M4_NONEXISTENT_EXECUTABLE/no",args:[]});
  await assert.rejects(transport.exited,errorIs("transport_closed"));
  let calls=0,returned=false,resolve;
  const observed=new Promise(done=>resolve=done);
  const off=transport.onClose(e=>{assert.equal(returned,true);calls++;errorIs("transport_closed")(e);resolve();});
  returned=true;await observed;off();off();transport.close();await tick();assert.equal(calls,1);
  assert.throws(()=>transport.send({}),errorIs("transport_closed"));
});
test("M4 Node: stderr is not stdout protocol content and nonzero exit is preserved",bound,async t=>{
  const transport=await product(t),received=bind(t,transport);await received.next();
  const closed=new Promise(done=>transport.onClose(done));transport.send(request(1,"stderr-exit"));
  const cause=await closed;errorIs("transport_closed")(cause);const exited=await transport.exited;assert.equal(exited.code,7);
  assert.equal(received.all.length,1);assert.equal(received.all[0].event,"hello");
  // Exact stderr tail at the first close needs a controlled pipe reader: separate
  // stdout/stderr callbacks have no cross-pipe arrival order. Do not race a sleep.
});
test("M4 Node: zero grace force-reaps an owned producer ignoring EOF",bound,async t=>{
  const transport=await product(t,{args:[fixture,"ignore-eof"],shutdownGraceMillis:0}),received=bind(t,transport);
  await received.next();transport.close();const exited=await transport.exited;assert.equal(exited.signal,"SIGKILL");
});
test("M4 E2E candidate: real HierClient to Node to own pre-M4 Core",bound,async t=>{
  const create=await factory();assert.equal(typeof main.HierClient,"function","M4 must export HierClient");
  const core=process.env.HIER_BIN;assert.ok(core,"HIER_BIN must name B's own fixed Core");
  const design=fileURLToPath(new URL("../../../core/tests/fixtures/nav/nav.sv",import.meta.url));
  const transport=create({command:core,args:["serve",design],shutdownGraceMillis:0});watch(transport.exited);
  const client=new main.HierClient(transport);watch(client.ready);
  t.after(async()=>{client.dispose();await transport.exited.catch(()=>{});});
  const snapshot=await client.ready;assert.equal(snapshot.schemaVersion,7);
  const reply=await client.roots();assert.deepEqual(reply.completeness,{status:"complete",reasons:[]});
  assert.deepEqual(reply.result.map(x=>x.ref),snapshot.tops.map(x=>x.ref));
  client.dispose();await transport.exited;
});
// Sanity for B's producer only: never count this as Node adapter/Core validation.
test("B producer control: native cwd normalizes trailing separators but distinguishes directories",bound,()=>{
  const nativeCwd=directory=>{
    const child=spawnSync(process.execPath,["-p","process.cwd()"],{
      cwd:directory,encoding:"utf8",shell:false,timeout:5000
    });
    assert.ifError(child.error);assert.equal(child.status,0,child.stderr);
    return child.stdout.trimEnd();
  };
  assert.equal(nativeCwd(cwd),resolve(cwd));
  assert.equal(nativeCwd(resolve(cwd)),resolve(cwd));
  assert.notEqual(nativeCwd(resolve(cwd,"..")),resolve(cwd));
});
test("B producer control: explicit request echoes Unicode and exits on EOF",bound,async t=>{
  const child=spawn(process.execPath,[fixture,"normal"],{shell:false,stdio:["pipe","pipe","pipe"]});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null) child.kill("SIGKILL");});
  const exit=new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>resolve({code,signal}));});
  let stderr="";child.stderr.on("data",chunk=>stderr+=chunk);
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity})[Symbol.asyncIterator]();
  const hello=JSON.parse((await lines.next()).value);assert.equal(hello.event,"hello");
  child.stdin.write(JSON.stringify(request(1,"echo",{text:"位𝒟é"}))+"\n");
  const reply=JSON.parse((await lines.next()).value);assert.equal(reply.result.B_echo.text,"位𝒟é");
  child.stdin.end();assert.deepEqual(await exit,{code:0,signal:null});assert.equal(stderr,"");
});
