import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const consumer = path.join(root, "m5-source-view.consumer.ts");
const config = ts.readConfigFile(
  path.join(root, "tsconfig.source-view.json"),
  ts.sys.readFile,
);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(parsed.errors, []);
const source = fs.readFileSync(consumer, "utf8");
const markers = [...source.matchAll(/^.*\/\/ @ts-expect-error (V\d+).*$/gm)];
assert.deepEqual(
  markers.map((match) => match[1]),
  Array.from({ length: 20 }, (_, i) => `V${String(i + 1).padStart(2, "0")}`),
);

// Replace only this in-memory consumer. All imported types are the real files;
// removing a directive must expose its semantic error on the guarded line.
function compile(text) {
  const host = ts.createCompilerHost(parsed.options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, fresh) =>
    path.resolve(file) === consumer
      ? ts.createSourceFile(file, text, version, true)
      : original(file, version, onError, fresh);
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  assert.deepEqual(program.getSyntacticDiagnostics(), []);
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
}
const positive = compile(source);
assert.deepEqual(
  positive.diagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  ),
  [],
);
const dependencies = positive.program
  .getSourceFiles()
  .map((file) => file.fileName);
const platform = dependencies.filter((file) =>
  /[/\\]node_modules[/\\](?:@types[/\\]node|electron)[/\\]/.test(file),
);
assert.deepEqual(platform, []);
assert.ok(
  dependencies.some((file) => /@types[/\\]react[/\\]index\.d\.ts$/.test(file)),
);
assert.ok(
  dependencies.some((file) =>
    /viewmodel[/\\]dist[/\\]source-document-types\.d\.ts$/.test(file),
  ),
);
const checks = markers.map((marker) => {
  const guardedLine = source.slice(0, marker.index).split("\n").length + 1;
  const { diagnostics } = compile(
    source.slice(0, marker.index) +
      " ".repeat(marker[0].length) +
      source.slice(marker.index + marker[0].length),
  );
  assert.ok(diagnostics.length > 0, `${marker[1]} must be rejected`);
  for (const diagnostic of diagnostics) {
    assert.ok(diagnostic.file && diagnostic.start !== undefined);
    assert.equal(path.resolve(diagnostic.file.fileName), consumer);
    assert.equal(
      diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
      guardedLine,
    );
    assert.ok(
      ![2305, 2307, 2578].includes(diagnostic.code),
      `${marker[1]} must be a semantic error`,
    );
  }
  return {
    id: marker[1],
    guardedLine,
    diagnosticCodes: diagnostics.map((d) => d.code),
  };
});
console.log(
  JSON.stringify(
    {
      positiveDiagnostics: 0,
      rejectedNegativeCases: checks.length,
      nodeOrElectronTypeDependencies: platform.length,
      reactTypesUsed: true,
      productionDocumentTypesUsed: true,
      runtimeExecuted: false,
      checks,
    },
    null,
    2,
  ),
);
