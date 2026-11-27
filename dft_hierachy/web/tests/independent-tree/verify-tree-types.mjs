// Agent B: executable strict declaration check plus every negative type oracle.
// Reads only the public Tree proposal/production declarations, never A's consumer.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? "proposal";
assert.ok(["proposal", "production"].includes(mode));
const configPath = path.join(here, "tsconfig.tree-" + mode + ".json");
const file = path.join(here, "tree-contract.ts");
const source = fs.readFileSync(file, "utf8");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configFile.error, undefined);
const config = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  here,
  undefined,
  configPath,
);
assert.deepEqual(config.errors, []);
assert.equal(config.options.strict, true);
assert.equal(config.options.exactOptionalPropertyTypes, true);
assert.equal(config.options.skipLibCheck, false);
assert.equal(config.options.noEmit, true);
assert.deepEqual(config.fileNames, [file]);

function compile(override) {
  const host = ts.createCompilerHost(config.options);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) =>
    path.resolve(name) === file && override !== undefined
      ? override
      : readFile(name);
  const program = ts.createProgram(config.fileNames, config.options, host);
  return ts.getPreEmitDiagnostics(program);
}
function diagnosticText(diagnostics) {
  return diagnostics.map((d) => ({
    code: d.code,
    file: d.file?.fileName,
    line:
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : undefined,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
}
const positive = compile();
assert.deepEqual(
  diagnosticText(positive),
  [],
  "B strict positive / annotated consumer must compile",
);
const markers = [];
const lines = source.split("\n");
for (let line = 0; line < lines.length; ++line) {
  const match = lines[line].match(/@ts-expect-error B-(T\d+):/);
  if (match) markers.push({ id: match[1], line: line + 2 });
}
assert.deepEqual(
  markers.map((m) => m.id),
  Array.from({ length: 35 }, (_, n) => "T" + String(n + 1).padStart(2, "0")),
);
const removed = source.replaceAll(/@ts-expect-error/g, "B-negative-only");
const negative = compile(removed);
const diagnostics = diagnosticText(negative);
for (const marker of markers) {
  assert.ok(
    diagnostics.some((d) => d.file === file && d.line === marker.line),
    marker.id + " must produce a real diagnostic",
  );
}
assert.ok(
  diagnostics.every(
    (d) => d.file === file && markers.some((m) => m.line === d.line),
  ),
  "No unrelated import/config/type failures may substitute for negative assertions",
);
console.log(
  JSON.stringify(
    {
      mode,
      typescript: ts.version,
      positiveDiagnostics: positive.length,
      rejectedNegativeCases: markers.length,
      negativeDiagnostics: diagnostics.length,
      assertions: markers.map((m) => ({
        ...m,
        diagnostics: diagnostics
          .filter((d) => d.line === m.line)
          .map((d) => d.code),
      })),
    },
    null,
    2,
  ),
);
