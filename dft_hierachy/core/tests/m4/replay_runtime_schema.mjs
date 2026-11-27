// B independent replay of its frozen corpus through public generated API.
// No A replay source/samples are used. Python remains B's handwritten oracle.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const runtime=resolve(process.argv[2] ?? ".");
const python=process.env.B_SCHEMA_PYTHON;
assert.ok(python,"B_SCHEMA_PYTHON must name B's own jsonschema environment");
const corpus=fileURLToPath(new URL("./test_schema_contract.py",import.meta.url));
const child=spawnSync(python,["-B",corpus],{encoding:"utf8",maxBuffer:32*1024*1024,
  env:{...process.env,B_M4_SCHEMA:join(runtime,"protocol/schema/hier.schema.json")}});
assert.ifError(child.error);
const original=JSON.parse(child.stdout);
const api=await import(pathToFileURL(join(runtime,"web/packages/protocol-types/dist/index.js")));
const results=[];
const add=(name,actual,expected,details={})=>results.push({name,actual,expected,passed:JSON.stringify(actual)===JSON.stringify(expected),...details});
const preserve=(input,actual)=> {
  if(input!==null && typeof input==="object") {
    if(Array.isArray(input)) { assert.ok(Array.isArray(actual));assert.equal(actual.length,input.length); }
    else assert.ok(actual!==null && typeof actual==="object");
    for(const [key,value]of Object.entries(input)) { assert.ok(Object.hasOwn(actual,key),key);preserve(value,actual[key]); }
  } else assert.deepEqual(actual,input);
};
for(const row of original.cases) {
  if(Object.hasOwn(row,"expectedAccept")) {
    const definition=typeof row.definition==="string"?row.definition:row.definition?.$ref?.slice(8);
    if(typeof row.definition!=="string") {
      assert.deepEqual(Object.keys(row.definition),["$ref"]);
      assert.ok(row.definition.$ref.startsWith("#/$defs/"),"Only the same local named definition is adapted");
    }
    assert.equal(typeof definition,"string","Frozen structure cases must address a public named definition");
    const input=structuredClone(row.input),before=JSON.stringify(input);
    const actual=api.validateDefinition(definition,input);
    add(row.name,actual,row.expectedAccept,{definition,pythonAccept:row.actualAccept,pythonPassed:row.passed,
      inputUnchanged:JSON.stringify(input)===before,...(actual!==row.expectedAccept?{input:row.input,basis:row.basis}:{})});
    if(JSON.stringify(input)!==before)results.at(-1).passed=false;
  } else {
    let actual;
    if(row.name==="method-set") actual=Object.keys(api.METHODS).sort();
    else if(row.name==="method-count") actual=Object.keys(api.METHODS).length;
    else if(row.name==="PageLimit.default") actual=api.canonicalParams("inst.children",{inst:"B"}).limit;
    else if(row.name==="RequestCursor.default") actual=api.canonicalParams("inst.children",{inst:"B"}).cursor;
    else if(row.name==="MaxHops.default") actual=api.canonicalParams("conn.step",{from:{ref:"B"},direction:"back"}).maxHops;
    else {
      const suffix=row.name.slice(row.name.lastIndexOf(".")+1),method=row.name.slice(0,row.name.lastIndexOf("."));
      const field={"client-name":"clientMethod","partial-rule":"allowsPartial","cache-rule":"cacheComplete"}[suffix];
      assert.ok(field,"No guessed mapping for "+row.name); actual=api.METHODS[method]?.[field];
    }
    add(row.name,actual,row.expected,{basis:row.basis});
  }
}
const canonical=[];
for(const row of original.cases.filter(x=>x.name.endsWith(".params")&&x.expectedAccept===true)) {
  const method=row.name.slice(0,-7),input=structuredClone(row.input),before=JSON.stringify(input);
  const result=api.canonicalParams(method,input);
  const valid=api.validateDefinition(api.METHODS[method].params,result);
  let retained=true;try{preserve(input,result);}catch{retained=false;}
  const idempotent=JSON.stringify(api.canonicalParams(method,result))===JSON.stringify(result);
  const unchanged=JSON.stringify(input)===before;
  canonical.push({method,valid,retained,idempotent,unchanged,passed:valid&&retained&&idempotent&&unchanged,
    ...(!(valid&&retained&&idempotent&&unchanged)?{input,result}:{})});
}
add("public.PROTOCOL_VERSION",api.PROTOCOL_VERSION,2);
add("public.SCHEMA_VERSION",api.SCHEMA_VERSION,7);
const base=results.slice(0,655);
const out={schemaSha256:original.schemaSha256,pythonExitCode:child.status,
  checks:655,structured:569,metadata:86,passed:base.filter(x=>x.passed).length,failed:base.filter(x=>!x.passed).length,
  publicVersionChecks:results.slice(655),normalization:{checks:canonical.length,passed:canonical.filter(x=>x.passed).length,cases:canonical},
  cases:base,scope:"Generated public TypeScript validators/metadata + B's frozen inputs. Not C++ decoder agreement or Core semantic verification."};
console.log(JSON.stringify(out));
if(child.status!==0||results.some(x=>!x.passed)||canonical.some(x=>!x.passed))process.exitCode=1;
