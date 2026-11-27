// B29 independent build graph oracle. Uses B28 historical bad-cache fixture
// plus documented CMake cache/include semantics; never imports A's driver.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const P = process.env.HIER_B_PRODUCT_ROOT,
  D = process.env.HIER_B_DEPENDENCY_ROOT;
assert.ok(P && path.isAbsolute(P));
assert.ok(D && path.isAbsolute(D));
const output = fs.realpathSync(
  fs.mkdtempSync(
    path.join(
      process.env.HIER_B_BUILD_GRAPH_EVIDENCE_ROOT ?? os.tmpdir(),
      "b-ref-kind-cache with space 中文-",
    ),
  ),
);
const build = output + "/parent",
  child = build + "/tests/source-ref-kind/nested-consumer",
  cacheFile = child + "/CMakeCache.txt";
const cmake = process.env.HIER_B_CMAKE ?? "/opt/homebrew/bin/cmake",
  ctest = process.env.HIER_B_CTEST ?? "/opt/homebrew/bin/ctest";
const names = [
  "slang",
  "catch2",
  "fmt",
  "boost_regex",
  "mimalloc",
  "tomlplusplus",
];
const deps = names.map((n) => {
  assert.ok(fs.statSync(D + "/" + n + "-src").isDirectory());
  return (
    "-DFETCHCONTENT_SOURCE_DIR_" + n.toUpperCase() + "=" + D + "/" + n + "-src"
  );
});
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  enc = (b) => ({
    bytes: b.length,
    sha256: sha(b),
    gzipBase64: gzipSync(b).toString("base64"),
  });
