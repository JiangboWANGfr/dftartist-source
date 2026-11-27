import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { positive, negatives } from "./types.mjs";
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        positive,
        count: negatives.length,
        cases: negatives.map(([id, input]) => ({
          id,
          input,
          expected: "actual semantic TypeScript diagnostic",
          basis: "§5.6.5 public identity signature; old consumers unchanged",
        })),
      },
      null,
      2,
    ),
  );
else {
  const report = {
    kind: "B-public-identity-types-NOT-proposal-alias",
    plannedNegative: negatives.length,
    executedNegative: 0,
    skipped: 0,
    stage: "positive-public-types",
    results: [],
  };
  try {
    assert.ok(process.env.HIER_B_PRODUCT_ROOT);
    const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
      require = createRequire(path.join(product, "web/package.json")),
      ts = require("typescript"),
      filename = path.join(product, "web/B-identity-consumer.mts"),
      options = {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        exactOptionalPropertyTypes: true,
        types: [],
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      };
    function compile(text) {
      const host = ts.createCompilerHost(options),
        read = host.readFile,
        exists = host.fileExists,
        get = host.getSourceFile;
      host.readFile = (p) => (p === filename ? text : read(p));
      host.fileExists = (p) => p === filename || exists(p);
      host.getSourceFile = (p, language, onError, newFile) =>
        p === filename
          ? ts.createSourceFile(p, text, language, true, ts.ScriptKind.TS)
          : get(p, language, onError, newFile);
      const program = ts.createProgram([filename], options, host);
      assert.equal(program.getSyntacticDiagnostics().length, 0);
      return ts.getPreEmitDiagnostics(program).map((d) => ({
        code: d.code,
        file: d.file?.fileName,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      }));
    }
    report.positive = compile(positive);
    assert.deepEqual(report.positive, []);
    report.stage = "semantic-negatives";
    for (const [id, input] of negatives) {
      const diagnostics = compile(positive + "\n" + input);
      assert.ok(
        diagnostics.some(
          (d) => d.file === filename && ![2307, 2305].includes(d.code),
        ),
        id,
      );
      report.results.push({ id, diagnostics });
      report.executedNegative++;
    }
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = String(e?.message ?? e);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
