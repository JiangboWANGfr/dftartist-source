import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const p = process.env.HIER_B_PRODUCT_ROOT;
assert(p);
const standalone = !fs.existsSync(p + "/web/package.json"),
  packageRoot = standalone ? p : p + "/web";
const req = createRequire(packageRoot + "/package.json"),
  ts = req("typescript"),
  proposal = process.argv.includes("--proposal");
const local = path.dirname(fileURLToPath(import.meta.url)),
  file = local + "/types.ts";
const r = {
  kind: "B79-graph-types",
  mode: proposal ? "proposal" : "production",
  planned: 20,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 20,
  skipped: 0,
  positiveDiagnostics: [],
  results: [],
  exitCode: 1,
};
try {
  const bridge = proposal
    ? p + "/web/contracts/graph-session/proposal.d.ts"
    : declaration("viewmodel");
  assert(
    fs.existsSync(bridge),
    "graph declaration capability absent (no proposal fallback in production mode)",
  );
  const paths = { "@B/graph": [bridge] };
  function declaration(n, subpath = ".") {
    if (!standalone)
      return (
        p +
        "/web/packages/" +
        n +
        "/dist/" +
        (subpath === "." ? "index" : subpath.slice(2)) +
        ".d.ts"
      );
    const root = p + "/node_modules/@hier/" + n;
    const pkg = JSON.parse(fs.readFileSync(root + "/package.json"));
    const declaration = pkg.exports?.[subpath]?.types ?? (subpath === "." ? pkg.types : undefined);
    assert.equal(typeof declaration, "string", "actual public declaration entry");
    return path.resolve(root, declaration);
  }
  for (const n of ["client", "protocol-types", "viewmodel", "views"])
    paths["@hier/" + n] = [declaration(n)];
  paths["@hier/client/electron/renderer"] = [declaration("client", "./electron/renderer")];
  const options = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ["node"],
    typeRoots: [packageRoot + "/node_modules/@types"],
    paths,
  };
  const source = fs.readFileSync(file, "utf8"),
    markers = source.split("\n").flatMap((l, i) => {
      const m = l.match(/@ts-expect-error (T\d+):?/);
      return m ? [{ id: m[1], line: i + 2 }] : [];
    });
  assert.equal(markers.length, 20);
  function compile(text) {
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
  }
  r.options = options;
  r.positiveDiagnostics = compile(source);
  if (!r.positiveDiagnostics.length) {
    const ds = compile(source.replaceAll("@ts-expect-error", "expect-error-disabled"));
    for (const m of markers) {
      const hit = ds.filter((d) => d.file === file && d.line === m.line);
      assert(hit.length, "missing original diagnostic " + m.id);
      r.results.push({ ...m, codes: hit.map((x) => x.code) });
    }
    assert(
      ds.every((d) => d.file === file && markers.some((m) => m.line === d.line)),
      "off-scope diagnostic",
    );
    r.executed = 20;
    r.passed = 20;
    r.blocked = 0;
    r.exitCode = 0;
  }
} catch (e) {
  r.setupError = String(e);
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.exitCode;
