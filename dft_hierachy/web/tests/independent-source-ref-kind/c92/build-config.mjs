// B28 public build-configuration regression. Oracle: accepted supported parent
// configurations must keep the integrated original-parent configure gate usable.
// This does NOT compile or execute Core; source/oracle is independent of A diffs.
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
const output = fs.mkdtempSync(
  path.join(
    process.env.HIER_B_BUILD_GRAPH_EVIDENCE_ROOT ?? os.tmpdir(),
    "b-ref-kind-build-graph-",
  ),
);
const cmake = process.env.HIER_B_CMAKE ?? "/opt/homebrew/bin/cmake",
  ctest = process.env.HIER_B_CTEST ?? "/opt/homebrew/bin/ctest";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  enc = (b) => ({
    bytes: b.length,
    sha256: sha(b),
    gzipBase64: gzipSync(b).toString("base64"),
  });
const report = {
  kind: "B28 SourceRefKind public build-configuration regression NOT Core execution",
  product: P,
  output,
  planned: 3,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  commands: [],
  results: [],
  cleanupErrors: [],
  exitCode: 0,
};
function run(argv) {
  const at = performance.now(),
    started = new Date().toISOString(),
    r = spawnSync(argv[0], argv.slice(1), {
      cwd: P,
      encoding: null,
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    });
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
  return {
    status: r.status,
    signal: r.signal,
    error: r.error,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  };
}
const names = [
  "slang",
  "catch2",
  "fmt",
  "boost_regex",
  "mimalloc",
  "tomlplusplus",
];
const deps = names.map((n) => {
  const dir = path.join(D, n + "-src");
  assert.ok(fs.statSync(dir).isDirectory());
  return "-DFETCHCONTENT_SOURCE_DIR_" + n.toUpperCase() + "=" + dir;
});
const cases = [
  {
    id: "B-RK-BUILD-optimized-default",
    input: { stages: [{ buildType: "RelWithDebInfo", allocator: null }] },
    expected: { parentConfigure: 0, nestedConfigure: 0, allocator: "ON" },
    basis:
      "Existing public Slang allocator default ON; adding tests must preserve supported ordinary Core configure",
  },
  {
    id: "B-RK-BUILD-optimized-allocator-off",
    input: { stages: [{ buildType: "RelWithDebInfo", allocator: "OFF" }] },
    expected: { parentConfigure: 0, nestedConfigure: 0, allocator: "OFF" },
    basis:
      "Public SLANG_USE_MIMALLOC option permits OFF; the nested regression must also work for that accepted configuration",
  },
  {
    id: "B-RK-BUILD-reused-debug-to-optimized",
    input: {
      stages: [
        { buildType: "Debug", allocator: null },
        { buildType: "RelWithDebInfo", allocator: null },
      ],
    },
    expected: { parentConfigure: 0, nestedConfigure: 0, allocator: "OFF" },
    basis:
      "Pre-change Core public build adapter forces cached allocator OFF in Debug; reconfiguration to optimized must preserve a supported cached OFF",
  },
];
function cache(file) {
  const text = fs.readFileSync(file, "utf8");
  return {
    file,
    ...enc(Buffer.from(text)),
    allocator: text.match(/^SLANG_USE_MIMALLOC:BOOL=(.+)$/m)?.[1] ?? null,
  };
}
try {
  for (const row of cases) {
    const dir = path.join(output, row.id),
      result = {
        ...row,
        configures: [],
        nested: null,
        parentCache: null,
        childCache: null,
        pass: false,
        reason: null,
      };
    report.results.push(result);
    report.executed++;
    try {
      for (const stage of row.input.stages) {
        const argv = [
          cmake,
          "-S",
          P + "/core",
          "-B",
          dir,
          "-G",
          "Unix Makefiles",
          "-DCMAKE_BUILD_TYPE=" + stage.buildType,
          "-DHIER_BUILD_EXPERIMENTS=OFF",
          "-DHIER_TEST_OBSERVER=OFF",
          ...deps,
          ...(stage.allocator
            ? ["-DSLANG_USE_MIMALLOC=" + stage.allocator]
            : []),
        ];
        const r = run(argv);
        result.configures.push({
          status: r.status,
          signal: r.signal,
          error: r.error ? String(r.error) : null,
        });
        assert.equal(r.error, undefined);
        assert.equal(r.signal, null);
        assert.equal(r.status, row.expected.parentConfigure);
      }
      result.parentCache = cache(dir + "/CMakeCache.txt");
      assert.equal(result.parentCache.allocator, row.expected.allocator);
      const inventory = run([
        ctest,
        "--test-dir",
        dir,
        "--show-only=json-v1",
        "-R",
        "^a_source_ref_kind_nested_configure$",
      ]);
      assert.equal(inventory.status, 0);
      const tests = JSON.parse(inventory.stdout).tests;
      assert.equal(tests.length, 1);
      assert.equal(tests[0].name, "a_source_ref_kind_nested_configure");
      const r = run([
        ctest,
        "--test-dir",
        dir,
        "-V",
        "-R",
        "^a_source_ref_kind_nested_configure$",
      ]);
      result.nested = {
        status: r.status,
        signal: r.signal,
        error: r.error ? String(r.error) : null,
      };
      const child =
        dir + "/tests/source-ref-kind/nested-consumer/CMakeCache.txt";
      if (fs.existsSync(child)) result.childCache = cache(child);
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.equal(
        r.status,
        row.expected.nestedConfigure,
        "supported parent configure must not make its integrated nested gate fail",
      );
      assert.match(r.stdout, /100% tests passed, 0 tests failed out of 1\b/);
      assert.ok(result.childCache);
      assert.equal(
        result.childCache.allocator,
        row.expected.allocator,
        "nested graph must honor the accepted allocator choice",
      );
      result.pass = true;
      report.passed++;
    } catch (error) {
      result.reason = String(error.stack ?? error);
      report.failed++;
      report.exitCode = 1;
    }
  }
} catch (error) {
  report.facilityError = String(error.stack ?? error);
  report.exitCode = 1;
  report.blocked = report.planned - report.executed;
}
report.evidenceRetained = true;
report.resourceBoundary =
  "Only three owned CMake configure directories retained for diagnosis; no Core process/task/object/build reused or business assertion claimed";
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
