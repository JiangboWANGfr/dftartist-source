import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const web=path.resolve(import.meta.dirname,".."), evidence=process.env.HIER_A_SELECTION_EVIDENCE ?? mkdtempSync(path.join(os.tmpdir(),"hier-selection-test-"));
const alias=Object.fromEntries(["viewmodel","client","protocol-types"].map(p=>[`@hier/${p}`,path.join(web,"packages",p,"dist/index.js")]));
alias["@hier/views"]=process.env.HIER_A_VIEWS_ENTRY ?? path.join(web,"packages/views/dist/index.js");
const bundle=await build({entryPoints:[path.join(web,"tests/selection-display/fixture.jsx")],bundle:true,format:"esm",platform:"browser",target:"es2022",write:false,alias,nodePaths:[path.join(web,"node_modules")],define:{"process.env.NODE_ENV":JSON.stringify("development")}});
assert.deepEqual(bundle.warnings,[]);const body=bundle.outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/fixture.js"?"application/javascript":"text/html");res.end(req.url==="/fixture.js"?body:'<style>body{font:14px sans-serif}[data-view]{width:900px;margin:8px}section{overflow:auto}</style><div id="app"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const browser=await chromium.launch({headless:true});let sequence=0;
async function context(t,count=5,strict=false){const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.a);await page.evaluate(([count,strict])=>window.a.setup(count,strict),[count,strict]);t.after(async()=>{assert.deepEqual(await page.evaluate(()=>window.a.close()),{subscriptions:0,nodes:0,failures:0});assert.deepEqual(errors,[]);await page.close();});return page;}
const history=[];function save(name,value){history.push({name,value});writeFileSync(path.join(evidence,"compatibility.json"),JSON.stringify({bundleSha256:createHash("sha256").update(body).digest("hex"),history},null,2)+"\n");}
try {
 await test("A M7 selection display: object/definition namespaces, bits/side, duplicates and exact target markers stay distinct",async(t)=>{
  const page=await context(t);const initial=await page.evaluate(()=>window.a.snapshot());assert.equal(initial.failures,0);
  for(const items of [[{def:"same"}],[{ref:"same",bits:{lsb:0,width:1},side:"outside"}],[{ref:"same",bits:{lsb:0,width:1},side:"inside"}],[{def:"same"},{ref:"same"},{ref:"__proto__/尾/e\u0301"}],[{ref:"__proto__/尾/é"}]] ){
   const s=await page.evaluate(items=>window.a.select(items),items);const object=items.some(x=>x.ref==="same"),definition=items.some(x=>x.def==="same");
   assert.equal(s.views.search.markers.filter(x=>x==="定义在选择中").length,definition?2:0);const refs=["same","only-def","__proto__/尾/e\u0301","__proto__/尾/é","row/0","same"];const objects=refs.filter(ref=>items.some(item=>item.ref===ref)).length;assert.equal(s.views.instances.markers.length,objects);
   assert.equal(s.views.path.markers.filter(x=>x==="对象在选择中").length,objects);
   assert.equal(s.views.connections.markers.filter(x=>x==="对象在选择中").length,objects*2);save(`selection-${sequence++}`,s);
  }
 });
 await test("A M7 selection display: history, ordinary renders, reload, model replacement and native activation retain ownership",async(t)=>{
  const page=await context(t,5,true);await page.evaluate(()=>window.a.select([{ref:"same"}]));await page.evaluate(()=>window.a.select([{def:"same"}]));
  for(const op of [()=>page.evaluate(()=>window.a.history("back")),()=>page.evaluate(()=>window.a.history("forward")),()=>page.evaluate(()=>window.a.rerender()),()=>page.evaluate(()=>window.a.reload()),()=>page.evaluate(()=>window.a.replace()),()=>page.evaluate(()=>window.a.click("search","选择定义")),()=>page.evaluate(()=>window.a.click("instances","选择实例"))]){const s=await op();assert.equal(s.failures,0);save(`lifecycle-${sequence++}`,s);}
 });
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
