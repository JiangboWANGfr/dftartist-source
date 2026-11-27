// B's own text cases. This executes only Node RegExp, NOT generated TS validators.
import { readFileSync } from "node:fs";
const schemaPath = process.env.B_M4_SCHEMA ??
  new URL("../../../protocol/schema/hier.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const digest = "0123456789abcdef".repeat(4);
const rows = [];
for (const [name, values] of [
  ["Hash", [[digest,true],[digest+"\n",false],[digest+"\r",false],
            [digest+"\r\n",false],[digest+" ",false],[digest.toUpperCase(),false],[digest.slice(1),false]]],
  ["FourStateValue", [["3'b0zx",true],["3'b0zx\n",false],["3'b0zx\r",false],
                     ["3'b0zx\r\n",false],["3'b0ZX",false],["3'b0d1",false],["0'b0",false]]],
]) {
  const pattern = schema.$defs[name].pattern;
  for (const [value,expected] of values) {
    const actual = new RegExp(pattern).test(value);
    rows.push({name,value,expectedAccept:expected,actualAccept:actual,passed:actual===expected});
  }
}
console.log(JSON.stringify({checks:rows.length,passed:rows.filter(x=>x.passed).length,
  failed:rows.filter(x=>!x.passed).length,scope:"Node RegExp only; not TS generation or Core runtime.",cases:rows}));
process.exitCode = rows.every(x=>x.passed) ? 0 : 1;
