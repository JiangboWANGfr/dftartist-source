import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { document, state, success, longText, point } from "./source-data.mjs";
import { texts } from "./cases.mjs";
const mode = process.argv[2];
assert.ok(["proposal", "production"].includes(mode), "explicit mode");
const product = process.env.HIER_B_PRODUCT_ROOT,
  tools = process.env.HIER_B_BROWSER_TOOLS;
assert.ok(
  product && tools,
  "explicit fixed product and readonly browser tools",
);
const require = createRequire(path.join(product, "web/package.json")),
  ts = require("typescript");
const react = fs.realpathSync(
  path.join(tools, "node_modules/@types/react/index.d.ts"),
);
assert.ok(fs.existsSync(react));
const file = path.join(import.meta.dirname, "types.ts"),
  original = fs.readFileSync(file, "utf8");
const fixtureFile = path.join(
  import.meta.dirname,
  "B-fixture-values.virtual.ts",
);
const values = [
  ...["idle", "pending", "success", "failed", "cancelled"].map((status) =>
    state(status),
  ),
  ...Object.values(texts).map((text) => success(document(text))),
  success(document("current", 0, 0, true)),
  success(document("a😀中", 1, 3)),
  success(document("a\r\nb", 3, 4)),
  success(document("", 0, 0)),
  success(document(longText, point, point + 1)),
];
const fixtureSource =
  'import type {SourceDocumentState} from "@hier/viewmodel";\nconst values=' +
  JSON.stringify(values) +
  " as const satisfies readonly SourceDocumentState[];\nvoid values;";
const paths = Object.fromEntries(
  ["client", "viewmodel", "protocol-types", "views"].map((n) => [
    "@hier/" + n,
    [path.join(product, "web/packages", n, "dist/index.d.ts")],
  ]),
);
paths.react = [react];
if (mode === "proposal")
  paths["@hier/views"] = [path.join(import.meta.dirname, "proposal.d.ts")];
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
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  paths,
};
const describe = (d) => ({
  file: d.file ? path.resolve(d.file.fileName) : null,
  line:
    d.file && d.start !== undefined
      ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
      : null,
  code: d.code,
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
});
function compile(text) {
  const host = ts.createCompilerHost(options),
    read = host.readFile;
  const exists = host.fileExists;
  host.fileExists = (f) => path.resolve(f) === fixtureFile || exists(f);
  host.readFile = (f) =>
    path.resolve(f) === file
      ? text
      : path.resolve(f) === fixtureFile
        ? fixtureSource
        : read(f);
  const program = ts.createProgram([file, fixtureFile], options, host);
  return {
    diags: ts.getPreEmitDiagnostics(program).map(describe),
    inputs: program.getSourceFiles().map((f) => path.resolve(f.fileName)),
  };
}
const markers = original.split("\n").flatMap((line, i) => {
  const m = line.match(/@ts-expect-error (SV\d+):/);
  return m ? [{ id: m[1], line: i + 2 }] : [];
});
assert.equal(markers.length, 28);
const pos = compile(original),
  report = {
    kind: "B-SourceView-types",
    mode,
    product,
    react,
    typescript: ts.version,
    planned: 28,
    typedFixtureValues: values.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    positive: pos.diags,
    stage: "positive-public-capability",
    inputs: pos.inputs,
  };
if (pos.diags.length) {
  report.exitCode = 1;
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
assert.ok(
  pos.inputs.some((f) => fs.existsSync(f) && fs.realpathSync(f) === react),
);
assert.ok(
  pos.inputs.some((f) =>
    f.endsWith("/viewmodel/dist/source-document-types.d.ts"),
  ),
);
assert.equal(
  pos.inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
  false,
);
for (const marker of markers) {
  const text = original.replace(
      "@ts-expect-error " + marker.id + ":",
      "B removed " + marker.id + ":",
    ),
    r = compile(text);
  assert.ok(r.diags.length > 0, marker.id);
  assert.ok(
    r.diags.every(
      (d) =>
        d.file === file &&
        d.line === marker.line &&
        ![2305, 2307, 2578].includes(d.code),
    ),
    JSON.stringify({ marker, diagnostics: r.diags }),
  );
  report.executed++;
  report.passed++;
}
report.stage = "semantic-types";
report.exitCode = 0;
console.log(JSON.stringify(report, null, 2));
