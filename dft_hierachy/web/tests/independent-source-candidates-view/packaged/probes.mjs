// Executed FROM the actual outside consumer, not the source workspace.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { cases, negativeCases } from "./cases.mjs";
import {
  inside,
  compilePositive,
  compileNegative,
  peer,
  typeInput,
  cssSyntax,
} from "./assertions.mjs";
const consumer = fs.realpathSync(process.cwd()),
  tools = fs.realpathSync(process.argv[2]),
  npm = fs.realpathSync(process.argv[3]),
  tool = createRequire(tools + "/package.json"),
  ts = tool("typescript"),
  semver = createRequire(npm)("semver"),
  esm = createRequire(consumer + "/package.json");
assert.equal(
  fs.realpathSync(import.meta.dirname),
  consumer,
  "consumer script is physically outside workspace",
);
const result = {
  kind: "B45-actual-installed-tarball-capability-probes",
  consumer,
  typescript: ts.version,
  planned: 4,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 4,
  skipped: 0,
  results: [],
  negativeTypes: {
    planned: 6,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: 6,
    skipped: 0,
    results: [],
  },
  productionCandidateUIExecuted: 0,
  CoreExecuted: 0,
  ElectronExecuted: 0,
  oldRootControl: false,
  oldTypeControl: false,
};
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
};
function compile(name) {
  const file = consumer + "/" + name,
    program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ({
    file: d.file ? fs.realpathSync(d.file.fileName) : null,
    line:
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : null,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
  const inputs = program
      .getSourceFiles()
      .map((f) => fs.realpathSync(f.fileName)),
    lib = fs.realpathSync(
      path.dirname(tool.resolve("typescript/lib/typescript.js")),
    );
  for (const source of program.getSourceFiles())
    typeInput(
      fs.realpathSync(source.fileName),
      consumer,
      lib,
      program.isSourceFileDefaultLibrary(source),
    );
  const publicDeclarations = {};
  for (const spec of ["@hier/views", "react"]) {
    const resolved = ts.resolveModuleName(
      spec,
      file,
      options,
      ts.sys,
    ).resolvedModule;
    assert(resolved, "public declaration resolves: " + spec);
    const real = fs.realpathSync(resolved.resolvedFileName);
    inside(real, consumer);
    assert(
      inputs.includes(real),
      "actual public declaration consumed: " + spec,
    );
    publicDeclarations[spec] = real;
  }
  assert(
    !inputs.some((f) => /\/node_modules\/(?:@types\/node|electron)\//.test(f)),
    "no Node/Electron ambient fallback",
  );
  return {
    file,
    diagnostics,
    inputs,
    publicDeclarations,
    options,
    sourceGuard: true,
  };
}
async function group(id, fn) {
  result.executed++;
  result.blocked--;
  const row = { id, executed: true, pass: false };
  try {
    row.detail = await fn();
    row.pass = true;
    result.passed++;
  } catch (e) {
    row.error = String(e.stack ?? e);
    result.failed++;
  }
  result.results.push(row);
}
await group("PK01", async () => {
  const views = await import("@hier/views");
  assert.equal(
    typeof views.SourceView,
    "function",
    "old public SourceView retained",
  );
  assert.equal(
    views.VIEWS_PROTOCOL_VERSION,
    2,
    "old version constant meaning retained",
  );
  result.oldRootControl = true;
  const entry = fs.realpathSync(
    fileURLToPath(import.meta.resolve("@hier/views")),
  );
  inside(entry, consumer);
  result.rootEntry = entry;
  assert.equal(
    typeof views.SourceCandidatesView,
    "function",
    "missing public SourceCandidatesView runtime export",
  );
  return { entry, componentModuleOnly: true, componentCalled: false };
});
await group("PK02", () => {
  result.oldTypes = compile("old-positive.ts");
  compilePositive(result.oldTypes);
  result.oldTypeControl = true;
  result.types = compile("positive.ts");
  compilePositive(result.types);
  for (const c of negativeCases) {
    const file = consumer + "/" + c.id + ".ts";
    fs.writeFileSync(file, c.source);
    const n = result.negativeTypes;
    n.executed++;
    n.blocked--;
    try {
      const actual = compile(c.id + ".ts");
      compileNegative(actual, fs.realpathSync(file), c.code);
      n.results.push({ id: c.id, pass: true, report: actual });
      n.passed++;
    } catch (e) {
      n.results.push({ id: c.id, pass: false, error: String(e.stack ?? e) });
      n.failed++;
    }
  }
  assert.equal(
    result.negativeTypes.failed,
    0,
    "all isolated public type semantics",
  );
  return { positive: true, negativeTypes: result.negativeTypes };
});
await group("PK03", async () => {
  const url = import.meta.resolve("@hier/views/source-candidates-view.css"),
    file = fs.realpathSync(fileURLToPath(url));
  inside(file, consumer);
  assert(fs.statSync(file).isFile(), "public CSS file");
  const css = fs.readFileSync(file);
  assert(css.length && css.toString().trim(), "nonempty public candidate CSS");
  const parsed = await tool("esbuild").transform(css.toString(), {
    loader: "css",
    logLevel: "silent",
  });
  result.css = { url, file, bytes: css.length, warnings: parsed.warnings };
  cssSyntax(parsed);
  return {
    file,
    bytes: css.length,
    parsedWithoutSyntaxErrorWarnings: true,
    visualOrFocusValidated: false,
  };
});
await group("PK04", () => {
  const views = consumer + "/node_modules/@hier/views",
    manifest = JSON.parse(fs.readFileSync(views + "/package.json"));
  peer(manifest, semver);
  const hostReact = fs.realpathSync(esm.resolve("react")),
    viewsReact = fs.realpathSync(
      createRequire(views + "/package.json").resolve("react"),
    ),
    domReact = fs.realpathSync(
      createRequire(consumer + "/node_modules/react-dom/package.json").resolve(
        "react",
      ),
    );
  assert.equal(viewsReact, hostReact, "views sees actual host React");
  assert.equal(domReact, hostReact, "renderer sees same host React");
  inside(hostReact, consumer);
  assert.equal(esm("react/package.json").version, "18.3.1");
  assert.equal(esm("react-dom/package.json").version, "18.3.1");
  const found = [];
  function scan(nodeModules) {
    for (const e of fs.readdirSync(nodeModules, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const folder = path.join(nodeModules, e.name);
      if (e.name.startsWith("@")) {
        for (const name of fs.readdirSync(folder))
          visit(path.join(folder, name));
      } else if (e.isDirectory() || e.isSymbolicLink()) visit(folder);
    }
  }
  function visit(folder) {
    assert(
      !fs.lstatSync(folder).isSymbolicLink(),
      "installed package is a tarball, not workspace link",
    );
    const real = fs.realpathSync(folder);
    inside(real, consumer);
    const m = JSON.parse(fs.readFileSync(folder + "/package.json"));
    if (m.name === "react") found.push(real); // NOT @types/react or a path-name regex.
    if (fs.existsSync(folder + "/node_modules")) scan(folder + "/node_modules");
  }
  scan(consumer + "/node_modules");
  assert.deepEqual(found, [fs.realpathSync(consumer + "/node_modules/react")]);
  const tree = JSON.parse(fs.readFileSync(consumer + "/peer-tree.json"));
  assert.equal(tree.status, 0, "actual npm ls peer tree");
  result.peerTree = tree;
  return {
    range: manifest.peerDependencies.react,
    hostReact,
    viewsReact,
    domReact,
    realReactInstallations: found,
    semver: semver.SEMVER_SPEC_VERSION,
  };
});
result.exitCode = result.failed ? 1 : 0;
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.exitCode;
