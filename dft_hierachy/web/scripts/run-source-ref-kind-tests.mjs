// Run the unchanged B freeze against this checkout; no caller-selected product.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { cases as wireCases } from "../tests/independent-source-ref-kind/wire-cases.mjs";
import {
  cases as coreCases,
  fixture,
  point,
} from "../tests/independent-source-ref-kind/core-fixture.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const suite = join(root, "web/tests/independent-source-ref-kind");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: join(root, "web"),
};
function required(file, executable = false) {
  accessSync(file, executable ? constants.X_OK : constants.R_OK);
  assert.ok(statSync(file).isFile(), `Required file: ${file}`);
}

export function checkedSpawn(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(
    result.signal,
    null,
    `Child terminated: ${binary} ${result.signal}`,
  );
  assert.equal(result.status, 0, `Child failed: ${binary} ${args.join(" ")}`);
  return result.stdout;
}

export function withLegacySchema(body) {
  const archive = JSON.parse(
    readFileSync(
      join(root, "web/tests/fixtures/source-ref-kind-legacy.json"),
      "utf8",
    ),
  );
  assert.equal(
    archive.sourceCommit,
    "146bfa6069f611855f946344090a7b953303dd43",
  );
  const allowed = [
    "protocol/schema/hier.schema.json",
    "web/packages/protocol-types/package.json",
    ...[
      "index",
      "registry.generated",
      "validation",
      "validators.generated",
      "wire.generated",
    ].map((n) => `web/packages/protocol-types/dist/${n}.js`),
  ];
  assert.deepEqual(Object.keys(archive.files).sort(), allowed.sort());
  const dir = mkdtempSync(join(tmpdir(), "hier-ref-kind-legacy-"));
  try {
    for (const [name, record] of Object.entries(archive.files)) {
      const bytes = gunzipSync(Buffer.from(record.gzipBase64, "base64"));
      assert.equal(bytes.length, record.bytes);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        record.sha256,
      );
      const file = join(dir, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function native(build) {
  const dir = join(resolve(build), "tests/source-ref-kind");
  const binaries = ["serialization", "schema", "api"].map((n) =>
    join(dir, `hier_source_ref_kind_${n}`),
  );
  // Preflight all consumers before any partial run can appear successful.
  for (const binary of binaries) required(binary, true);
  const rows = checkedSpawn(binaries[0], [])
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  assert.equal(rows.length, 8);
  assert.ok(rows.slice(0, 7).every((r) => r.pass === true));
  assert.deepEqual(rows[7], { passed: 7, failed: 0 });
  const input =
    wireCases
      .map((c) => JSON.stringify({ definition: c.definition, input: c.input }))
      .join("\n") + "\n";
  const actual = checkedSpawn(binaries[1], [], { input })
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  assert.equal(wireCases.length, 208);
  assert.deepEqual(
    actual,
    wireCases.map((c) => c.expected),
  );
  assert.equal(coreCases.length, 24);
  const temp = mkdtempSync(join(tmpdir(), "hier-ref-kind-native-"));
  try {
    for (const row of coreCases) {
      const f = fixture(row.input.macro);
      writeFileSync(join(temp, "b_rk_leaf.svh"), f.leaf);
      writeFileSync(join(temp, "b_rk_top.sv"), f.top);
      const kind = row.input.kind;
      const marker =
        kind === "port"
          ? "input logic d"
          : kind === "signal"
            ? "wire stage"
            : kind === "process"
              ? f.assign
              : kind === "register"
                ? "q <= stage"
                : "module b_rk_leaf";
      const at = point(
        f.leaf,
        marker,
        kind === "port"
          ? "input logic ".length
          : kind === "signal"
            ? "wire ".length
            : 0,
      );
      console.log(JSON.stringify({ id: row.id, build: resolve(build) }));
      const output = checkedSpawn(binaries[2], [
        join(temp, "b_rk_top.sv"),
        String(at.line),
        String(at.col),
        row.input.perInstance ? "per" : "shared",
        kind,
      ]);
      const result = JSON.parse(output);
      assert.equal(result.pass, true);
      assert.ok(result.hits > 0);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({
      build: resolve(build),
      serialization: 7,
      schema: 208,
      coreApi: 24,
      failed: 0,
    }),
  );
}

export function main(args) {
  const [mode, build] = args;
  assert.ok(
    ["model", "core", "native"].includes(mode),
    "Expected model/core/native",
  );
  assert.equal(
    args.length,
    mode === "native" ? 2 : 1,
    "Exact arguments required",
  );
  if (mode === "native") {
    native(build);
    return;
  }
  const commands =
    mode === "core"
      ? [["run-core.mjs"]]
      : [
          ["inventory.mjs"],
          ["verify-types.mjs", "production"],
          ["verify-schema.mjs", "production"],
          ["run-sdk.mjs"],
        ];
  for (const [name] of commands) required(join(suite, name));
  const run = (legacy) => {
    for (const [name, ...args] of commands)
      checkedSpawn(process.execPath, [join(suite, name), ...args], {
        env: { ...env, HIER_B_LEGACY_PRODUCT_ROOT: legacy },
      });
  };
  if (mode === "model") withLegacySchema(run);
  else run("");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
