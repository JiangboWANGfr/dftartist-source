import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { positive, negatives } from "./types.mjs";
const proposal = process.argv.includes("--proposal");
const r = {
  kind: "B32-candidates-view-types",
  mode: proposal ? "independent-proposal-NOT-production" : "production",
  planned: negatives.length,
  executed: 0,
  passed: 0,
  blocked: negatives.length,
  skipped: 0,
  results: [],
  stage: "positive",
};
try {
  const P = process.env.HIER_B_PRODUCT_ROOT,
    T = process.env.HIER_B_BROWSER_TOOLS;
  assert.ok(P && T, "explicit fixed product and tools");
  const ts = createRequire(P + "/web/package.json")("typescript");
  const file = P + "/web/B32-candidates-consumer.mts",
    options = {
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      paths: {
        react: [T + "/node_modules/@types/react/index.d.ts"],
        ...Object.fromEntries(
          ["views", "viewmodel", "client", "protocol-types"].map((n) => [
            "@hier/" + n,
            [P + "/web/packages/" + n + "/dist/index.d.ts"],
          ]),
        ),
      },
    };
  if (proposal)
    options.paths["@hier/views"] = [
      path.join(import.meta.dirname, "proposal.d.ts"),
    ];
  function compile(text) {
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
    assert.equal(
      program.getSyntacticDiagnostics().length,
      0,
      "syntactic facility",
    );
    r.inputs = program.getSourceFiles().map((x) => x.fileName);
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
    "missing public names cannot count negative passes",
  );
  assert.ok(r.inputs.some((f) => f.endsWith("@types/react/index.d.ts")));
  assert.ok(r.inputs.includes(P + "/web/packages/viewmodel/dist/index.d.ts"));
  assert.equal(
    r.inputs.some((f) => /node_modules\/(?:@types\/node|electron)\//.test(f)),
    false,
  );
  r.stage = "semantic-negatives";
  for (const [id, input] of negatives) {
    const diagnostics = compile(positive + "\n" + input);
    r.executed++;
    r.blocked--;
    assert.ok(
      diagnostics.some(
        (d) =>
          d.file === file &&
          d.line >= positive.split("\n").length &&
          ![2307, 2305, 2304, 2578].includes(d.code),
      ),
      JSON.stringify({ id, diagnostics }),
    );
    r.passed++;
    r.results.push({
      id,
      input,
      expected: "semantic rejection, not missing capability",
      basis: "DESIGN §6.18.1",
      diagnostics,
    });
  }
  r.exitCode = 0;
} catch (e) {
  r.exitCode = 1;
  r.error = String(e.stack ?? e);
}
console.log(JSON.stringify(r, null, 2));
process.exitCode = r.exitCode;
