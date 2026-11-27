// Agent B: strict public consumers, with every negative checked after stripping.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const mode = process.argv[2] ?? "proposal";
assert.ok(
  ["proposal", "production"].includes(mode),
  "mode must be explicit proposal/production",
);
const productRoot = path.resolve(
  process.env.HIER_B_PRODUCT_ROOT ?? path.join(import.meta.dirname, "../../.."),
);
const require = createRequire(path.join(productRoot, "web/package.json"));
const ts = require("typescript");
const react = process.env.HIER_B_REACT_TYPES
  ? path.resolve(process.env.HIER_B_REACT_TYPES)
  : path.join(
      path.dirname(require.resolve("@types/react/package.json")),
      "index.d.ts",
    );
assert.ok(fs.existsSync(react), "real React declarations are required");
const declaration = path.join(import.meta.dirname, "proposal.d.ts");
const source = path.join(import.meta.dirname, "view-types.ts");
const original = fs.readFileSync(source, "utf8");
const paths = Object.fromEntries(
  ["client", "viewmodel", "protocol-types", "views"].map((name) => [
    "@hier/" + name,
    [path.join(productRoot, "web/packages", name, "dist/index.d.ts")],
  ]),
);
if (mode === "proposal") paths["@hier/views"] = [declaration];
paths.react = [react];
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  paths,
};
const describe = (d) => ({
  file: d.file ? path.resolve(d.file.fileName) : null,
  code: d.code,
  line:
    d.file && d.start !== undefined
      ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
      : null,
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
});
function compile(text = original) {
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  host.readFile = (file) => (path.resolve(file) === source ? text : read(file));
  return ts
    .getPreEmitDiagnostics(ts.createProgram([source], options, host))
    .map(describe);
}
const positive = compile();
const metadata = { mode, productRoot, typescript: ts.version, react, options };
if (positive.length) {
  console.log(
    JSON.stringify({ ...metadata, positiveDiagnostics: positive }, null, 2),
  );
  process.exit(1);
}
const lines = original.split("\n");
const markers = [];
for (let i = 0; i < lines.length; ++i) {
  const match = lines[i].match(/@ts-expect-error (V\d+):/);
  if (match) markers.push({ id: match[1], line: i + 2 });
}
assert.equal(markers.length, 46);
assert.equal(new Set(markers.map((m) => m.id)).size, markers.length);
const stripped = original.replaceAll(
  "@ts-expect-error",
  "B expectation removed",
);
const diagnostics = compile(stripped);
for (const marker of markers) {
  assert.ok(
    diagnostics.some((d) => d.file === source && d.line === marker.line),
    marker.id + " must produce a real consumer diagnostic",
  );
}
assert.ok(
  diagnostics.every(
    (d) => d.file === source && markers.some((m) => m.line === d.line),
  ),
  "no unrelated negative diagnostics",
);
console.log(
  JSON.stringify(
    {
      ...metadata,
      positiveDiagnostics: 0,
      negativeChecks: markers.length,
      passed: markers.map((m) => ({
        ...m,
        codes: diagnostics.filter((d) => d.line === m.line).map((d) => d.code),
      })),
    },
    null,
    2,
  ),
);
