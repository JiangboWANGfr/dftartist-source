// A entry controls only: temporary child receipts are not SourceView substitutes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const product = fileURLToPath(new URL("../../", import.meta.url));
const wrapperPath = "web/scripts/run-source-view-tests.mjs";
const directory = "web/tests/";
const entries = {
  model: [
    ["independent-source-view/verify-types.mjs", ["production"]],
    ["independent-source-view/run.mjs", []],
    ["independent-source-view/q1q2/run.mjs", []],
    ["independent-source-view/scale/run.mjs", []],
    [
      "independent-source-position-interaction/verify-types.mjs",
      ["production"],
    ],
    ["independent-source-position-interaction/run.mjs", []],
  ],
  package: [
    ["independent-source-view/package.mjs", []],
    ["independent-source-position-interaction/package.mjs", []],
  ],
  controls: [
    ["independent-source-view/inventory.test.mjs", []],
    ["independent-source-view/q1q2/inventory.test.mjs", []],
    ["independent-source-view/q1q2/verify-fixtures.mjs", []],
    ["independent-source-view/run.mjs", ["--self-check"]],
    ["independent-source-view/q1q2/run.mjs", ["--self-check"]],
    ["independent-source-position-interaction/inventory.test.mjs", []],
    ["independent-source-position-interaction/run.mjs", ["--controls"]],
    ["independent-source-position-interaction/verify-observation.mjs", []],
  ],
};
const scenarios = [
  ["model", "none", -1],
  ["package", "none", -1],
  ["controls", "none", -1],
  ["model", "unset", -1],
  ["model", "exit", 0],
  ["model", "signal", 1],
  ["controls", "exit", 1],
  ["model", "missing", 1],
  ["model", "missing", 3],
  ["model", "directory", 3],
  ["model", "exit", 3],
  ["model", "signal", 3],
  ["controls", "missing", 0],
  ["controls", "missing", 1],
  ["controls", "directory", 1],
  ["constructor", "invalid-mode", -1],
  ["model", "missing", 4],
  ["model", "missing", 5],
  ["model", "directory", 5],
  ["model", "exit", 5],
  ["model", "signal", 5],
  ["package", "missing", 1],
  ["package", "exit", 1],
  ["controls", "missing", 5],
  ["controls", "exit", 6],
  ["controls", "missing", 7],
  ["controls", "directory", 7],
  ["controls", "exit", 7],
  ["controls", "signal", 7],
];

for (const [mode, fault, index] of scenarios)
  test(`SourceView entry: ${mode}/${fault}/${index}`, async () => {
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "hier-a-source-view gate 中文-"),
    );
    try {
      const root = await fs.realpath(temporary);
      const wrapper = path.join(root, wrapperPath);
      await fs.mkdir(path.dirname(wrapper), { recursive: true });
      await fs.copyFile(path.join(product, wrapperPath), wrapper);
      const inputs = Object.hasOwn(entries, mode) ? entries[mode] : [];
      for (const [i, [file]] of inputs.entries()) {
        if (fault === "missing" && i === index) continue;
        const target = path.join(root, directory, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        if (fault === "directory" && i === index) {
          await fs.mkdir(target);
          continue;
        }
        const marker =
          `console.log("A-SOURCE-VIEW-ENTRY " + JSON.stringify({i:${i},args:process.argv.slice(2),` +
          "cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT," +
          "tools:process.env.HIER_B_BROWSER_TOOLS," +
          "marker:process.env.HIER_A_ENTRY_MARKER,bin:process.env.HIER_BIN}));";
        const failure =
          i !== index
            ? ""
            : fault === "exit"
              ? "process.exit(23);"
              : fault === "signal"
                ? 'process.kill(process.pid,"SIGTERM");'
                : "";
        await fs.writeFile(target, marker + failure);
      }
      const env = {
        ...process.env,
        HIER_B_PRODUCT_ROOT: "must-be-overridden-product",
        HIER_B_BROWSER_TOOLS: "must-be-overridden-tools",
        HIER_A_ENTRY_MARKER: "A-source-view-marker",
        HIER_BIN: "A-not-a-Core-binary",
        HIER_B_NPM_BIN: process.execPath,
      };
      // Model the ordinary npm child, not this test runner's child context.
      delete env.NODE_TEST_CONTEXT;
      if (fault === "unset") {
        delete env.HIER_B_PRODUCT_ROOT;
        delete env.HIER_B_BROWSER_TOOLS;
      }
      const actual = spawnSync(process.execPath, [wrapper, mode], {
        cwd: os.tmpdir(),
        encoding: "utf8",
        env,
      });
      assert.equal(actual.error, undefined);
      assert.equal(actual.signal, null);
      assert.equal(
        actual.status,
        fault === "none" || fault === "unset"
          ? 0
          : fault === "exit" &&
              !(mode === "controls" && [0, 1, 5].includes(index))
            ? 23
            : 1,
        actual.stdout + actual.stderr,
      );
      const rows = [
        ...actual.stdout.matchAll(/A-SOURCE-VIEW-ENTRY (\{[^\n]*\})/g),
      ].map((match) => JSON.parse(match[1]));
      const expectedCount =
        fault === "none" || fault === "unset"
          ? inputs.length
          : fault === "missing" ||
              fault === "directory" ||
              fault === "invalid-mode"
            ? 0
            : index + 1;
      assert.deepEqual(
        rows.map((row) => row.i).sort((a, b) => a - b),
        Array.from({ length: expectedCount }, (_, i) => i),
      );
      if (mode !== "controls")
        assert.deepEqual(
          rows.map((row) => row.i),
          Array.from({ length: expectedCount }, (_, i) => i),
        );
      for (const row of rows) {
        assert.equal(await fs.realpath(row.cwd), root);
        assert.equal(await fs.realpath(row.product), root);
        assert.equal(await fs.realpath(row.tools), path.join(root, "web"));
        assert.equal(row.marker, "A-source-view-marker");
        assert.equal(row.bin, "A-not-a-Core-binary");
        assert.deepEqual(row.args, inputs[row.i][1]);
      }
      if (fault === "signal") assert.match(actual.stderr, /SIGTERM/);
      if (fault === "missing") assert.match(actual.stderr, /ENOENT/);
      if (fault === "directory")
        assert.match(actual.stderr, /Required SourceView input is not a file/);
      if (fault === "invalid-mode")
        assert.match(actual.stderr, /Expected exactly one SourceView mode/);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });

