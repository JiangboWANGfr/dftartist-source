// B independent M4 candidates, DESIGN5.6. FakeTransport never answers itself.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as clientModule from "@hier/client";
const complete = { status: "complete", reasons: [] };
const partial = { status: "partial", reasons: [{ code: "indexing" }] };
const inst = (ref, name) => ({ ref, name, path: [name], pathText: name, kind: "module",
  def: "d:0", defName: "B_fixture", childCount: 3, hasParamOverrides: false });
const snapshot = { protocol: 2, schemaVersion: 7, snapshotId: "B-client-snapshot",
  inputHash: "0123456789abcdef".repeat(4), inputHashComplete: true,
  frontend: { name: "slang", version: "12.0.0" }, bodySharing: "fast",
  tops: [inst("i:0", "root_a"), inst("i:1", "root_b")], definitionCount: 1, bodyCount: 1,
  indexState: "building", openedAt: "2000-02-29T23:59:59.123Z", topCandidates: ["i:0", "i:1"] };
const port = (name = "B_pin") => ({ ref: "p:0:0", name, direction: "in", kind: "port",
  internal: { kind: "direct", signal: "s:0:0", bits: { lsb: 0, width: 1 } },
  type: "logic", width: 1, signed: false, dims: [], members: [] });
const watch = promise => { promise.catch(() => {}); return promise; };
const options = { timeout: 3000 }; // Harness bound, not product SLA.
const errorIs = (code, origin) => error => {
  assert.equal(typeof clientModule.HierError, "function");
  assert.ok(error instanceof clientModule.HierError);
  assert.equal(error.code, code); assert.equal(error.origin, origin);
  assert.ok(error.message.length > 0); assert.equal(typeof error.data, "object");
  return true;
};
class FakeTransport {
  sent = []; closed = false; messages = new Set(); closes = new Set();
  waits = []; pending = []; ownerTaken = false; scheduled = false;
  cause; registrationOrder = [];
  subscribe(set, handler) {
    const token = { handler, live: true, notified: false }; set.add(token);
    return [token, () => { token.live = false; set.delete(token); }];
  }
  onMessage(handler) {
    if (this.ownerTaken) throw Object.assign(new Error("second receiver"), {code:"bad_request",origin:"client",data:{}});
    this.ownerTaken = true; this.registrationOrder.push("message");
    const [,unsub] = this.subscribe(this.messages,handler); this.flush(); return unsub;
  }
  onClose(handler) {
    this.registrationOrder.push("close"); const [token,unsub] = this.subscribe(this.closes,handler);
    if (this.closed) this.notify(token); return unsub;
  }
  notify(token) {
    queueMicrotask(() => { if(token.live && !token.notified) {
      token.notified = true; token.handler(this.cause);
    }});
  }
  send(value) {
    if(this.closed) throw Object.assign(new Error("closed"),{code:"transport_closed",origin:"transport",data:{}});
    if(!this.ownerTaken) throw Object.assign(new Error("unbound"),{code:"not_ready",origin:"client",data:{}});
    this.sent.push(structuredClone(value)); for(const done of this.waits.splice(0)) done();
  }
  close() { this.fail(); }
  fail(cause) {
    if(this.closed) return; this.closed=true; this.cause=cause; this.pending=[];
    for(const token of this.closes) this.notify(token);
  }
  flush() {
    if(this.scheduled || this.closed || !this.ownerTaken) return;
    this.scheduled=true;
    queueMicrotask(() => {
      this.scheduled=false;
      while(!this.closed && this.pending.length) {
        const token=[...this.messages][0];
        if(!token?.live) { this.pending=[]; break; }
        token.handler(this.pending.shift());
      }
    });
  }
  receive(value) { if(!this.closed) { this.pending.push(structuredClone(value)); this.flush(); } }
  reply(id,result,completeness=complete) { this.receive({id,ok:true,result,completeness}); }
  async sentCount(count) {
    while(this.sent.length<count) await new Promise(done=>this.waits.push(done));
    assert.equal(this.sent.length,count);
  }
}
function construct(t, opts, supplied) {
  assert.equal(typeof clientModule.HierClient, "function", "M4 must export HierClient");
  const transport = supplied ?? new FakeTransport(), client = new clientModule.HierClient(transport, opts);
  t.after(() => client.dispose()); watch(client.ready); return { client, transport };
}
async function setup(t, opts, snap = snapshot) {
  const value = construct(t, opts);
  value.transport.receive({ event: "hello", protocol: 2, snapshot: snap, capabilities: ["cancel", "progress"] });
  assert.deepEqual(await value.client.ready, snap); return value;
}
// Original eight goals retained. C62 partial stimulus moves to a lawful QueryResult.
test("M4: children sends typed params/current snapshot and preserves completeness", options, async t => {
  const {client, transport} = await setup(t);
  const p = watch(client.children("i:0", {limit: 2})); await transport.sentCount(1);
  const r = transport.sent[0]; assert.equal(r.method, "inst.children");
  assert.equal(r.snapshot, snapshot.snapshotId); assert.equal(r.params.inst, "i:0"); assert.equal(r.params.limit, 2);
  const result = {items: [inst("i:0.0", "a"), inst("i:0.1", "b")], next: "B-cursor"};
  transport.reply(r.id, result); assert.deepEqual(await p, {result, completeness: complete});
});
test("M4: QueryResult preserves partial reasons and empty items", options, async t => {
  const {client, transport} = await setup(t); const p = watch(client.instancesOf("d:0"));
  await transport.sentCount(1); assert.equal(transport.sent[0].method, "def.instances");
  transport.reply(transport.sent[0].id, {items: []}, partial);
  assert.deepEqual(await p, {result: {items: []}, completeness: partial});
});
test("M4: equal concurrent requests share one wire request", options, async t => {
  const {client, transport} = await setup(t);
  const a = watch(client.children("i:0", {limit: 2})), b = watch(client.children("i:0", {limit: 2}));
  await transport.sentCount(1); transport.reply(transport.sent[0].id, {items: []});
  const replies = await Promise.all([a,b]); assert.deepEqual(replies[0], replies[1]); assert.equal(transport.sent.length, 1);
});
test("M4: distinct requests resolve to their own out-of-order replies", options, async t => {
  const {client, transport} = await setup(t); const a = watch(client.children("i:0")), b = watch(client.children("i:1"));
  await transport.sentCount(2); const [ra,rb] = transport.sent; assert.notEqual(ra.id, rb.id);
  transport.reply(rb.id, {items: [inst("i:1.0", "b")]}); transport.reply(ra.id, {items: [inst("i:0.0", "a")]});
  assert.equal((await a).result.items[0].name, "a"); assert.equal((await b).result.items[0].name, "b");
});
test("M4: partial results must not be cached", options, async t => {
  const {client, transport} = await setup(t); const a = watch(client.instancesOf("d:0"));
  await transport.sentCount(1); transport.reply(transport.sent[0].id, {items: []}, partial); await a;
  const b = watch(client.instancesOf("d:0")); await transport.sentCount(2);
  transport.reply(transport.sent[1].id, {items: []}); await b;
});
test("M4: abort rejects without waiting for Core; late reply cannot resolve another request", options, async t => {
  const {client, transport} = await setup(t); const c = new AbortController();
  const p = watch(client.children("i:0", undefined, c.signal));
  const rejected = assert.rejects(p, errorIs("cancelled","client")); await transport.sentCount(1);
  const old = transport.sent[0]; c.abort(); await rejected; await transport.sentCount(2);
  assert.deepEqual(transport.sent[1], {method: "cancel", params: {target: old.id}});
  const next = watch(client.children("i:1")); await transport.sentCount(3);
  transport.reply(old.id, {items: [inst("i:0.0","stale")]});
  transport.reply(transport.sent[2].id, {items: [inst("i:1.0","current")]});
  assert.equal((await next).result.items[0].name, "current");
});
test("M4: Core errors reject and do not prevent subsequent success", options, async t => {
  const {client, transport} = await setup(t); const p = watch(client.children("i:999"));
  const rejected = assert.rejects(p, error => {
    errorIs("not_found","core")(error); assert.equal(error.message,"B absent");
    assert.deepEqual(error.data,{ref:"i:999"}); return true;
  }); await transport.sentCount(1);
  transport.receive({id: transport.sent[0].id, ok: false, error: {code: "not_found", message: "B absent", data: {ref: "i:999"}}});
  await rejected; const next = watch(client.children("i:0")); await transport.sentCount(2);
  transport.reply(transport.sent[1].id, {items: []}); assert.deepEqual(await next, {result: {items: []}, completeness: complete});
});
test("M4: index-ready subscription can be released", options, async t => {
  const {client, transport} = await setup(t); let calls = 0;
  let notify; const seen = new Promise(done => notify = done);
  const unsub = client.onIndexReady(() => { calls++; notify(); }); transport.receive({event:"index", state:"ready"});
  await seen; assert.equal(calls,1); unsub(); unsub(); transport.receive({event:"index", state:"ready"});
  await new Promise(queueMicrotask); assert.equal(calls,1);
});
test("M4: dispose releases transport", options, async t => {
  const {client, transport} = await setup(t); client.dispose(); client.dispose();
  assert.equal(transport.closed,true); assert.equal(transport.messages.size,0); assert.equal(transport.closes.size,0);
});
test("M4: before hello queries reject not_ready without wire work", options, async t => {
  const {client, transport} = construct(t); assert.throws(() => client.snapshot, errorIs("not_ready","client"));
  await assert.rejects(client.children("i:0"), errorIs("not_ready","client")); assert.equal(transport.sent.length,0);
});
for (const version of [1,6,8]) test("M4: rejects unsupported schema "+version, options, async t => {
  const {client, transport} = construct(t); const bad = assert.rejects(client.ready, errorIs("schema_mismatch","client"));
  transport.receive({event:"hello", protocol:2, snapshot:{...snapshot,schemaVersion:version}, capabilities:["cancel","progress"]});
  await bad; assert.equal(transport.closed,true); assert.equal(transport.sent.length,0);
});
test("M4: transport closes before hello and rejects ready", options, async t => {
  const {client, transport} = construct(t); const bad = assert.rejects(client.ready, errorIs("transport_closed","transport"));
  transport.close(); await bad;
});
test("M4: EOF fails all pending and releases subscriptions", options, async t => {
  const {client, transport} = await setup(t);
  const a = assert.rejects(watch(client.children("i:0")), errorIs("transport_closed","transport"));
  const b = assert.rejects(watch(client.children("i:1")), errorIs("transport_closed","transport"));
  await transport.sentCount(2); transport.close(); await Promise.all([a,b]);
  client.dispose(); // Explicit dispose owns subscription release; do not guess EOF internals.
  assert.equal(transport.messages.size,0); assert.equal(transport.closes.size,0);
});
test("M4: duplicate hello closes pending with protocol_error", options, async t => {
  const {client, transport} = await setup(t);
  const p = assert.rejects(watch(client.children("i:0")), errorIs("protocol_error","client")); await transport.sentCount(1);
  transport.receive({event:"hello", protocol:2, snapshot, capabilities:["cancel","progress"]}); await p; assert.equal(transport.closed,true);
});
test("M4: children partial is a protocol fault", options, async t => {
  const {client, transport} = await setup(t);
  const p = assert.rejects(watch(client.children("i:0")), errorIs("protocol_error","client")); await transport.sentCount(1);
  transport.reply(transport.sent[0].id, {items:[]}, partial); await p; assert.equal(transport.closed,true);
});
test("M4: one merged subscriber aborts without cancelling its peer", options, async t => {
  const {client, transport} = await setup(t); const c = new AbortController();
  const a = watch(client.children("i:0",undefined,c.signal)), b = watch(client.children("i:0"));
  const bad = assert.rejects(a,errorIs("cancelled","client")); await transport.sentCount(1); c.abort(); await bad;
  assert.equal(transport.sent.length,1); transport.reply(transport.sent[0].id,{items:[]}); await b;
});
test("M4: pre-aborted subscriber sends nothing", options, async t => {
  const {client, transport} = await setup(t); const c = new AbortController(); c.abort();
  await assert.rejects(client.children("i:0",undefined,c.signal),errorIs("cancelled","client")); assert.equal(transport.sent.length,0);
});
test("M4: normalized explicit defaults merge while pending", options, async t => {
  const {client, transport} = await setup(t); const a=watch(client.children("i:0")), b=watch(client.children("i:0",{cursor:"",limit:200}));
  await transport.sentCount(1); transport.reply(transport.sent[0].id,{items:[]}); await Promise.all([a,b]); assert.equal(transport.sent.length,1);
});
for (const [fn,result] of [["ports",[port()]],["params",[{name:"N",value:"1",type:"int",isType:false,isLocal:false,isPort:true,isOverridden:false}]],["bindings",{inst:"i:0",bindings:[]}]])
test("M4: complete "+fn+" is cached", options, async t => {
  const {client, transport} = await setup(t); const p=watch(client[fn]("i:0"));
  await transport.sentCount(1); transport.reply(transport.sent[0].id,result); await p;
  assert.deepEqual(await client[fn]("i:0"),{result,completeness:complete}); assert.equal(transport.sent.length,1);
});
test("M4: entry LRU refreshes access before eviction", options, async t => {
  const {client,transport}=await setup(t,{cacheEntries:2});
  async function fetch(ref) { const count=transport.sent.length+1,p=watch(client.ports(ref));
    await transport.sentCount(count); transport.reply(transport.sent.at(-1).id,[port()]); await p; }
  await fetch("i:0"); await fetch("i:1"); await client.ports("i:0"); assert.equal(transport.sent.length,2);
  await fetch("i:2"); await client.ports("i:0"); assert.equal(transport.sent.length,3); await fetch("i:1");
});
test("M4: UTF8 reply bytes alone exceed cache budget", options, async t => {
  const {client,transport}=await setup(t,{cacheBytes:2048}); const result=[port("界".repeat(1000))];
  for(let n=1;n<=2;n++){const p=watch(client.ports("i:0")); await transport.sentCount(n); transport.reply(transport.sent.at(-1).id,result); await p;}
});
test("M4: merged and cached replies isolate consumers", options, async t => {
  const {client,transport}=await setup(t); const a=watch(client.ports("i:0")),b=watch(client.ports("i:0"));
  await transport.sentCount(1); transport.reply(transport.sent[0].id,[port()]); const [one,two]=await Promise.all([a,b]);
  try{one.result[0].name="B-mutated";}catch{/* deep freeze permitted */}
  assert.equal(two.result[0].name,"B_pin"); assert.equal((await client.ports("i:0")).result[0].name,"B_pin");
});
test("M4: old queued receiver cannot pollute new connection", options, async t => {
  const old=await setup(t),receive=[...old.transport.messages][0].handler; old.client.dispose();
  const current=await setup(t,undefined,{...snapshot,snapshotId:"B-next-snapshot"});
  const p=watch(current.client.children("i:0")); await current.transport.sentCount(1);
  receive({id:current.transport.sent[0].id,ok:true,result:{items:[inst("i:0.0","old")]},completeness:complete});
  current.transport.reply(current.transport.sent[0].id,{items:[inst("i:0.0","new")]});
  assert.equal((await p).result.items[0].name,"new");
});

