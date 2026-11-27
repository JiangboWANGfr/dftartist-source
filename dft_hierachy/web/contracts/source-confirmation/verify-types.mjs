// A proposal type evidence only; not B freeze or production interaction tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL(".", import.meta.url));
const consumer = fs.realpathSync(path.join(root, "consumer.ts"));
const config = ts.readConfigFile(
  path.join(root, "tsconfig.json"),
  ts.sys.readFile,
);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(parsed.errors, []);
const source = fs.readFileSync(consumer, "utf8");
const markers = [...source.matchAll(/^.*\/\/ @ts-expect-error (C\d+).*$/gm)];
assert.deepEqual(
  markers.map((m) => m[1]),
  Array.from({ length: 23 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
);

function compile(text) {
  const host = ts.createCompilerHost(parsed.options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, fresh) =>
    ts.sys.fileExists(file) && fs.realpathSync(file) === consumer
      ? ts.createSourceFile(file, text, version, true)
      : original(file, version, onError, fresh);
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
}
const positive = compile(source);
assert.deepEqual(
  positive.diagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  ),
  [],
);
const dependencies = positive.program.getSourceFiles().map((f) => f.fileName);
assert.equal(
  dependencies.filter((f) =>
    /[/\\]node_modules[/\\](?:@types[/\\]node|electron)[/\\]/.test(f),
  ).length,
  0,
);
for (const suffix of [
  "protocol-types/dist/wire.generated.d.ts",
  "viewmodel/dist/selection-types.d.ts",
])
  assert.ok(
    dependencies.some((f) => f.replaceAll("\\", "/").endsWith(suffix)),
    suffix,
  );
assert.equal(
  dependencies.filter((f) => /[/\\]node_modules[/\\]@types[/\\]react/.test(f))
    .length,
  0,
);
const checks = markers.map((marker) => {
  const line = source.slice(0, marker.index).split("\n").length + 1;
  const { diagnostics } = compile(
    source.slice(0, marker.index) +
      " ".repeat(marker[0].length) +
      source.slice(marker.index + marker[0].length),
  );
  assert.ok(diagnostics.length > 0, marker[1]);
  for (const d of diagnostics) {
    assert.ok(d.file && d.start !== undefined);
    assert.equal(fs.realpathSync(d.file.fileName), consumer);
    assert.equal(d.file.getLineAndCharacterOfPosition(d.start).line + 1, line);
    assert.ok(![2305, 2307, 2578].includes(d.code));
  }
  return {
    id: marker[1],
    line,
    diagnosticCodes: diagnostics.map((d) => d.code),
  };
});
console.log(
  JSON.stringify(
    {
      kind: "A source confirmation proposal types",
      positiveDiagnostics: 0,
      negatives: checks.length,
      checks,
      productionConfirmationImplemented: false,
      actualProtocolAndSelectionTypes: true,
    },
    null,
    2,
  ),
);
