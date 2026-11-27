import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { cases, negativeCases } from "./cases.mjs";
import {
  inside,
  compilePositive,
  compileNegative,
  peer,
  typeInput,
  cssSyntax,
} from "./assertions.mjs";
test("B45 four package capability probes", () =>
  assert.deepEqual(
    cases.map((c) => c.id),
    ["PK01", "PK02", "PK03", "PK04"],
  ));
test("B45 six distinct independent negative consumer sources", () =>
  assert.deepEqual(
    negativeCases.map((c) => c.id),
    ["NK01", "NK02", "NK03", "NK04", "NK05", "NK06"],
  ));
test("B45 zero positive diagnostics accepted", () =>
  compilePositive({ diagnostics: [] }));
test("B45 missing public export is NOT a positive type pass", () =>
  assert.throws(() => compilePositive({ diagnostics: [{ code: 2305 }] })));
test("B45 intended isolated negative accepted", () =>
  compileNegative(
    { diagnostics: [{ file: "input.ts", code: 2540 }] },
    "input.ts",
    2540,
  ));
for (const [name, result] of [
  ["missing export", { diagnostics: [{ file: "input.ts", code: 2305 }] }],
  ["unrelated file", { diagnostics: [{ file: "other.ts", code: 2540 }] }],
  ["global diagnostic", { diagnostics: [{ file: null, code: 2540 }] }],
  [
    "extra diagnostic",
    {
      diagnostics: [
        { file: "input.ts", code: 2540 },
        { file: "input.ts", code: 2305 },
      ],
    },
  ],
])
  test("B45 rejects negative false green: " + name, () =>
    assert.throws(() => compileNegative(result, "input.ts", 2540)),
  );
test("B45 copied consumer path accepted", () =>
  inside("/actual/consumer/node_modules/pkg/index.d.ts", "/actual/consumer"));
test("B45 source or prefix-collision input rejected", () => {
  for (const f of [
    "/actual/consumer2/node_modules/p.d.ts",
    "/workspace/p.d.ts",
  ])
    assert.throws(() => inside(f, "/actual/consumer"));
});
const tools = createRequire(process.env.HIER_B_BROWSER_TOOLS + "/package.json"),
  ts = tools("typescript"),
  compilerDeclaration = fs.realpathSync(tools.resolve("typescript")),
  compilerLib = path.dirname(compilerDeclaration),
  compilerTypes = path.join(compilerLib, "typescript.d.ts"),
  program = ts.createProgram([compilerTypes], {
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
  });
test("B45 actual compiler default libraries accepted", () => {
  const libraries = program
    .getSourceFiles()
    .filter((f) => program.isSourceFileDefaultLibrary(f));
  assert(libraries.length > 1);
  for (const source of libraries)
    assert.equal(
      typeInput(
        fs.realpathSync(source.fileName),
        "/outside-consumer",
        compilerLib,
        true,
      ),
      "standard-library",
    );
});
test("B45 actual nonstandard compiler declaration rejected", () => {
  const source = program.getSourceFile(compilerTypes);
  assert(source);
  assert.equal(program.isSourceFileDefaultLibrary(source), false);
  assert.throws(() =>
    typeInput(
      fs.realpathSync(source.fileName),
      "/outside-consumer",
      compilerLib,
      false,
    ),
  );
});
test("B45 library-name and default-flag alone do not bypass boundary", () => {
  assert.throws(() =>
    typeInput(compilerTypes, "/outside-consumer", compilerLib, true),
  );
  assert.throws(() =>
    typeInput(
      "/fake-lib/lib.es2022.d.ts",
      "/outside-consumer",
      compilerLib,
      true,
    ),
  );
  assert.throws(() =>
    typeInput(
      path.join(compilerLib, "lib.es2022.d.ts"),
      "/outside-consumer",
      compilerLib,
      false,
    ),
  );
});
test("B45 consumer type input needs no standard-library exemption", () =>
  assert.equal(
    typeInput(
      "/outside-consumer/positive.ts",
      "/outside-consumer",
      compilerLib,
      false,
    ),
    "consumer",
  ));
test("B45 actual pinned CSS parser valid control", async () => {
  const parsed = await tools("esbuild").transform(".outside { color: red; }", {
    loader: "css",
    logLevel: "silent",
  });
  cssSyntax(parsed);
});
test("B45 actual pinned CSS syntax warning cannot pass", async () => {
  const parsed = await tools("esbuild").transform(".outside { color: red;", {
    loader: "css",
    logLevel: "silent",
  });
  assert(parsed.warnings.some((warning) => warning.id === "css-syntax-error"));
  assert.throws(() => cssSyntax(parsed));
});
const npm = fs.realpathSync(
    process.env.HIER_B_NPM_BIN ?? "/opt/homebrew/bin/npm",
  ),
  semver = createRequire(npm)("semver");
test("B45 equivalent peer range accepted; not an exact string spelling", () =>
  peer({ peerDependencies: { react: "^18.3.1" } }, semver));
for (const [name, m] of [
  ["wrong major", { peerDependencies: { react: ">=19" } }],
  [
    "private runtime",
    {
      peerDependencies: { react: ">=18.3.1 <19" },
      dependencies: { react: "18.3.1" },
    },
  ],
  [
    "bundled runtime",
    {
      peerDependencies: { react: ">=18.3.1 <19" },
      bundledDependencies: ["react"],
    },
  ],
])
  test("B45 rejects " + name, () => assert.throws(() => peer(m, semver)));
