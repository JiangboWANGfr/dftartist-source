import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const consumer = path.join(root, "m5-source-navigation.consumer.ts");
const config = ts.readConfigFile(
  path.join(root, "tsconfig.source-navigation.json"),
  ts.sys.readFile,
);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(parsed.errors, []);
const source = fs.readFileSync(consumer, "utf8");
function compile(text) {
  const host = ts.createCompilerHost(parsed.options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, fresh) =>
    path.resolve(file) === consumer
      ? ts.createSourceFile(file, text, version, true)
      : getSourceFile(file, version, onError, fresh);
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  assert.equal(program.getSyntacticDiagnostics().length, 0);
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
}
const positive = compile(source);
assert.deepEqual(
  positive.diagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  ),
  [],
);
const platform = positive.program
  .getSourceFiles()
  .filter((file) =>
    /[/\\]node_modules[/\\](?:@types[/\\](?:node|react)|electron)[/\\]/.test(
      file.fileName,
    ),
  );
assert.deepEqual(
  platform.map((file) => file.fileName),
  [],
);
const checks = [];
for (const marker of source.matchAll(/^.*\/\/ @ts-expect-error (N\d+).*$/gm)) {
  const guardedLine = source.slice(0, marker.index).split("\n").length + 1;
  const modified =
    source.slice(0, marker.index) +
    " ".repeat(marker[0].length) +
    source.slice(marker.index + marker[0].length);
  const { diagnostics } = compile(modified);
  const located = diagnostics.filter(
    (d) =>
      d.file &&
      path.resolve(d.file.fileName) === consumer &&
      d.start !== undefined &&
      d.file.getLineAndCharacterOfPosition(d.start).line + 1 === guardedLine,
  );
  assert.ok(
    located.length > 0,
    `${marker[1]} must be rejected on line ${guardedLine}`,
  );
  assert.ok(
    located.every((d) => ![2305, 2307, 2578].includes(d.code)),
    `${marker[1]} requires a semantic diagnostic, not missing imports or an unused directive`,
  );
  assert.ok(
    diagnostics.every((d) => located.includes(d)),
    `${marker[1]} unrelated diagnostic`,
  );
  checks.push({
    id: marker[1],
    guardedLine,
    diagnosticCodes: located.map((d) => d.code),
  });
}
assert.deepEqual(
  checks.map((x) => x.id),
  Array.from({ length: 28 }, (_, i) => `N${String(i + 1).padStart(2, "0")}`),
);
console.log(
  JSON.stringify(
    {
      positiveDiagnostics: 0,
      rejectedNegativeCases: checks.length,
      platformTypeDependencies: platform.length,
      runtimeExecuted: false,
      checks,
    },
    null,
    2,
  ),
);
