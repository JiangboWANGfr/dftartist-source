// B independent compile oracle, DESIGN 6.16. Never loads A's contract consumers.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const mode = process.argv[2],
  positiveOnly = process.argv.includes("--positive-only");
assert.ok(["proposal", "production"].includes(mode), "explicit mode");
assert.ok(
  !positiveOnly || mode === "proposal",
  "positive-only is proposal facility debug, never production",
);
assert.ok(process.argv.slice(3).every((x) => x === "--positive-only"));
const product = process.env.HIER_B_PRODUCT_ROOT,
  tools = process.env.HIER_B_BROWSER_TOOLS;
assert.ok(product && tools, "explicit product and fixed readonly tools");
const require = createRequire(path.join(tools, "package.json")),
  ts = require("typescript");
const file = path.join(import.meta.dirname, "types.ts");
const proposal = path.join(import.meta.dirname, "proposal.d.ts");
const original = fs.readFileSync(file, "utf8");
const paths = Object.fromEntries(
  ["protocol-types", "client", "viewmodel"].map((name) => [
    "@hier/" + name,
    [path.join(product, "web/packages", name, "dist/index.d.ts")],
  ]),
);
paths["@b26/protocol-base"] = [
  path.join(product, "web/packages/protocol-types/dist/index.d.ts"),
];
if (mode === "proposal") paths["@hier/protocol-types"] = [proposal];
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
function compile(text) {
  const host = ts.createCompilerHost(options),
    read = host.readFile;
  host.readFile = (f) => (path.resolve(f) === file ? text : read(f));
  const program = ts.createProgram([file], options, host);
  return {
    diagnostics: ts.getPreEmitDiagnostics(program).map((d) => ({
      file: d.file ? path.resolve(d.file.fileName) : null,
      line:
        d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
          : null,
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    })),
    inputs: program.getSourceFiles().map((f) => path.resolve(f.fileName)),
  };
}
const markers = original.split("\n").flatMap((line, index) => {
  const found = line.match(/@ts-expect-error (RK\d+):/);
  return found ? [{ id: found[1], line: index + 2 }] : [];
});
assert.equal(markers.length, 40);
assert.equal(new Set(markers.map((m) => m.id)).size, 40);
const positive = compile(original);
const report = {
  kind: "B SourceRefKind independent types",
  mode,
  product,
  tools,
  proposalFacilityOnly: mode === "proposal",
  positiveOnly,
  typescript: ts.version,
  planned: 40,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  stage: "positive-public-capability",
  positive: positive.diagnostics,
  inputs: positive.inputs,
  semantic: [],
  exitCode: 1,
};
if (positive.diagnostics.length) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
const inputs = positive.inputs
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.realpathSync(f));
assert.equal(inputs.includes(fs.realpathSync(proposal)), mode === "proposal");
assert.ok(
  inputs.includes(
    fs.realpathSync(
      path.join(
        product,
        "web/packages/protocol-types/dist/wire.generated.d.ts",
      ),
    ),
  ),
);
assert.ok(
  inputs.includes(
    fs.realpathSync(
      path.join(product, "web/packages/viewmodel/dist/selection-types.d.ts"),
    ),
  ),
);
assert.equal(
  inputs.some((f) =>
    /node_modules\/(?:@types\/(?:node|react)|electron)\//.test(f),
  ),
  false,
  "no Node/React/Electron ambient",
);
if (!positiveOnly)
  for (const marker of markers) {
    const result = compile(
      original.replace(
        "@ts-expect-error " + marker.id + ":",
        "B removed " + marker.id + ":",
      ),
    );
    const passed =
      result.diagnostics.length > 0 &&
      result.diagnostics.every(
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
      diagnostics: result.diagnostics,
    });
  }
report.stage = positiveOnly
  ? "proposal-positive-facility-debug"
  : "semantic-types";
report.exitCode = report.failed ? 1 : 0;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
