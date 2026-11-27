import React from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import * as V from "@hier/views";
import * as M from "@hier/viewmodel";
const snapshotId="A-exact-selection",complete=Object.freeze({status:"complete",reasons:Object.freeze([])}), reply=result=>Object.freeze({result,completeness:complete,frontier:[],hasConservative:false});
let root,graph,source,layout,selection,connections,expected,workers,subscriptions,calls,failures,oldSelection;
const fail=message=>{throw Error(message);};
const track=model=>{const subscribe=model.subscribe;model.subscribe=function(...args){subscriptions++;const off=subscribe.apply(this,args);let active=true;return()=>{if(active)subscriptions--;active=false;off();};};return model;};
function render(strict=false){const views=<><V.SchematicView graph={graph} layout={layout} selection={selection} ariaLabel="graph" height={400} onCommandError={e=>failures.push(e)}/><V.ObjectConnectionsView connections={connections} selection={selection} ariaLabel="connections" height={200} onCommandError={e=>failures.push(e)}/></>;flushSync(()=>root.render(strict?<React.StrictMode>{views}</React.StrictMode>:views));}
window.x={
 async setup(count=6,shape="mixed",strict=false){
  subscriptions=0;calls=[];failures=[];workers=new Set();const client={snapshot:{snapshotId},object:async ref=>{calls.push("object");return reply({ref,kind:"port",name:ref,pathText:ref,inst:"owner"});},drivers:async()=>{calls.push("drivers");return reply([]);},loads:async()=>{calls.push("loads");return reply([]);}};
  selection=track(new M.SelectionModel({snapshotId,historyLimit:4}));graph=track(new M.GraphSession(client));source=graph.registerSource({origin:"analysis",label:"exact source"});
  expected=Array.from({length:count},(_,i)=>shape==="same-ref"?{ref:"common",bits:{lsb:i,width:i%2},side:i%3===0?"inside":"outside"}:i===0?{ref:"same"}:i===1?{ref:"same",bits:{lsb:0,width:0}}:i===2?{ref:"same",bits:{lsb:0,width:1},side:"inside"}:i===3?{ref:"same",bits:{lsb:0,width:1},side:"outside"}:i===4?{ref:"e\u0301"}:i===5?{ref:"é"}:{ref:`ref/${i}`,bits:{lsb:i,width:1}});
  const nodes=expected.map((target,i)=>({kind:"external",key:`n${i}`,label:`node ${i}`,ports:[],target}));nodes.push({kind:"external",key:"empty",label:"no target",ports:[]});
  const edges=expected.length>=2?[{kind:"external",key:"pair",label:"pair",from:{node:{kind:"external",key:"n0"}},to:{node:{kind:"external",key:"n1"}}}]:[];
  await source.replace({snapshotId,nodes,edges,completeness:complete,frontier:[],hasConservative:false});layout=track(new M.LayoutService(graph,{timeoutMs:15000,workerFactory(){const w=new Worker("/worker.js"),terminate=w.terminate.bind(w);workers.add(w);w.terminate=()=>{workers.delete(w);terminate();};return w;}}));await layout.layout(M.createGraphProjection(graph).layout);
  connections=track(new M.ObjectConnectionsModel(client));await connections.load({slice:{ref:"same",bits:{lsb:0,width:1}},side:"inside",reach:"local"});root=createRoot(document.getElementById("app"));render(strict);return window.x.snapshot();
 },
 targets(){return expected;},
 select(items){flushSync(()=>selection.select({snapshotId,origin:"external",items}));return window.x.snapshot();},
 history(method){flushSync(()=>selection[method]());return window.x.snapshot();},
 rerender(){const n=calls.length;render();if(calls.length!==n)fail("implicit query");return window.x.snapshot();},
 replace(){oldSelection=selection;selection=track(new M.SelectionModel({snapshotId}));render();return window.x.snapshot();},
 async remove(){await source.replace({snapshotId,nodes:[],edges:[],completeness:complete,frontier:[],hasConservative:false});flushSync(()=>{});return window.x.snapshot();},
 snapshot(){return{items:selection.current.items,graph:[...document.querySelectorAll("[data-graph-key]")].map(n=>({label:n.getAttribute("aria-label"),pressed:n.getAttribute("aria-pressed"),disabled:n.getAttribute("aria-disabled")})),targetSelected:document.querySelector('[aria-label="connections"] header').innerText.includes("已选中"),calls:[...calls],failures:failures.length};},
 measure(selectedCount,shape){flushSync(()=>selection.select({snapshotId,origin:"external",items:Array.from({length:selectedCount},(_,i)=>shape==="same-ref"?{ref:"common",bits:{lsb:i+10000,width:1},side:"inside"}:{ref:`other/${i}`})}));const selected=selection.current,old=Array.prototype.some;let predicates=0;Array.prototype.some=function(fn,ctx){return this===selected.items?old.call(this,(...args)=>{predicates++;return fn.apply(ctx,args);}):old.call(this,fn,ctx);};try{render();}finally{Array.prototype.some=old;}const times=[],snapshot=window.x.snapshot;window.x.snapshot=()=>null;try{for(let i=0;i<5;i++){const start=performance.now();render();times.push(performance.now()-start);}}finally{window.x.snapshot=snapshot;}return{predicates,times};},
 async close(){flushSync(()=>root.unmount());if(subscriptions!==0)fail("subscriptions leaked");if(graph.disposed||layout.disposed||selection.disposed||connections.disposed)fail("borrowed model disposed");layout.dispose();graph.dispose();connections.dispose();selection.dispose();oldSelection?.dispose();return{subscriptions,workers:workers.size,nodes:document.getElementById("app").childElementCount,failures:failures.length};},
};