const hello = {event:"hello",protocol:2,snapshot,capabilities:["cancel","progress"]};
test("M4 B14: prebind hello is not lost and binding callbacks are asynchronous", options, async t => {
  const transport=new FakeTransport(); transport.receive(hello);
  const {client}=construct(t,undefined,transport);
  assert.deepEqual(transport.registrationOrder.slice(0,2),["close","message"]);
  assert.deepEqual(await client.ready,snapshot);
});
test("M4 B14: leading nonhello is not silently replaced by buffered hello", options, async t => {
  const transport=new FakeTransport(); transport.receive({event:"progress",target:1,done:0,total:1}); transport.receive(hello);
  const {client}=construct(t,undefined,transport);
  await assert.rejects(client.ready,errorIs("protocol_error","client")); assert.equal(transport.closed,true);
});
test("M4 B14: already closed transport rejects a late client's ready", options, async t => {
  const transport=new FakeTransport(); transport.close(); const {client}=construct(t,undefined,transport);
  await assert.rejects(client.ready,errorIs("transport_closed","transport")); assert.equal(transport.sent.length,0);
});
test("M4 B14: buffered hello loses to close before binding", options, async t => {
  const transport=new FakeTransport(); transport.receive(hello); transport.close();
  const {client}=construct(t,undefined,transport);
  await assert.rejects(client.ready,errorIs("transport_closed","transport")); assert.equal(transport.sent.length,0);
});
test("M4 B14: close before queued hello delivery wins", options, async t => {
  const transport=new FakeTransport(); transport.receive(hello);
  const {client}=construct(t,undefined,transport); transport.close();
  await assert.rejects(client.ready,errorIs("transport_closed","transport"));
});
test("M4 B14: dispose before queued hello delivery wins", options, async t => {
  const transport=new FakeTransport(); transport.receive(hello);
  const {client}=construct(t,undefined,transport); client.dispose();
  await assert.rejects(client.ready,errorIs("disposed","client"));
  assert.equal(transport.messages.size,0); assert.equal(transport.closes.size,0);
});
test("M4 B14: settled ready is not revoked by subsequent EOF", options, async t => {
  const {client,transport}=await setup(t); transport.close();
  assert.deepEqual(await client.ready,snapshot); client.dispose();
});
test("M4 B14: queued hello cleared before binding also leaves snapshot inaccessible", options, async t => {
  const transport=new FakeTransport(); transport.receive(hello); transport.close();
  const {client}=construct(t,undefined,transport);
  await assert.rejects(client.ready,errorIs("transport_closed","transport"));
  assert.throws(()=>client.snapshot); assert.equal(transport.sent.length,0);
});

