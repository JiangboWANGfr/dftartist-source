// Same strict compiler/marker-line mechanism as B83; no production-to-proposal fallback.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P);
const req = createRequire(P + "/web/package.json"),
  ts = req("typescript"),
  proposal = process.argv.includes("--proposal"),
  file = path.join(import.meta.dirname, "types.ts");
const paths = Object.fromEntries(
  ["client", "viewmodel", "views", "protocol-types"].map((n) => [
    "@hier/" + n,
    [P + "/web/packages/" + n + "/dist/index.d.ts"],
  ]),
);
paths["@B/projection"] = [
  proposal ? P + "/web/contracts/schematic-view/proposal.d.ts" : paths["@hier/viewmodel"][0],
];
paths["@B/view"] = [
  proposal ? P + "/web/contracts/schematic-view/proposal.d.ts" : paths["@hier/views"][0],
];
paths.react = [path.join(path.dirname(req.resolve("@types/react/package.json")), "index.d.ts")];
const options = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: [],
  paths,
};
const source = fs.readFileSync(file, "utf8"),
  markers = source.split("\n").flatMap((l, i) => {
    const m = l.match(/@ts-expect-error (T\d+):/);
    return m ? [{ id: m[1], line: i + 2 }] : [];
  });
assert.equal(markers.length, 20);
const compile = (text) => {
  const h = ts.createCompilerHost(options),
    read = h.readFile;
  h.readFile = (f) => (path.resolve(f) === file ? text : read(f));
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, h)).map((d) => ({
    code: d.code,
    file: d.file?.fileName,
    line:
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : null,
    message: ts.flattenDiagnosticMessageText(d.messageText, " "),
  }));
};
const r = {
  mode: proposal ? "proposal" : "production",
  planned: 20,
  executed: 0,
  passed: 0,
  blocked: 20,
  skipped: 0,
  options,
  positiveDiagnostics: compile(source),
  results: [],
  exitCode: 1,
};
if (!r.positiveDiagnostics.length) {
  const ds = compile(source.replaceAll("@ts-expect-error", "B-marker-disabled"));
  for (const m of markers) {
    const hit = ds.filter((d) => d.file === file && d.line === m.line);
    assert(hit.length, "actual diagnostic " + m.id);
    r.results.push({ ...m, codes: hit.map((d) => d.code) });
  }
  assert(
    ds.every((d) => d.file === file && markers.some((m) => m.line === d.line)),
    "no unrelated diagnostics",
  );
  r.executed = r.passed = 20;
  r.blocked = 0;
  r.exitCode = 0;
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.exitCode;
