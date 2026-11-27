import assert from "node:assert/strict";
import test from "node:test";
import { objectSelectionMatcher } from "../packages/views/dist/object-selection-match.js";
test("A M7 exact membership: lazy current-snapshot index handles 100000 bit choices on one ref without rescanning",()=>{
 let refs=0,bits=0;const count=100000,items=Object.freeze(Array.from({length:count},(_,i)=>Object.freeze({get ref(){refs++;return "same";},get bits(){bits++;return Object.freeze({lsb:i,width:i%2});},side:"inside"})));
 const matcher=objectSelectionMatcher(Object.freeze({origin:"external",items}));assert.equal(refs,0);assert.equal(bits,0);
 assert.ok(matcher({ref:"same",bits:{lsb:99999,width:1},side:"inside"}));const captured=[refs,bits];assert.ok(refs<=count*2);assert.equal(bits,count);
 for(let i=0;i<10000;i++){assert.equal(matcher({ref:"same",bits:{lsb:i,width:i%2},side:"outside"}),false);assert.equal(matcher({ref:"same",bits:{lsb:i,width:(i+1)%2},side:"inside"}),false);}
 assert.deepEqual([refs,bits],captured);
});
