import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { documents } from "./cases.mjs";
import { success } from "../source-data.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(P);
const ts = createRequire(path.join(P, "web/package.json"))("typescript");
const file = path.join(import.meta.dirname, "B-Q2-values.virtual.ts");
const content =
  'import type {SourceDocumentState} from "@hier/viewmodel";\nconst values=' +
  JSON.stringify(Object.values(documents).map(success)) +
  " as const satisfies readonly SourceDocumentState[];void values;";
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  paths: Object.fromEntries(
    ["client", "protocol-types", "viewmodel"].map((n) => [
      "@hier/" + n,
      [path.join(P, "web/packages", n, "dist/index.d.ts")],
    ]),
  ),
};
const host = ts.createCompilerHost(options),
  read = host.readFile,
  exists = host.fileExists;
host.readFile = (f) => (path.resolve(f) === file ? content : read(f));
host.fileExists = (f) => path.resolve(f) === file || exists(f);
const program = ts.createProgram([file], options, host),
  diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ({
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
assert.deepEqual(diagnostics, []);
const inputs = program.getSourceFiles().map((f) => path.resolve(f.fileName));
assert.ok(inputs.some((f) => f.endsWith("/source-document-types.d.ts")));
assert.equal(
  inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
  false,
);
console.log(
  JSON.stringify(
    {
      fixtureValues: 8,
      diagnostics,
      typescript: ts.version,
      inputs,
      productExecution: 0,
    },
    null,
    2,
  ),
);
