// C-88 facility regression: same actual tool files, no type/DOM oracle changes.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const P = process.env.HIER_B_PRODUCT_ROOT,
  T = process.env.HIER_B_BROWSER_TOOLS;
assert.ok(P && T);
const root = path.resolve(import.meta.dirname, "../../../.."),
  script = path.resolve(import.meta.dirname, "../verify-types.mjs"),
  real = fs.realpathSync(T),
  alias = T;
assert.notEqual(alias, real, "supply an actual alias path for the regression");
const file = (p) => path.join(p, "node_modules/@types/react/index.d.ts"),
  stat = (p) => fs.statSync(file(p), { bigint: true });
assert.equal(stat(real).dev, stat(alias).dev);
assert.equal(stat(real).ino, stat(alias).ino);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const original = execFileSync(
  "git",
  [
    "show",
    "64f570d9bb2306a2350b6fcf607d8c65a51458e6:web/tests/independent-source-view/verify-types.mjs",
  ],
  { cwd: root, encoding: "utf8" },
);
const expected = original
  .replace(
    'const react = path.join(tools, "node_modules/@types/react/index.d.ts");',
    'const react = fs.realpathSync(\n  path.join(tools, "node_modules/@types/react/index.d.ts"),\n);',
  )
  .replace(
    "assert.ok(pos.inputs.includes(react));",
    "assert.ok(\n  pos.inputs.some((f) => fs.existsSync(f) && fs.realpathSync(f) === react),\n);",
  );
assert.equal(
  fs.readFileSync(script, "utf8"),
  expected,
  "only the two recorded path-identity expressions may differ",
);
const results = [];
for (const mode of ["proposal", "production"])
  for (const [spelling, tools] of [
    ["real", real],
    ["alias", alias],
  ]) {
    const start = Date.now(),
      c = spawnSync(process.execPath, [script, mode], {
        cwd: root,
        env: {
          ...process.env,
          HIER_B_PRODUCT_ROOT: P,
          HIER_B_BROWSER_TOOLS: tools,
        },
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      }),
      output = String(c.stdout ?? "") + String(c.stderr ?? "");
    const r = {
      mode,
      spelling,
      command: [process.execPath, script, mode],
      cwd: root,
      product: P,
      tools,
      status: c.status,
      signal: c.signal,
      seconds: (Date.now() - start) / 1000,
      outputBytes: Buffer.byteLength(output),
      outputSHA256: sha(Buffer.from(output)),
      outputGzipBase64: gzipSync(output).toString("base64"),
    };
    results.push(r);
    assert.equal(c.status, 0, output);
    const value = JSON.parse(c.stdout);
    assert.deepEqual(
      [
        value.planned,
        value.executed,
        value.passed,
        value.failed,
        value.skipped,
      ],
      [28, 28, 28, 0, 0],
    );
    assert.deepEqual(value.positive, []);
    assert.equal(value.typedFixtureValues, 20);
    assert.equal(fs.realpathSync(value.react), fs.realpathSync(file(real)));
    r.summary = {
      passed: value.passed,
      positive: value.positive,
      typedFixtureValues: value.typedFixtureValues,
    };
  }
console.log(
  JSON.stringify(
    {
      kind: "B C-88 realpath/alias facility",
      originalSHA256: sha(Buffer.from(original)),
      adaptedSHA256: sha(Buffer.from(expected)),
      real,
      alias,
      sameDevice: true,
      sameInode: true,
      cases: 4,
      uniqueTypeNegatives: 28,
      DOMExecuted: 0,
      results,
    },
    null,
    2,
  ),
);
