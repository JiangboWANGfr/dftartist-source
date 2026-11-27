import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as V from "@hier/views";
import * as M from "@hier/viewmodel";
const snapshotId = "A-selection-display", complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const freeze = (v) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; };
const reply = (result) => freeze({ result, completeness: complete });
let root, models, selection, calls, failures, roots, refs, oldSelection, subscriptions, generation = 0;
const error = (e) => { throw new Error(e); };
const info = (ref) => ({ ref, name: ref, path: [ref], pathText: ref, kind: "module", def: "same", defName: "shared", childCount: 0, hasParamOverrides: false });
function render(strict = false) {
  const props = { height: 220, selection, onCommandError: (e) => failures.push(e) };
  const content = <>
    <div data-view="search"><V.SearchResultsView {...props} ariaLabel="search" search={models.search}/></div>
    <div data-view="instances"><V.DefinitionInstancesView {...props} ariaLabel="instances" instances={models.instances}/></div>
    <div data-view="path"><V.PathResolutionView {...props} ariaLabel="path" resolution={models.path}/></div>
    <div data-view="properties"><V.PropertiesPanel {...props} ariaLabel="properties" properties={models.properties}/></div>
    <div data-view="connections"><V.ObjectConnectionsView {...props} ariaLabel="connections" connections={models.connections}/></div>
    <div data-view="tree"><V.HierarchyTree {...props} ariaLabel="tree" tree={models.tree}/></div>
  </>;
  flushSync(() => root.render(strict ? <React.StrictMode>{content}</React.StrictMode> : content));
}
async function load() {
  await Promise.all([models.search.load({ snapshotId, text: "all" }),models.instances.load({ snapshotId, def: "same" }),models.path.load({ snapshotId, text: "path" }),models.properties.load("owner"),models.connections.load({ slice: { ref: "same", bits: { lsb: 0, width: 1 } }, side: "inside", reach: "local" }),models.tree.loadRoots()]);
}
function observeModel(model) {
  const original = model.subscribe;
  model.subscribe = function (...args) { subscriptions++; const off = original.apply(this, args); let live = true; return () => { if (live) subscriptions--; live = false; off(); }; };
  return model;
}
window.a = {
  async setup(count = 5, strict = false) {
    roots = ["same", "only-def", "__proto__/尾/e\u0301", "__proto__/尾/é", ...Array.from({length: Math.max(0,count-4)}, (_,i) => `row/${i}`)]; refs = [...roots, "same"];
    calls=[];failures=[];subscriptions=0;const client={snapshot:{snapshotId}}, wrap=(name, fn)=>{client[name]=async(...args)=>{calls.push(name);return fn(...args);};};
    wrap("search",()=>reply({items:refs.flatMap(ref=>[{kind:"definition",ref,name:ref,pathText:ref,def:"same"},{kind:"instance",ref,name:ref,pathText:ref,def:"same"}])}));
    wrap("instancesOf",()=>reply({items:refs.map(info)}));wrap("resolvePath",()=>reply(refs));wrap("instance",ref=>reply(info(ref)));
    wrap("ports",()=>reply(roots.map(ref=>({ref,name:ref,direction:"in",kind:"port",type:"logic",width:4}))));wrap("params",()=>reply([]));
    wrap("object",ref=>reply({ref,kind:"port",name:ref,pathText:ref,inst:"owner"}));
    const endpoints=()=>reply(refs.map(ref=>({kind:"port",ref,inst:"owner",via:[]})));wrap("drivers",endpoints);wrap("loads",endpoints);wrap("roots",()=>reply(roots.map(info)));
    models={search:new M.SearchModel(client,{pageSize:10000}),instances:new M.DefinitionInstancesModel(client,{pageSize:10000}),path:new M.PathResolutionModel(client),properties:new M.InstancePropertiesModel(client),connections:new M.ObjectConnectionsModel(client),tree:new M.TreeModel(client)};
    for (const m of Object.values(models))observeModel(m);selection=observeModel(new M.SelectionModel({snapshotId,historyLimit:4}));await load();root=createRoot(document.getElementById("app"));render(strict);return window.a.snapshot();
  },
  select(items) { flushSync(()=>selection.select({snapshotId,origin:"external",items}));return window.a.snapshot(); },
  history(method) {flushSync(()=>selection[method]());return window.a.snapshot();},
  rerender() {const count=calls.length;render();if(calls.length!==count)error("implicit query on render");return window.a.snapshot();},
  async reload() {const current=selection.current;await Promise.all(Object.values(models).map(m=>m===models.tree?m.reload(null):m.reload()));flushSync(()=>{});if(selection.current!==current)error("reload changed selection");return window.a.snapshot();},
  replace() {oldSelection=selection;selection=observeModel(new M.SelectionModel({snapshotId}));render();return window.a.snapshot();},
  click(view,label) {const element=[...document.querySelector(`[data-view=${view}]`).querySelectorAll("button")].find(b=>b.textContent===label);if(!element)error("missing action");element.focus();element.click();flushSync(()=>{});return window.a.snapshot();},
  snapshot() {
    return {selection:selection.current,views:Object.fromEntries([...document.querySelectorAll("[data-view]")].map(v=>[v.dataset.view,{rows:[...v.querySelectorAll("tbody tr")].map(row=>row.innerText),tree:[...v.querySelectorAll("[role=treeitem]")].map(row=>[row.getAttribute("aria-label"),row.getAttribute("aria-selected")]),markers:[...v.querySelectorAll("span")].map(n=>n.textContent).filter(t=>["定义在选择中","对象在选择中","实例在选择中","已选中","查询目标在选择中"].includes(t))}])),calls:[...calls],failures:failures.length};
  },
  countRender(selectedCount, rerender = false) {
    if(!rerender)flushSync(()=>selection.select({snapshotId,origin:"external",items:Array.from({length:selectedCount},(_,i)=>({ref:`A-bulk/${i}`}))}));
    const captured=selection.current, originalSome=Array.prototype.some, originalAdd=Set.prototype.add;let predicates=0,adds=0;
    Array.prototype.some=function(predicate,ctx){return this===captured.items?originalSome.call(this,(...args)=>{predicates++;return predicate.apply(ctx,args);}):originalSome.call(this,predicate,ctx);};
    Set.prototype.add=function(value){if(typeof value==="string"&&value.startsWith("A-bulk/"))adds++;return originalAdd.call(this,value);};
    const start=performance.now();try{render();}finally{Array.prototype.some=originalSome;Set.prototype.add=originalAdd;}
    return {predicates,adds,ms:performance.now()-start,selectionCount:captured.items.length};
  },
  async close() {flushSync(()=>root.unmount());const live=Object.values(models).some(m=>m.disposed)||selection.disposed;if(subscriptions!==0||live)error("borrowed lifetime/subscription leak");for(const m of Object.values(models))m.dispose();selection.dispose();oldSelection?.dispose();return {subscriptions,nodes:document.getElementById("app").childElementCount,failures:failures.length};},
};
