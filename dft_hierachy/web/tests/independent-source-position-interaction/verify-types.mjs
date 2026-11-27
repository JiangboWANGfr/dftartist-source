// B-owned type oracle from DESIGN 6.15; never imports A's isolated contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const mode = process.argv[2];
assert.ok(["proposal", "production"].includes(mode), "explicit mode required");
const product = process.env.HIER_B_PRODUCT_ROOT;
const tools = process.env.HIER_B_BROWSER_TOOLS;
assert.ok(
  product && tools,
  "explicit fixed product and readonly tools required",
);
const require = createRequire(path.join(product, "web/package.json"));
const ts = require("typescript");
const react = fs.realpathSync(
  path.join(tools, "node_modules/@types/react/index.d.ts"),
);
const file = path.join(import.meta.dirname, "types.ts");
const original = fs.readFileSync(file, "utf8");
const paths = Object.fromEntries(
  ["client", "viewmodel", "protocol-types", "views"].map((name) => [
    "@hier/" + name,
    [path.join(product, "web/packages", name, "dist/index.d.ts")],
  ]),
);
paths.react = [react];
if (mode === "proposal") {
  paths["@hier/views"] = [path.join(import.meta.dirname, "proposal.d.ts")];
}
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
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  host.readFile = (f) => (path.resolve(f) === file ? text : read(f));
  const program = ts.createProgram([file], options, host);
  return {
    diagnostics: ts.getPreEmitDiagnostics(program).map(describe),
    inputs: program.getSourceFiles().map((f) => path.resolve(f.fileName)),
  };
}
const markers = original.split("\n").flatMap((line, index) => {
  const found = line.match(/@ts-expect-error (SPI\d+):/);
  return found ? [{ id: found[1], line: index + 2 }] : [];
});
assert.equal(markers.length, 42, "fixed semantic negative inventory");
assert.equal(new Set(markers.map((m) => m.id)).size, markers.length);
const positive = compile(original);
const report = {
  kind: "B-SourceView-position-interaction-types",
  mode,
  product,
  tools,
  react,
  typescript: ts.version,
  planned: markers.length,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  stage: "positive-public-capability",
  positive: positive.diagnostics,
  inputs: positive.inputs,
  semantic: [],
};
if (positive.diagnostics.length) {
  report.exitCode = 1;
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
const existingInputs = positive.inputs.filter((f) => fs.existsSync(f));
const realInputs = existingInputs.map((f) => fs.realpathSync(f));
assert.ok(realInputs.includes(react), "real React declaration input required");
assert.ok(
  realInputs.includes(
    fs.realpathSync(
      path.join(
        product,
        "web/packages/viewmodel/dist/source-document-types.d.ts",
      ),
    ),
  ),
  "real production SourceDocument declaration required",
);
assert.equal(
  realInputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
  false,
  "no Node/Electron ambient declaration inputs",
);
const proposal = fs.realpathSync(
  path.join(import.meta.dirname, "proposal.d.ts"),
);
assert.equal(
  realInputs.includes(proposal),
  mode === "proposal",
  "production must never substitute the B proposal",
);
for (const marker of markers) {
  const text = original.replace(
    "@ts-expect-error " + marker.id + ":",
    "B removed " + marker.id + ":",
  );
  const negative = compile(text);
  const passed =
    negative.diagnostics.length > 0 &&
    negative.diagnostics.every(
      (d) =>
        d.file === file &&
        d.line === marker.line &&
        ![2305, 2307, 2578].includes(d.code),
    );
  report.executed++;
  report[passed ? "passed" : "failed"]++;
  report.semantic.push({
    id: marker.id,
    passed,
    diagnostics: negative.diagnostics,
  });
}
report.stage = "semantic-types";
report.exitCode = report.failed ? 1 : 0;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
