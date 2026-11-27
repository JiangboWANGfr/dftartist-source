// B outside-consumer gate: real tarballs and the same frozen types/events.
// Proposal declarations and native fixture controls are never product substitutes.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";

assert.ok(
  process.env.HIER_B_PRODUCT_ROOT &&
    process.env.HIER_B_BROWSER_TOOLS &&
    process.env.HIER_B_NPM_BIN,
  "explicit fixed product, readonly tools and npm required",
);
const product = await fs.realpath(process.env.HIER_B_PRODUCT_ROOT);
const tools = await fs.realpath(process.env.HIER_B_BROWSER_TOOLS);
const npm = await fs.realpath(process.env.HIER_B_NPM_BIN);
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "hier-b-source-position-interaction-package-"),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encoded = (bytes) => ({
  bytes: bytes.length,
  sha256: sha(bytes),
  gzipBase64: gzipSync(bytes).toString("base64"),
});
const commands = [];
const groups = [
  { id: "outside-public-types", executed: false, passed: false },
  { id: "outside-trusted-browser", executed: false, passed: false },
];
const result = {
  kind: "B SourceView position interaction real outside tarball consumer",
  product,
  tools,
  npm,
  node: process.version,
  temp,
  planned: 2,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  blocked: 2,
  exitCode: 1,
  stage: "owned-consumer-setup",
  commands,
  groups,
  packs: [],
  cleanupErrors: [],
};
let consumer;
const npmEnv = {
  npm_config_offline: "true",
  npm_config_ignore_scripts: "true",
  npm_config_cache: path.join(temp, "npm-cache"),
  npm_config_userconfig: path.join(temp, "empty.npmrc"),
  npm_config_globalconfig: path.join(temp, "empty-global.npmrc"),
};
async function command(bin, args, cwd, overrides = {}, timeout = 60000) {
  const env = { ...process.env, ...npmEnv, ...overrides, NODE_PATH: "" };
  delete env.NODE_TEST_CONTEXT;
  const started = new Date().toISOString();
  const at = performance.now();
  const out = [];
  const err = [];
  let timedOut = false;
  let outputLimitExceeded = false;
  let outputBytes = 0;
  let spawnError;
  let timer;
  let forceTimer;
  const child = spawn(bin, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const terminate = (signal) => {
    if (!child.pid) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (e) {
      if (e.code !== "ESRCH") spawnError ??= e;
    }
  };
  const stop = () => {
    terminate("SIGTERM");
    forceTimer ??= setTimeout(() => terminate("SIGKILL"), 1000);
  };
  const collect = (chunks) => (chunk) => {
    chunks.push(chunk);
    outputBytes += chunk.length;
    if (outputBytes > 64 * 1024 * 1024 && !outputLimitExceeded) {
      outputLimitExceeded = true;
      stop();
    }
  };
  child.stdout.on("data", collect(out));
  child.stderr.on("data", collect(err));
  const closed = new Promise((resolve) => {
    child.once("error", (e) => {
      spawnError = e;
    });
    child.once("close", (status, signal) => resolve({ status, signal }));
  });
  timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeout);
  const { status, signal } = await closed;
  clearTimeout(timer);
  clearTimeout(forceTimer);
  if (timedOut || outputLimitExceeded) terminate("SIGKILL");
  const stdout = Buffer.concat(out);
  const stderr = Buffer.concat(err);
  const capture = {
    command: [bin, ...args],
    cwd,
    started,
    ended: new Date().toISOString(),
    milliseconds: performance.now() - at,
    status,
    signal,
    timedOut,
    outputLimitExceeded,
    error: spawnError ? String(spawnError.stack ?? spawnError) : null,
    env: {
      ...npmEnv,
      ...overrides,
      NODE_PATH: "",
      NODE_TEST_CONTEXT: null,
    },
    stdout: encoded(stdout),
    stderr: encoded(stderr),
  };
  commands.push(capture);
  return {
    capture: commands.length - 1,
    status,
    signal,
    timedOut,
    outputLimitExceeded,
    error: spawnError,
    stdout: stdout.toString("utf8"),
    stderr: stderr.toString("utf8"),
  };
}
function successful(r) {
  return (
    r.status === 0 &&
    !r.signal &&
    !r.timedOut &&
    !r.outputLimitExceeded &&
    !r.error
  );
}
function required(r, label) {
  assert.ok(successful(r), label + "; raw command capture " + r.capture);
  return r;
}
async function npmCommand(args, cwd) {
  return command(process.execPath, [npm, ...args], cwd);
}
async function pack(folder) {
  const r = required(
    await npmCommand(
      [
        "pack",
        "--offline",
        "--ignore-scripts",
        "--workspaces=false",
        "--json",
        "--pack-destination",
        temp,
      ],
      folder,
    ),
    "real offline npm pack",
  );
  const meta = JSON.parse(r.stdout);
  assert.equal(meta.length, 1, "one real tarball per package");
  assert.equal(path.basename(meta[0].filename), meta[0].filename);
  const tarball = path.join(temp, meta[0].filename);
  const bytes = await fs.readFile(tarball);
  result.packs.push({
    folder,
    name: meta[0].name,
    version: meta[0].version,
    tarball,
    bytes: bytes.length,
    sha256: sha(bytes),
    npmIntegrity: meta[0].integrity,
    commandCapture: r.capture,
  });
  return tarball;
}
async function scanSingletons(nodeModules, expected, found) {
  const directories = [];
  for (const entry of await fs.readdir(nodeModules, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name.startsWith(".")) continue;
    const folder = path.join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      for (const scoped of await fs.readdir(folder))
        directories.push(path.join(folder, scoped));
    } else directories.push(folder);
  }
  for (const folder of directories) {
    const manifest = JSON.parse(
      await fs.readFile(path.join(folder, "package.json"), "utf8"),
    );
    const real = await fs.realpath(folder);
    assert.ok(real.startsWith(consumer + path.sep), "no external package link");
    if (Object.hasOwn(expected, manifest.name)) {
      assert.equal(real, expected[manifest.name], "one " + manifest.name);
      found.add(manifest.name);
    }
    const nested = path.join(folder, "node_modules");
    try {
      await fs.access(nested);
      await scanSingletons(nested, expected, found);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}
function childReport(r) {
  assert.ok(!r.error && !r.signal && !r.timedOut && !r.outputLimitExceeded);
  return JSON.parse(r.stdout);
}
const compileSource = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  'import assert from "node:assert/strict";',
  'import {createRequire} from "node:module";',
  "const tools=process.argv[2], consumer=fs.realpathSync(process.cwd());",
  'const require=createRequire(path.join(tools,"package.json"));',
  'const ts=require("typescript");',
  'const file=path.join(consumer,"types.ts");',
  'const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,noEmit:true,skipLibCheck:false,types:[],lib:["lib.es2022.d.ts","lib.dom.d.ts"]};',
  "const program=ts.createProgram([file],options);",
  'const positive=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file?path.resolve(d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,"\\n")}));',
  "const inputs=program.getSourceFiles().map(f=>fs.realpathSync(f.fileName));",
  'const react=fs.realpathSync(path.join(consumer,"node_modules/@types/react/index.d.ts"));',
  'assert.ok(inputs.includes(react),"actual copied React types required");',
  'assert.ok(inputs.includes(fs.realpathSync(path.join(consumer,"node_modules/@hier/viewmodel/dist/source-document-types.d.ts"))),"tarball SourceDocument declaration required");',
  'assert.ok(inputs.includes(fs.realpathSync(path.join(consumer,"node_modules/@hier/views/dist/index.d.ts"))),"tarball public views declaration required");',
  'const lib=fs.realpathSync(path.dirname(require.resolve("typescript/lib/typescript.js")))+path.sep;',
  'assert.ok(inputs.every(f=>f.startsWith(consumer+path.sep)||f.startsWith(lib)),"no monorepo/proposal declaration fallback");',
  'assert.equal(inputs.some(f=>/node_modules\\/(?:@types\\/node|electron)\\//.test(f)),false,"no Node/Electron ambient");',
  "const exitCode=positive.length?1:0;",
  'console.log(JSON.stringify({kind:"B outside tarball positive type consumer",typescript:ts.version,consumer,react,options,inputs,positive,semanticNegativesExecuted:0,exitCode},null,2));',
  "process.exitCode=exitCode;",
].join("\n");