const report = {
  kind: "B29 independent public cache transitions and real configure error recovery NOT Core execution",
  product: P,
  output,
  planned: 6,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  commands: [],
  results: [],
  cleanupErrors: [],
  exitCode: 0,
  history: {
    archive: "bdd3c4e331b4906b9fb5aecae6c7e5d067c6c281723e17ace19cae0caa211967",
    case: "B-RK-BUILD-optimized-allocator-off",
    property: "FETCHCONTENT_SOURCE_DIR_MIMALLOC",
    wrongSourceLeaf: "boost_regex-src",
  },
};
function run(argv) {
  const at = performance.now(),
    started = new Date().toISOString(),
    r = spawnSync(argv[0], argv.slice(1), {
      cwd: P,
      encoding: null,
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
      detached: process.platform !== "win32",
    });
  if (r.error && r.pid && process.platform !== "win32")
    try {
      process.kill(-r.pid, "SIGKILL");
    } catch (e) {
      if (e.code !== "ESRCH") report.cleanupErrors.push(String(e));
    }
  const stdout = r.stdout ?? Buffer.alloc(0),
    stderr = r.stderr ?? Buffer.alloc(0);
  report.commands.push({
    command: argv,
    cwd: P,
    started,
    ended: new Date().toISOString(),
    milliseconds: performance.now() - at,
    status: r.status,
    signal: r.signal,
    error: r.error ? String(r.error) : null,
    stdout: enc(stdout),
    stderr: enc(stderr),
  });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  return {
    status: r.status,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  };
}
function configure(allocator) {
  const r = run([
    cmake,
    "-S",
    P + "/core",
    "-B",
    build,
    "-G",
    "Unix Makefiles",
    "-DCMAKE_BUILD_TYPE=RelWithDebInfo",
    "-DHIER_BUILD_EXPERIMENTS=OFF",
    "-DHIER_TEST_OBSERVER=OFF",
    "-DSLANG_USE_MIMALLOC=" + allocator,
    ...deps,
  ]);
  assert.equal(r.status, 0);
}
function snapshot(file) {
  const b = fs.readFileSync(file);
  return { file, ...enc(b) };
}
function value(file, key) {
  return (
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.startsWith(key + ":"))
      ?.split("=")
      .slice(1)
      .join("=") ?? null
  );
}
function cacheEdit(key, v) {
  const real = fs.realpathSync(cacheFile),
    rel = path.relative(output, real);
  assert.ok(rel && !rel.startsWith("../") && !path.isAbsolute(rel));
  const before = snapshot(real),
    lines = fs.readFileSync(real, "utf8").split("\n"),
    matches = lines
      .map((l, i) => (l.startsWith(key + ":") ? i : -1))
      .filter((i) => i >= 0);
  assert.ok(matches.length <= 1);
  if (matches.length) {
    const i = matches[0];
    lines[i] = lines[i].slice(0, lines[i].indexOf("=") + 1) + v;
  } else lines.push(key + ":FILEPATH=" + v);
  fs.writeFileSync(real, lines.join("\n"));
  return { key, value: v, before, after: snapshot(real) };
}
function healthy(allocator) {
  assert.equal(
    value(build + "/CMakeCache.txt", "SLANG_USE_MIMALLOC"),
    allocator,
  );
  assert.equal(value(cacheFile, "SLANG_USE_MIMALLOC"), allocator);
  const mappings = {};
  for (const n of names) {
    const k = "FETCHCONTENT_SOURCE_DIR_" + n.toUpperCase(),
      v = value(cacheFile, k);
    mappings[n] = v;
    if (n !== "mimalloc")
      assert.ok(v, "enabled dependency source must be explicit");
    if (v)
      assert.equal(
        fs.realpathSync(v),
        fs.realpathSync(D + "/" + n + "-src"),
        "dependency cache must not point at a different dependency",
      );
  }
  return mappings;
}
function nested(errorMarker) {
  const list = run([
    ctest,
    "--test-dir",
    build,
    "--show-only=json-v1",
    "-R",
    "^a_source_ref_kind_nested_configure$",
  ]);
  assert.equal(list.status, 0);
  const tests = JSON.parse(list.stdout).tests;
  assert.equal(tests.length, 1);
  assert.equal(tests[0].name, "a_source_ref_kind_nested_configure");
  const r = run([
    ctest,
    "--test-dir",
    build,
    "-V",
    "-R",
    "^a_source_ref_kind_nested_configure$",
  ]);
  if (errorMarker) {
    assert.ok(
      Number.isInteger(r.status) && r.status > 0,
      "real CMake failure must propagate",
    );
    assert.ok(
      (r.stdout + r.stderr).includes(errorMarker),
      "failure must be the deliberate fixture",
    );
    assert.match(
      r.stdout + r.stderr,
      /CMake Error|could not find requested file/i,
    );
    assert.match(r.stdout, /0% tests passed, 1 tests failed out of 1\b/);
  } else {
    assert.equal(r.status, 0);
    assert.match(r.stdout, /100% tests passed, 0 tests failed out of 1\b/);
  }
  return r.status;
}
function step(id, input, expected, basis, body) {
  const r = { id, input, expected, basis, pass: false };
  report.results.push(r);
  report.executed++;
  try {
    Object.assign(r, body());
    r.pass = true;
    report.passed++;
  } catch (e) {
    r.reason = String(e.stack ?? e);
    report.failed++;
    throw e;
  } finally {
    r.caches = [build + "/CMakeCache.txt", cacheFile]
      .filter((f) => fs.existsSync(f))
      .map(snapshot);
  }
}
try {
  step(
    "B-RK-CACHE-fresh-off",
    { allocator: "OFF" },
    { parentStatus: 0, nestedStatus: 0, allocator: "OFF" },
    "B28 original supported OFF configuration",
    () => {
      configure("OFF");
      return { nestedStatus: nested(), mappings: healthy("OFF") };
    },
  );
  step(
    "B-RK-CACHE-history-repair",
    { legacyMimallocSource: "boost_regex-src" },
    { nestedStatus: 0, allocator: "OFF", source: "absent-empty-or-correct" },
    "B28 archived actual bad child property; supported OFF must recover without a prescribed implementation",
    () => {
      const edit = cacheEdit(
        "FETCHCONTENT_SOURCE_DIR_MIMALLOC",
        D + "/boost_regex-src",
      );
      return { edit, nestedStatus: nested(), mappings: healthy("OFF") };
    },
  );
  step(
    "B-RK-CACHE-repeat-on",
    { sameParent: true, allocator: "ON" },
    { parentStatus: 0, nestedStatus: 0, allocator: "ON" },
    "Existing public allocator option with all six verified sources available",
    () => {
      configure("ON");
      return { nestedStatus: nested(), mappings: healthy("ON") };
    },
  );
  step(
    "B-RK-CACHE-repeat-off",
    { sameParent: true, allocator: "OFF" },
    { parentStatus: 0, nestedStatus: 0, allocator: "OFF" },
    "Repeated supported configuration must preserve parent/child choice and avoid wrong residual source",
    () => {
      configure("OFF");
      return { nestedStatus: nested(), mappings: healthy("OFF") };
    },
  );
  const marker = output + "/b29-missing-project-include.cmake";
  assert.equal(fs.existsSync(marker), false);
  step(
    "B-RK-CACHE-real-error",
    { projectInclude: "b29-missing-project-include.cmake" },
    { nestedStatus: "nonzero", reason: "specified missing CMake include" },
    "CMake4 local --help-variable CMAKE_PROJECT_INCLUDE and AGENTS accurate error propagation",
    () => {
      const edit = cacheEdit("CMAKE_PROJECT_INCLUDE", marker);
      return { edit, nestedStatus: nested(marker) };
    },
  );
  step(
    "B-RK-CACHE-error-recovery",
    { projectInclude: "" },
    { nestedStatus: 0, allocator: "OFF" },
    "Removing the injected failure must permit retry without deleting test or weakening oracle",
    () => {
      const edit = cacheEdit("CMAKE_PROJECT_INCLUDE", "");
      return { edit, nestedStatus: nested(), mappings: healthy("OFF") };
    },
  );
} catch (e) {
  report.facilityOrTestError = String(e.stack ?? e);
  report.exitCode = 1;
  report.blocked = report.planned - report.executed;
}
if (report.cleanupErrors.length) report.exitCode = 1;
report.resourceBoundary =
  "Only owned configure/cache fixture directories retained; no Core business process/build. Spawn timeout kills the owned subprocess group; all actual commands retain status/signal/error and streams.";
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
