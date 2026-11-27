import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const p = process.env.HIER_B_PRODUCT_ROOT;
assert(p);
const req = createRequire(p + "/web/package.json"),
  ts = req("typescript"),
  proposal = process.argv.includes("--proposal"),
  root = path.dirname(fileURLToPath(import.meta.url)),
  file = root + "/types.ts";
const r = {
  kind: "B71-host-public-types",
  mode: proposal ? "proposal" : "production",
  planned: 16,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 16,
  skipped: 0,
  positiveDiagnostics: [],
  results: [],
  exitCode: 1,
};
const electron =
  process.env.HIER_B_ELECTRON_TYPES ??
  p + "/web/contracts/electron/node_modules/electron/electron.d.ts";
try {
  assert(
    fs.existsSync(electron),
    "official Electron declarations required; not a homemade WebContents",
  );
  const pkg = JSON.parse(fs.readFileSync(p + "/web/packages/client/package.json"));
  const actualType = (sub) => {
    const item = pkg.exports?.[sub],
      file = typeof item === "object" && item ? item.types : undefined;
    return typeof file === "string"
      ? path.resolve(p + "/web/packages/client", file)
      : p + "/B71-missing-public-type-" + sub.split("/").at(-1) + ".d.ts";
  };
  const paths = {
    "@hier/client": [p + "/web/packages/client/dist/index.d.ts"],
    "@hier/client/node": [p + "/web/packages/client/dist/node/index.d.ts"],
    "@hier/protocol-types": [p + "/web/packages/protocol-types/dist/index.d.ts"],
    "@hier/client/electron/main": [
      proposal ? p + "/web/contracts/electron/main.d.ts" : actualType("./electron/main"),
    ],
    "@hier/client/electron/preload": [
      proposal ? p + "/web/contracts/electron/preload.d.ts" : actualType("./electron/preload"),
    ],
    electron: [electron],
  };
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
    typeRoots: [p + "/web/node_modules/@types"],
    paths,
  };
  const original = fs.readFileSync(file, "utf8"),
    markers = original.split("\n").flatMap((l, i) => {
      const m = l.match(/@ts-expect-error (H\d+):/);
      return m ? [{ id: m[1], line: i + 2 }] : [];
    });
  assert.equal(markers.length, 16);
  function compile(source) {
    const host = ts.createCompilerHost(options),
      read = host.readFile;
    host.readFile = (f) => (path.resolve(f) === file ? source : read(f));
    return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host)).map((d) => ({
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
  r.positiveDiagnostics = compile(original);
  if (r.positiveDiagnostics.length === 0) {
    const stripped = original.replace(/@ts-expect-error/g, "expect-error-disabled"),
      ds = compile(stripped);
    for (const m of markers) {
      const hit = ds.filter((d) => d.file === file && d.line === m.line);
      assert(hit.length > 0, "real diagnostic missing " + m.id);
      r.results.push({ ...m, codes: hit.map((x) => x.code) });
    }
    assert(
      ds.every((d) => d.file === file && markers.some((m) => m.line === d.line)),
      "off-scope diagnostic",
    );
    r.executed = 16;
    r.blocked = 0;
    r.passed = 16;
    r.exitCode = 0;
  }
} catch (e) {
  r.setupError = String(e);
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.exitCode;
