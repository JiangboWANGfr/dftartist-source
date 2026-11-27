import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const contractRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const configFile = path.join(contractRoot, "tsconfig.instance-properties.json");
const consumer = path.join(contractRoot, "m5-instance-properties.consumer.ts");
const config = ts.readConfigFile(configFile, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  contractRoot,
);
assert.deepEqual(parsed.errors, []);
const source = fs.readFileSync(consumer, "utf8");

function compile(text) {
  const host = ts.createCompilerHost(parsed.options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, fresh) =>
    path.resolve(file) === consumer
      ? ts.createSourceFile(file, text, version, true)
      : original(file, version, onError, fresh);
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
}
const base = compile(source);
assert.deepEqual(
  base.diagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  ),
  [],
);
const platformTypes = base.program
  .getSourceFiles()
  .filter((file) =>
    /[/\\]node_modules[/\\](?:@types[/\\](?:node|react)|electron)[/\\]/.test(
      file.fileName,
    ),
  );
assert.deepEqual(
  platformTypes.map((f) => f.fileName),
  [],
);
const checks = [];
for (const marker of source.matchAll(/^.*\/\/ @ts-expect-error (P\d+).*$/gm)) {
  const line = source.slice(0, marker.index).split("\n").length + 1;
  const text =
    source.slice(0, marker.index) +
    " ".repeat(marker[0].length) +
    source.slice(marker.index + marker[0].length);
  const { diagnostics } = compile(text);
  const located = diagnostics.filter(
    (d) =>
      d.file &&
      path.resolve(d.file.fileName) === consumer &&
      d.start !== undefined &&
      d.file.getLineAndCharacterOfPosition(d.start).line + 1 === line,
  );
  assert.ok(
    located.length > 0,
    `${marker[1]} must fail on guarded line ${line}`,
  );
  assert.ok(
    diagnostics.every((d) => located.includes(d)),
    `${marker[1]} unrelated diagnostic`,
  );
  checks.push({
    id: marker[1],
    line,
    diagnosticCodes: located.map((d) => d.code),
  });
}
assert.deepEqual(
  checks.map((x) => x.id),
  Array.from({ length: 18 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`),
);
console.log(
  JSON.stringify(
    {
      positiveDiagnostics: 0,
      rejectedNegativeCases: checks.length,
      platformTypeDependencies: platformTypes.length,
      runtimeExecuted: false,
      checks,
    },
    null,
    2,
  ),
);
