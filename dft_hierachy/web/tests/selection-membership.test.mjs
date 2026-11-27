import assert from "node:assert/strict";
import test from "node:test";
import { selectionMembership } from "../packages/views/dist/selection-membership.js";
import { SelectionModel } from "../packages/viewmodel/dist/index.js";

test("A M7 selection membership: namespaces, bit/side variants, duplicate refs and opaque strings", () => {
  const model = new SelectionModel();
  model.select({origin:"external",items:[{def:"same"},{ref:"same",side:"inside",bits:{lsb:0,width:1}},{ref:"same",side:"outside"},{ref:"__proto__"},{ref:"e\u0301"},{def:"é"}]});
  const before = model.current, text=JSON.stringify(before), m=selectionMembership(before);
  assert.deepEqual([...m.objects], ["same","__proto__","e\u0301"]); assert.deepEqual([...m.definitions], ["same","é"]);
  assert.equal(m.objects.has("é"),false);assert.equal(m.definitions.has("e\u0301"),false);assert.equal(JSON.stringify(before),text);
  model.select({origin:"external",items:[]});assert.equal(m.objects.has("same"),true);assert.equal(selectionMembership(model.current).objects.size,0);model.dispose();
});

test("A M7 selection membership: 100000 choices project in one pass without singleton-array flattening", () => {
  let reads=0; const items=Object.freeze(Array.from({length:100000},(_,i)=>Object.freeze({get ref(){reads++;return `ref/${i}`;}})));
  const membership=selectionMembership(Object.freeze({origin:"external",items}));assert.equal(membership.objects.size,100000);assert.equal(membership.definitions.size,0);
  assert.ok(reads<=100000);for(let i=0;i<100000;i++)assert.ok(membership.objects.has(`ref/${i}`));assert.ok(reads<=100000);
});
