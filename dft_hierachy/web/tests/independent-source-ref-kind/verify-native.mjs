import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { cases as coreCases, fixture, point } from "./core-fixture.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(P && path.isAbsolute(P));
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "hier-b-ref-kind-native-"),
);
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  enc = (b) => ({
    bytes: b.length,
    sha256: sha(b),
    gzipBase64: gzipSync(b).toString("base64"),
  });
const report = {
  kind: "B SourceRefKind isolated native consumers and generated schema NOT full Core build",
  product: P,
  commands: [],
  configurations: [],
  cleanupErrors: [],
  exitCode: 0,
};
function command(args, input, timeout = 60000) {
  const started = new Date().toISOString(),
    at = performance.now(),
    r = spawnSync(args[0], args.slice(1), {
      input,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      encoding: null,
      detached: process.platform !== "win32",
    });
  if (r.error && r.pid && process.platform !== "win32")
    try {
      process.kill(-r.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") report.cleanupErrors.push(String(error));
    }
  const out = r.stdout ?? Buffer.alloc(0),
    err = r.stderr ?? Buffer.alloc(0);
  report.commands.push({
    command: args,
    cwd: process.cwd(),
    started,
    ended: new Date().toISOString(),
    milliseconds: performance.now() - at,
    status: r.status,
    signal: r.signal,
    error: r.error ? String(r.error) : null,
    stdout: enc(out),
    stderr: enc(err),
  });
  return {
    status: r.status,
    signal: r.signal,
    error: r.error,
    stdout: out.toString(),
    stderr: err.toString(),
  };
}
const tool = process.env.HIER_B_CXX ?? "/usr/bin/clang++";
const configs = [
  ["Debug", ["-O0", "-g"]],
  ["Release", ["-O2", "-DNDEBUG"]],
  [
    "ASan-UBSan",
    [
      "-O1",
      "-g",
      "-fsanitize=address,undefined",
      "-fno-omit-frame-pointer",
      "-fno-sanitize-recover=undefined",
    ],
  ],
];
try {
  const version = command([tool, "--version"]);
  assert.equal(version.status, 0);
  report.compiler = version.stdout;
  const probe = path.join(temp, "capability.cpp");
  await fs.writeFile(
    probe,
    '#include "hier/model/Source.h"\nint main(){hier::model::SourceHit h;h.refKind=hier::model::SourceRefKind::Object;}\n',
  );
  const include = [
    "-I" + P + "/core/model/include",
    "-I" + P + "/core/query/include",
    "-I" + P + "/core/protocol/include",
    "-I" + P + "/core/protocol/src",
  ];
  const capability = command([
    tool,
    "-std=c++20",
    ...include,
    "-fsyntax-only",
    probe,
  ]);
  report.capability = {
    newCppField: capability.status === 0,
    semanticExecuted: 0,
  };
  const { cases } = await import("./wire-cases.mjs");
  const schema = JSON.parse(
    await fs.readFile(P + "/protocol/schema/hier.schema.json"),
  );
  const applicable = cases.filter((c) => schema.$defs[c.definition]);
  const input = applicable
    .map(
      (c) =>
        JSON.stringify({ definition: c.definition, input: c.input }) + "\n",
    )
    .join("");
  for (const [name, flags] of configs) {
    const config = {
      name,
      legacy: { planned: 2, executed: 0, passed: 0, failed: 0 },
      serialization: {
        planned: 7,
        executed: 0,
        passed: 0,
        failed: 0,
        blocked: capability.status === 0 ? 0 : 7,
      },
      schema: {
        planned: cases.length,
        executed: 0,
        passed: 0,
        failed: 0,
        blocked: cases.length - applicable.length,
      },
      results: [],
    };
    report.configurations.push(config);
    const serialize = path.join(
        import.meta.dirname,
        "native/serialization.cpp",
      ),
      json = P + "/core/protocol/src/Json.cpp";
    const gc =
      process.platform === "darwin"
        ? ["-Wl,-dead_strip"]
        : ["-Wl,--gc-sections"];
    for (const legacy of [true, false]) {
      if (!legacy && capability.status !== 0) {
        report.exitCode = 1;
        continue;
      }
      const binary = path.join(temp, name + (legacy ? "-legacy" : "-new"));
      const built = command([
        tool,
        "-std=c++20",
        ...flags,
        ...include,
        "-ffunction-sections",
        "-fdata-sections",
        ...(legacy ? ["-DB_LEGACY=1"] : []),
        serialize,
        json,
        ...gc,
        "-o",
        binary,
      ]);
      assert.equal(built.status, 0, built.stderr);
      const ran = command([binary]);
      const lines = ran.stdout
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l)),
        count = lines.at(-1),
        group = config[legacy ? "legacy" : "serialization"];
      group.executed = count.passed + count.failed;
      group.passed = count.passed;
      group.failed = count.failed;
      assert.equal(group.executed, group.planned);
      config.results.push(...lines.slice(0, -1));
      if (ran.status !== 0) report.exitCode = 1;
    }
    const binary = path.join(temp, name + "-schema");
    const built = command([
      tool,
      "-std=c++20",
      ...flags,
      ...include,
      path.join(import.meta.dirname, "native/schema-replay.cpp"),
      ...[
        "DecodeFrame.cpp",
        "SchemaPrimitives.cpp",
        "WireSchema.generated.cpp",
      ].map((f) => P + "/core/protocol/src/" + f),
      "-o",
      binary,
    ]);
    assert.equal(built.status, 0, built.stderr);
    const ran = command([binary], input);
    assert.equal(ran.status, 0, ran.stderr);
    const answers = ran.stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(answers.length, applicable.length);
    const enumPositive = applicable.flatMap((c, i) =>
      c.definition === "SourceRefKind" && c.expected === true
        ? [answers[i]]
        : [],
    );
    config.schema.enumDefinitionQualified =
      enumPositive.length === 2 && enumPositive.every(Boolean);
    config.schema.results = applicable
      .map((c, i) => ({
        ...c,
        actual: answers[i],
        pass: answers[i] === c.expected,
      }))
      .filter(
        (c) =>
          c.definition !== "SourceRefKind" ||
          config.schema.enumDefinitionQualified,
      );
    config.schema.executed = config.schema.results.length;
    config.schema.blocked = cases.length - config.schema.executed;
    config.schema.passed = config.schema.results.filter((c) => c.pass).length;
    config.schema.failed = config.schema.executed - config.schema.passed;
    if (config.schema.failed || config.schema.blocked) report.exitCode = 1;
    if (process.argv.includes("--core-api")) {
      config.coreApi = {
        planned: coreCases.length,
        executed: 0,
        passed: 0,
        failed: 0,
        blocked: capability.status === 0 ? 0 : coreCases.length,
        freshCoreBuilt: false,
      };
      if (capability.status !== 0) {
        report.exitCode = 1;
        continue;
      }
      const build = path.join(P, "core/build-b-ref-kind-" + name.toLowerCase());
      const configured = command(
        [
          "/opt/homebrew/bin/cmake",
          "-S",
          path.join(import.meta.dirname, "native"),
          "-B",
          build,
          "-DHIER_PRODUCT=" + P,
          "-DCMAKE_BUILD_TYPE=" + (name === "ASan-UBSan" ? "Debug" : name),
          "-DHIER_SANITIZE=" + (name === "ASan-UBSan" ? "ON" : "OFF"),
        ],
        undefined,
        600000,
      );
      assert.equal(configured.status, 0, configured.stderr);
      const built = command(
        [
          "/opt/homebrew/bin/cmake",
          "--build",
          build,
          "--target",
          "b_ref_kind_api",
          "hier",
          "-j",
          "4",
        ],
        undefined,
        600000,
      );
      assert.equal(built.status, 0, built.stderr);
      config.coreApi.freshCoreBuilt = true;
      config.coreApi.binary = path.join(build, "product-core/hier");
      for (const row of coreCases) {
        const f = fixture(row.input.macro),
          dir = path.join(temp, name + "-api-fixture");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(dir + "/b_rk_leaf.svh", f.leaf);
        await fs.writeFile(dir + "/b_rk_top.sv", f.top);
        const marker =
          row.input.kind === "port"
            ? "input logic d"
            : row.input.kind === "signal"
              ? "wire stage"
              : row.input.kind === "process"
                ? f.assign
                : row.input.kind === "register"
                  ? "q <= stage"
                  : "module b_rk_leaf";
        const at = point(
          f.leaf,
          marker,
          row.input.kind === "port"
            ? "input logic ".length
            : row.input.kind === "signal"
              ? "wire ".length
              : 0,
        );
        const ran = command([
          path.join(build, "b_ref_kind_api"),
          dir + "/b_rk_top.sv",
          String(at.line),
          String(at.col),
          row.input.perInstance ? "per" : "shared",
          row.input.kind,
        ]);
        config.coreApi.executed++;
        config.coreApi[ran.status === 0 ? "passed" : "failed"]++;
        if (ran.status !== 0) report.exitCode = 1;
      }
    }
  }
} catch (error) {
  report.facilityError = String(error.stack ?? error);
  report.exitCode = 1;
} finally {
  try {
    assert.ok(path.basename(temp).startsWith("hier-b-ref-kind-native-"));
    await fs.rm(temp, { recursive: true, force: true });
  } catch (error) {
    report.cleanupErrors.push(String(error));
    report.exitCode = 1;
  }
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.exitCode;
