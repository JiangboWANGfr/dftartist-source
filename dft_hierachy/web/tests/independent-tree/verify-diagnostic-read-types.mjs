// Agent B: every directive is removed in memory to verify a real diagnostic.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const mode = process.argv[2] ?? "proposal";
assert.ok(["proposal", "production"].includes(mode));
const config = path.resolve(
  import.meta.dirname,
  "tsconfig.diagnostic-read-" + mode + ".json",
);
const raw = ts.readConfigFile(config, ts.sys.readFile);
assert.equal(raw.error, undefined);
const cfg = ts.parseJsonConfigFileContent(
  raw.config,
  ts.sys,
  path.dirname(config),
);
assert.deepEqual(cfg.errors, []);
const source = path.resolve(import.meta.dirname, "diagnostic-read.ts");
const original = fs.readFileSync(source, "utf8");
const host = ts.createCompilerHost(cfg.options);
const positive = ts.getPreEmitDiagnostics(
  ts.createProgram(cfg.fileNames, cfg.options, host),
);
const describe = (d) => ({
  code: d.code,
  line:
    d.file && d.start !== undefined
      ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
      : null,
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
});
if (positive.length) {
  console.log(
    JSON.stringify(
      { mode, positiveDiagnostics: positive.map(describe) },
      null,
      2,
    ),
  );
  process.exit(1);
}
const lines = original.split("\n"),
  markers = [];
for (let n = 0; n < lines.length; n++) {
  const m = lines[n].match(/@ts-expect-error (D\d+):/);
  if (m) markers.push({ id: m[1], line: n + 2 });
}
assert.equal(markers.length, 14);
const stripped = original.replaceAll(
  "@ts-expect-error",
  "B expectation removed",
);
const negativeHost = ts.createCompilerHost(cfg.options),
  oldRead = negativeHost.readFile;
negativeHost.readFile = (p) =>
  path.resolve(p) === source ? stripped : oldRead(p);
const diagnostics = ts.getPreEmitDiagnostics(
  ts.createProgram(cfg.fileNames, cfg.options, negativeHost),
);
const got = diagnostics
  .filter((d) => d.file && path.resolve(d.file.fileName) === source)
  .map(describe);
for (const marker of markers)
  assert.ok(
    got.some((d) => d.line === marker.line),
    marker.id + " must produce a real diagnostic at its consumer",
  );
assert.ok(
  got.every((d) => markers.some((m) => m.line === d.line)),
  "no unrelated negative diagnostics",
);
console.log(
  JSON.stringify(
    {
      mode,
      positiveDiagnostics: 0,
      negativeChecks: markers.length,
      passed: markers.map((m) => ({
        ...m,
        codes: got.filter((d) => d.line === m.line).map((d) => d.code),
      })),
    },
    null,
    2,
  ),
);
