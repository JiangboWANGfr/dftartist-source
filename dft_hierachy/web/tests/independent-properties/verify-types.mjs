import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? "."),
  mode = process.argv[2] ?? "production";
assert.ok(["proposal", "production"].includes(mode));
const require = createRequire(path.join(product, "web/package.json")),
  ts = require("typescript");
const here = import.meta.dirname,
  file = path.join(here, "types.ts"),
  virtual = path.join(here, "approved-contract.virtual.d.ts");
// This is ONLY the C-reviewed public declaration, not an A consumer or witness.
const declaration = execFileSync(
  "git",
  [
    "show",
    "68955ff5f514622d8187ba182130bdac98b2cf79:web/contracts/m5-instance-properties.d.ts",
  ],
  { cwd: here, encoding: "utf8" },
);
const source = fs.readFileSync(file, "utf8");
const paths = Object.fromEntries(
  ["client", "protocol-types", "viewmodel"].map((n) => [
    "@hier/" + n,
    [path.join(product, "web/packages", n, "dist/index.d.ts")],
  ]),
);
paths["@B/instance-properties"] = [
  mode === "proposal"
    ? virtual
    : path.join(product, "web/packages/viewmodel/dist/index.d.ts"),
];
const options = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  skipLibCheck: false,
  noUncheckedIndexedAccess: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  types: [],
  baseUrl: here,
  paths,
};
let platformFiles = [];
function compile(text) {
  const host = ts.createCompilerHost(options),
    read = host.readFile.bind(host),
    exists = host.fileExists.bind(host);
  host.readFile = (p) =>
    p === file ? text : p === virtual ? declaration : read(p);
  host.fileExists = (p) => p === virtual || exists(p);
  const program = ts.createProgram([file], options, host);
  platformFiles = program
    .getSourceFiles()
    .map((f) => f.fileName)
    .filter((p) =>
      /[\\/]node_modules[\\/](?:@types[\\/](?:node|react|react-dom|electron)|electron)[\\/]/.test(
        p,
      ),
    );
  return ts.getPreEmitDiagnostics(program);
}
const format = (ds) =>
  ds.map((d) => ({
    code: d.code,
    file: d.file?.fileName,
    line:
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : undefined,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
const report = {
  mode,
  typescript: ts.version,
  proposalCommit: "68955ff5f514622d8187ba182130bdac98b2cf79",
  proposalSHA256: createHash("sha256").update(declaration).digest("hex"),
  negativeCases: 22,
  negativeCasesExecuted: 0,
};
try {
  const positive = compile(source);
  assert.deepEqual(
    platformFiles,
    [],
    "consumer must not import platform types",
  );
  report.positiveDiagnostics = format(positive);
  assert.equal(
    positive.length,
    0,
    "independent strict consumer must compile before negatives count",
  );
  const markers = [
    ...source.matchAll(/\/\/ @ts-expect-error (IP-T\d+):[^\n]*\n/g),
  ];
  assert.equal(markers.length, 22);
  const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.ES2022,
      true,
    ),
    ranges = markers.map((m) => {
      const next = parsed.statements.find(
        (s) => s.getStart(parsed) >= m.index + m[0].length,
      );
      assert.ok(next);
      return { id: m[1], start: next.getStart(parsed), end: next.end };
    });
  const replaced = source.replaceAll("@ts-expect-error", "B-negative-only");
  const negative = compile(replaced);
  // Comments become one character shorter; compare diagnostic source line against statement line span.
  const spans = ranges.map((r) => ({
    ...r,
    lineStart: parsed.getLineAndCharacterOfPosition(r.start).line + 1,
    lineEnd: parsed.getLineAndCharacterOfPosition(r.end).line + 1,
  }));
  const diagnostics = format(negative);
  for (const r of spans)
    assert.ok(
      diagnostics.some(
        (d) => d.file === file && d.line >= r.lineStart && d.line <= r.lineEnd,
      ),
      r.id + " real rejection required",
    );
  assert.ok(
    diagnostics.every(
      (d) =>
        d.file === file &&
        spans.some((r) => d.line >= r.lineStart && d.line <= r.lineEnd),
    ),
    "unrelated diagnostics cannot substitute",
  );
  report.negativeCasesExecuted = 22;
  report.negativeDiagnostics = diagnostics;
  assert.deepEqual(platformFiles, []);
  report.platformTypeDependencies = platformFiles.length;
  report.exitCode = 0;
} catch (error) {
  report.exitCode = 1;
  report.error = error.message;
}
process.exitCode = report.exitCode;
console.log(JSON.stringify(report, null, 2));