for(const opts of [{cacheEntries:0},{cacheBytes:0}]) test("M4: either zero cache option disables caching "+JSON.stringify(opts), options, async t=>{
  const {client,transport}=await setup(t,opts);
  for(let n=1;n<=2;n++){const p=watch(client.ports("i:0")); await transport.sentCount(n); transport.reply(transport.sent.at(-1).id,[port()]); await p;}
});
test("M4: invalid cache options reject construction without retaining subscriptions", options,t=>{
  assert.equal(typeof clientModule.HierClient,"function","M4 must export HierClient");
  for(const opts of [{cacheEntries:-1},{cacheBytes:0.5},{cacheBytes:NaN},{cacheEntries:9007199254740992}]){
    const transport=new FakeTransport();
    assert.throws(()=>new clientModule.HierClient(transport,opts),errorIs("bad_request","client"));
    assert.equal(transport.messages.size,0); assert.equal(transport.closes.size,0); transport.close();
  }
});
test("M4: last merged abort cancels once and same parameters obtain a fresh id", options,async t=>{
  const {client,transport}=await setup(t),ca=new AbortController(),cb=new AbortController();
  const a=watch(client.ports("i:0",ca.signal)),b=watch(client.ports("i:0",cb.signal));
  const ra=assert.rejects(a,errorIs("cancelled","client")),rb=assert.rejects(b,errorIs("cancelled","client"));
  await transport.sentCount(1); const old=transport.sent[0].id;
  ca.abort(); await ra; assert.equal(transport.sent.length,1);
  cb.abort(); await rb; await transport.sentCount(2);
  assert.deepEqual(transport.sent[1],{method:"cancel",params:{target:old}});
  const fresh=watch(client.ports("i:0")); await transport.sentCount(3);
  assert.notEqual(transport.sent[2].id,old);
  transport.reply(old,[port("stale")]); transport.reply(transport.sent[2].id,[port("fresh")]);
  assert.equal((await fresh).result[0].name,"fresh");
  assert.equal((await client.ports("i:0")).result[0].name,"fresh"); assert.equal(transport.sent.length,3);
});
// Harness controls are NOT product/client/Node-transport acceptance evidence.
test("B harness: first receiver runs after registration returns",async()=>{
  const transport=new FakeTransport(); transport.receive(hello); let calls=0;
  const unsub=transport.onMessage(()=>calls++); assert.equal(calls,0);
  await new Promise(queueMicrotask); assert.equal(calls,1); unsub(); transport.close();
});
test("B harness: close registrations are independent and cancellable",async()=>{
  const transport=new FakeTransport(); let calls=0; const handler=()=>calls++;
  const a=transport.onClose(handler); transport.onClose(handler); a(); transport.close();
  const c=transport.onClose(handler); const cancelled=transport.onClose(handler); cancelled();
  assert.equal(calls,0); await new Promise(queueMicrotask); assert.equal(calls,2); c();
});