try {
  await fs.writeFile(path.join(temp, "empty.npmrc"), "");
  await fs.writeFile(path.join(temp, "empty-global.npmrc"), "");
  const packs = [];
  for (const name of ["protocol-types", "client", "viewmodel", "views"])
    packs.push(await pack(path.join(product, "web/packages", name)));
  // Include the complete local React runtime dependency closure, not registry/cache.
  const runtimePackages = new Map();
  async function runtime(name, from = tools) {
    const require = createRequire(path.join(from, "package.json"));
    const manifestFile = require.resolve(name + "/package.json");
    const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    const previous = runtimePackages.get(manifest.name);
    if (previous) {
      assert.equal(
        previous.version,
        manifest.version,
        "one local runtime version",
      );
      return;
    }
    const folder = path.dirname(manifestFile);
    runtimePackages.set(manifest.name, { version: manifest.version, folder });
    for (const dependency of Object.keys(manifest.dependencies ?? {}))
      await runtime(dependency, folder);
  }
  await runtime("react");
  await runtime("react-dom");
  // A51 build input only; all frozen consumer assertions remain unchanged.
  await runtime("@tanstack/virtual-core", path.join(product, "web"));
  // Existing exact M6 runtime dependency; empty-cache/offline assertions stay unchanged.
  await runtime("elkjs", path.join(product, "web"));
  for (const { folder } of runtimePackages.values())
    packs.push(await pack(folder));
  const consumerPath = path.join(temp, "outside consumer 空格 中文");
  await fs.mkdir(consumerPath);
  consumer = await fs.realpath(consumerPath);
  await fs.writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "b-source-position-interaction-outside-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
    }),
  );
  required(
    await npmCommand(
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--workspaces=false",
        ...packs,
      ],
      consumer,
    ),
    "owned offline tarball install",
  );
  const peer = required(
    await npmCommand(["ls", "react", "react-dom", "--json", "--all"], consumer),
    "actual tarball React peer tree",
  );
  result.peerTree = JSON.parse(peer.stdout);
  result.peerTreeCommand = peer.capture;
  const expected = {};
  for (const name of [
    "react",
    "react-dom",
    "@hier/protocol-types",
    "@hier/client",
    "@hier/viewmodel",
    "@hier/views",
  ]) {
    const folder = path.join(consumer, "node_modules", name);
    assert.equal((await fs.lstat(folder)).isSymbolicLink(), false);
    expected[name] = await fs.realpath(folder);
  }
  const found = new Set();
  await scanSingletons(path.join(consumer, "node_modules"), expected, found);
  assert.equal(found.size, Object.keys(expected).length);
  result.singletonPaths = expected;
  result.copiedTypeTools = [];
  for (const name of ["@types/react", "@types/prop-types", "csstype"]) {
    const source = await fs.realpath(path.join(tools, "node_modules", name));
    const destination = path.join(consumer, "node_modules", name);
    const manifest = JSON.parse(
      await fs.readFile(path.join(source, "package.json"), "utf8"),
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, dereference: true });
    const copied = JSON.parse(
      await fs.readFile(path.join(destination, "package.json"), "utf8"),
    );
    assert.equal(copied.name, manifest.name);
    assert.equal(copied.version, manifest.version);
    result.copiedTypeTools.push({
      name,
      version: manifest.version,
      source,
      destination,
    });
  }
  const originalTypes = await fs.readFile(
    path.join(import.meta.dirname, "types.ts"),
  );
  const typedNegativeMarkers = (
    originalTypes.toString("utf8").match(/@ts-expect-error SPI\d+:/g) ?? []
  ).length;
  assert.equal(typedNegativeMarkers, 42);
  await fs.writeFile(path.join(consumer, "types.ts"), originalTypes);
  assert.deepEqual(
    await fs.readFile(path.join(consumer, "types.ts")),
    originalTypes,
    "consume the unchanged frozen type source",
  );
  result.typeSource = {
    file: path.join(consumer, "types.ts"),
    bytes: originalTypes.length,
    sha256: sha(originalTypes),
    typedNegativeMarkers,
    semanticNegativesExecuted: 0,
  };
  const checker = path.join(consumer, "check-types.mjs");
  await fs.writeFile(checker, compileSource);
  result.stage = "independent-consumer-groups";
  for (const group of groups) {
    group.executed = true;
    try {
      let r;
      if (group.id === "outside-public-types") {
        r = await command(process.execPath, [checker, tools], consumer);
        group.commandCapture = r.capture;
        group.report = childReport(r);
        assert.equal(group.report.exitCode, r.status);
        assert.equal(
          group.report.consumer,
          consumer,
          "the copy compiles outside the monorepo",
        );
        assert.ok(Array.isArray(group.report.positive));
        assert.equal(
          r.status,
          group.report.positive.length ? 1 : 0,
          "the type result is determined by actual positive diagnostics",
        );
      } else {
        const local = createRequire(path.join(consumer, "package.json"));
        const viewsEntry = await fs.realpath(local.resolve("@hier/views"));
        assert.equal(
          viewsEntry,
          await fs.realpath(
            path.join(consumer, "node_modules/@hier/views/dist/index.js"),
          ),
        );
        const cssEntry = await fs.realpath(
          local.resolve("@hier/views/source-view.css"),
        );
        assert.ok(cssEntry.startsWith(expected["@hier/views"] + path.sep));
        result.publicEntries = { viewsEntry, cssEntry };
        const overrides = {
          HIER_B_PRODUCT_ROOT: product,
          HIER_B_BROWSER_TOOLS: tools,
          HIER_B_NPM_BIN: npm,
          HIER_B_PACKAGE_VIEWS_ENTRY: viewsEntry,
          HIER_B_PACKAGE_CSS: cssEntry,
        };
        r = await command(
          process.execPath,
          [path.join(import.meta.dirname, "run.mjs"), "--trusted-only"],
          import.meta.dirname,
          overrides,
        );
        group.commandCapture = r.capture;
        group.report = childReport(r);
        assert.equal(group.report.truePack, true, "real package entry used");
        assert.equal(group.report.productMounted, true, "not a native control");
        assert.equal(await fs.realpath(group.report.viewsEntry), viewsEntry);
        assert.equal(await fs.realpath(group.report.cssEntry), cssEntry);
        assert.ok(Array.isArray(group.report.buildInputs));
        const buildInputs = await Promise.all(
          group.report.buildInputs.map((f) =>
            fs.realpath(path.resolve(import.meta.dirname, f)),
          ),
        );
        assert.ok(
          buildInputs.includes(viewsEntry),
          "bundled installed root entry",
        );
        for (const input of buildInputs) {
          assert.equal(
            input.startsWith(path.join(product, "web/packages") + path.sep),
            false,
            "outside browser consumer must not alias workspace packages",
          );
          if (
            /\/node_modules\/(?:react|react-dom|scheduler|loose-envify|js-tokens)\//.test(
              input,
            )
          )
            assert.ok(
              input.startsWith(consumer + path.sep),
              "outside browser consumes installed React runtime",
            );
        }
        assert.equal(
          group.report.planned,
          5,
          "the frozen five trusted inputs, including both-axis scroll",
        );
        assert.equal(group.report.exitCode, r.status);
        assert.deepEqual(group.report.cleanupErrors, []);
        if (successful(r)) {
          assert.equal(group.report.executed, 5);
          assert.equal(group.report.passed, 5);
          assert.equal(group.report.failed, 0);
          assert.equal(group.report.skipped, 0);
          assert.equal(group.report.blocked, 0);
          assert.deepEqual(
            group.report.results.map((row) => row.id).sort(),
            [
              "B-SPI-trusted-mouse-0.5",
              "B-SPI-trusted-mouse-1",
              "B-SPI-trusted-mouse-1.5",
              "B-SPI-trusted-mouse-scrolled",
              "B-SPI-trusted-key",
            ].sort(),
          );
          assert.ok(group.report.results.every((row) => row.pass === true));
        }
      }
      group.commandCapture = r.capture;
      group.exitCode = r.status;
      group.passed = successful(r);
    } catch (e) {
      group.error = String(e.stack ?? e);
      group.passed = false;
    }
  }
} catch (e) {
  result.setupError = String(e.stack ?? e);
} finally {
  try {
    await fs.rm(temp, { recursive: true, force: true });
  } catch (e) {
    result.cleanupErrors.push({
      name: "owned-temp",
      error: String(e.stack ?? e),
    });
  }
}
result.executed = groups.filter((g) => g.executed).length;
result.passed = groups.filter((g) => g.executed && g.passed).length;
result.failed = result.executed - result.passed;
result.blocked = result.planned - result.executed;
result.exitCode =
  result.passed === result.planned &&
  !result.setupError &&
  result.cleanupErrors.length === 0
    ? 0
    : 1;
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.exitCode;
