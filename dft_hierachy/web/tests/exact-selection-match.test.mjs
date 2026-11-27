import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { SelectionModel } from "../packages/viewmodel/dist/index.js";
const module = await import(process.env.HIER_A_EXACT_MATCH_MODULE ? pathToFileURL(process.env.HIER_A_EXACT_MATCH_MODULE) : new URL("../packages/views/dist/object-selection-match.js",import.meta.url));
const matcher = module.objectSelectionMatcher ?? ((selection) => (target) => selection.items.some(item => item.ref !== undefined && module.sameObjectSelection(item,target)));
// Literal contract comparison, independent of the proposed tuple representation.
const expected = (items,target) => items.some(item=>item.ref!==undefined && item.ref===target.ref && item.side===target.side && (item.bits===undefined?target.bits===undefined:target.bits!==undefined && item.bits.lsb===target.bits.lsb && item.bits.width===target.bits.width));
test("A M7 exact selection: all ref, side, absence, zero-width and coordinate combinations stay precise",()=>{
 const model=new SelectionModel(), values=[];
 for(const ref of ["same","a|inside|0|1","q\"[,]\\", "nul\u0000tail","e\u0301","é"])
  for(const side of [undefined,"inside","outside"])
   for(const bits of [undefined,{lsb:0,width:0},{lsb:-0,width:1},{lsb:1,width:0},{lsb:65536,width:4}])values.push({ref,...(side===undefined?{}:{side}),...(bits===undefined?{}:{bits})});
 const groups=[[],[{def:"same"}],[values[0]],[{def:"same"},{def:"other"}],values.slice(0,2),values.filter((_,i)=>i%7===0),values,[{def:"same"},...values.slice(0,6)]];
 for(const items of groups){model.select({origin:"external",items});const s=model.current, before=JSON.stringify(s), matches=matcher(s);for(const target of values)assert.equal(matches(target),expected(s.items,target),JSON.stringify({items:s.items,target}));assert.equal(JSON.stringify(s),before);}
 model.dispose();
});
test("A M7 exact selection: immutable snapshots, order/extra choices, definitions and history retain ownership",()=>{
 const model=new SelectionModel(), a={ref:"ref",bits:{lsb:0,width:0},side:"inside"}, b={ref:"ref",bits:{lsb:0,width:1},side:"inside"};
 model.select({origin:"external",items:[a,{def:"ref"},b]});const old=model.current, matches=matcher(old);assert.ok(matches(a)&&matches(b));assert.equal(matches({ref:"ref"}),false);assert.equal(matches({...a,side:"outside"}),false);
 model.select({origin:"graph",items:[b,a]});assert.ok(matcher(model.current)(a));model.back();assert.equal(model.current,old);model.select({origin:"external",items:[]});assert.equal(matcher(model.current)(a),false);model.dispose();assert.ok(matches(a));assert.equal(old.items.length,3);
});