async function environmentFixture(t, mode) {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "hier-a-source-view environment 中文-"),
  );
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = await fs.realpath(temporary);
  const wrapper = path.join(root, wrapperPath);
  await fs.mkdir(path.dirname(wrapper), { recursive: true });
  await fs.copyFile(path.join(product, wrapperPath), wrapper);
  for (const [file] of entries[mode]) {
    const target = path.join(root, directory, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      'console.log("A-SOURCE-VIEW-ENV " + JSON.stringify({' +
        "npm:process.env.HIER_B_NPM_BIN,offline:process.env.npm_config_offline}));",
    );
  }
  return {
    root,
    run(env) {
      const childEnv = { ...env };
      delete childEnv.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [wrapper, mode], {
        cwd: root,
        encoding: "utf8",
        env: childEnv,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      return {
        ...result,
        rows: [
          ...result.stdout.matchAll(/A-SOURCE-VIEW-ENV (\{[^\n]*\})/g),
        ].map((match) => JSON.parse(match[1])),
      };
    },
  };
}

for (const scenario of [
  "explicit",
  "npm_execpath",
  "PATH",
  "missing",
  "invalid-explicit",
  "invalid-npm_execpath",
])
  test(`SourceView package npm executable: ${scenario}`, async (t) => {
    const fixture = await environmentFixture(t, "package");
    const bins = {};
    for (const name of ["explicit", "npm_execpath", "PATH", "unexecutable"]) {
      const file = path.join(fixture.root, name, "npm");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "#!/bin/sh\nexit 0\n", {
        mode: name === "unexecutable" ? 0o644 : 0o755,
      });
      bins[name] = file;
    }
    const directoryBin = path.join(fixture.root, "directory", "npm");
    await fs.mkdir(directoryBin, { recursive: true });
    const env = { ...process.env };
    delete env.HIER_B_NPM_BIN;
    delete env.npm_execpath;
    env.PATH = [
      path.join(fixture.root, "missing"),
      path.dirname(bins.unexecutable),
      path.dirname(directoryBin),
      path.dirname(bins.PATH),
    ].join(path.delimiter);
    if (scenario === "explicit") {
      env.HIER_B_NPM_BIN = bins.explicit;
      env.npm_execpath = bins.npm_execpath;
    } else if (scenario === "npm_execpath") {
      env.npm_execpath = bins.npm_execpath;
    } else if (scenario === "missing") {
      env.PATH = path.join(fixture.root, "missing");
    } else if (scenario === "invalid-explicit") {
      env.HIER_B_NPM_BIN = "";
      env.npm_execpath = bins.npm_execpath;
    } else if (scenario === "invalid-npm_execpath") {
      env.npm_execpath = path.join(fixture.root, "absent-cli.js");
    }
    const actual = fixture.run(env);
    const rejected = scenario === "missing" || scenario.startsWith("invalid-");
    assert.equal(actual.status, rejected ? 1 : 0, actual.stderr);
    if (rejected) {
      assert.deepEqual(actual.rows, []);
      assert.match(actual.stderr, /Cannot resolve executable npm/);
      assert.match(
        actual.stderr,
        scenario === "missing"
          ? /from PATH/
          : scenario === "invalid-explicit"
            ? /from HIER_B_NPM_BIN/
            : /from npm_execpath/,
      );
    } else {
      assert.deepEqual(
        actual.rows,
        entries.package.map(() => ({ npm: bins[scenario], offline: "true" })),
      );
    }
  });

test("SourceView offline tarball policy affects only package mode", async (t) => {
  for (const mode of Object.keys(entries)) {
    const fixture = await environmentFixture(t, mode);
    for (const offline of [undefined, "false"]) {
      const env = { ...process.env, HIER_B_NPM_BIN: process.execPath };
      if (offline === undefined) delete env.npm_config_offline;
      else env.npm_config_offline = offline;
      const actual = fixture.run(env);
      assert.equal(actual.status, 0, actual.stderr);
      assert.equal(actual.rows.length, entries[mode].length);
      for (const row of actual.rows) {
        assert.equal(row.npm, process.execPath);
        assert.equal(row.offline, mode === "package" ? "true" : offline);
      }
    }
  }
});
