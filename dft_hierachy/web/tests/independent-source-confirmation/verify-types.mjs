import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { positive, negatives } from "./types.mjs";
const proposal = process.argv.includes("--proposal");
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        positive,
        count: negatives.length,
        cases: negatives.map(([id, input]) => ({
          id,
          input,
          expected:
            "semantic consumer diagnostic at appended input (not missing module/export except explicit negative export)",
          basis: "DESIGN §6.17 public declaration",
        })),
      },
      null,
      2,
    ),
  );
else {
  const r = {
    kind: proposal
      ? "B-isolated-proposal-types-NOT-production"
      : "B-public-production-confirmation-types",
    plannedNegative: negatives.length,
    executedNegative: 0,
    blockedNegative: negatives.length,
    skipped: 0,
    results: [],
    stage: "positive",
  };
  try {
    assert.ok(process.env.HIER_B_PRODUCT_ROOT);
    const root = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
      ts = createRequire(root + "/web/package.json")("typescript"),
      file = root + "/web/B-confirmation-consumer.mts",
      decl = fileURLToPath(new URL("proposal.d.ts", import.meta.url));
    const options = {
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
        "B-own-confirmation-proposal": [decl],
        "@hier/viewmodel": [root + "/web/packages/viewmodel/dist/index.d.ts"],
      };
    // Imports inside the independent declaration still target actual prior public
    // packages; only new consumer names alias to B's own proposal.
    const translate = (s) =>
      proposal
        ? s
            .replaceAll(
              'from "@hier/viewmodel";',
              'from "B-own-confirmation-proposal";',
            )
            .replace(
              'import {SelectionModel,type SourceCandidatesPage,type SourceNavigationState,type SourceDocument} from "B-own-confirmation-proposal";',
              'import {SelectionModel,type SourceCandidatesPage,type SourceNavigationState,type SourceDocument} from "@hier/viewmodel";',
            )
            .replaceAll(
              "from '@hier/viewmodel'",
              "from 'B-own-confirmation-proposal'",
            )
        : s;
    function compile(text) {
      text = translate(text);
      const host = ts.createCompilerHost(options),
        read = host.readFile,
        get = host.getSourceFile,
        exists = host.fileExists;
      host.readFile = (p) => (p === file ? text : read(p));
      host.fileExists = (p) => p === file || exists(p);
      host.getSourceFile = (p, l, e, n) =>
        p === file
          ? ts.createSourceFile(p, text, l, true, ts.ScriptKind.TS)
          : get(p, l, e, n);
      const program = ts.createProgram([file], options, host);
      assert.equal(program.getSyntacticDiagnostics().length, 0);
      return ts.getPreEmitDiagnostics(program).map((d) => ({
        code: d.code,
        file: d.file?.fileName,
        line:
          d.file && d.start !== undefined
            ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
            : null,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      }));
    }
    r.positive = compile(positive);
    assert.deepEqual(
      r.positive,
      [],
      "positive first: missing production exports cannot count negative passes",
    );
    r.stage = "negative";
    const line = positive.split("\n").length;
    for (const [id, input] of negatives) {
      const ds = compile(positive + "\n" + input);
      r.currentNegative = { id, diagnostics: ds };
      r.executedNegative++;
      r.blockedNegative = r.plannedNegative - r.executedNegative;
      assert.ok(
        ds.some(
          (d) =>
            d.file === file &&
            d.line >= line &&
            d.code !== 2307 &&
            (id === "no-public-brand" || ![2305, 2304].includes(d.code)),
        ),
        id,
      );
      r.results.push({ id, diagnostics: ds });
    }
    r.blockedNegative = 0;
    delete r.currentNegative;
    r.exitCode = 0;
  } catch (e) {
    r.exitCode = 1;
    r.error = String(e?.stack ?? e);
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
