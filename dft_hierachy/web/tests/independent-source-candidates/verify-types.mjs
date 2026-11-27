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
          expected: "real TypeScript semantic diagnostic at consumer",
          basis: "§6.11 public declarations",
        })),
      },
      null,
      2,
    ),
  );
else {
  const proposal = process.argv.includes("--proposal"),
    report = {
      kind: proposal
        ? "isolated-PROPOSAL-type-controls-NOT-approval-or-production"
        : "public-source-candidates-model-types",
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
      ts = require("typescript");
    const filename = path.join(
        product,
        "web/B-independent-candidates-consumer.mts",
      ),
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
    if (proposal)
      options.paths = {
        "B-isolated-candidates-proposal": [
          path.join(product, "web/contracts/m5-source-candidates.d.ts"),
        ],
      };
    function compile(text) {
      // Only the explicit proposal control changes the consumer import. The
      // proposal's own @hier/viewmodel import must still resolve the real public
      // TreeDiagnosticIssue, not recursively alias back to the Candidates proposal.
      if (proposal)
        text = text.replace(
          'from "@hier/viewmodel"',
          'from "B-isolated-candidates-proposal"',
        );
      const host = ts.createCompilerHost(options),
        read = host.readFile,
        exists = host.fileExists,
        get = host.getSourceFile;
      host.readFile = (p) => (p === filename ? text : read(p));
      host.fileExists = (p) => p === filename || exists(p);
      host.getSourceFile = (p, lang, onError, newFile) =>
        p === filename
          ? ts.createSourceFile(p, text, lang, true, ts.ScriptKind.TS)
          : get(p, lang, onError, newFile);
      const program = ts.createProgram([filename], options, host);
      assert.equal(program.getSyntacticDiagnostics().length, 0);
      return ts.getPreEmitDiagnostics(program).map((d) => ({
        code: d.code,
        file: d.file?.fileName,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      }));
    }
    report.positive = compile(positive);
    assert.deepEqual(
      report.positive,
      [],
      "positive public consumer must succeed BEFORE negatives",
    );
    report.stage = "semantic-negatives";
    for (const [id, input] of negatives) {
      const diagnostics = compile(positive + "\n" + input);
      assert.ok(
        diagnostics.some(
          (d) => d.file === filename && ![2307, 2305].includes(d.code),
        ),
        id,
      );
      report.executedNegative++;
      report.results.push({ id, diagnostics });
    }
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = String(e?.message ?? e);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
