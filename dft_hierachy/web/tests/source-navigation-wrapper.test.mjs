// A entry wiring controls only; no Navigation model, SDK or Core substitutes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const product = fileURLToPath(new URL("../../", import.meta.url));
const wrapperPath = "web/scripts/run-source-document-tests.mjs";
const directory = "web/tests/independent-source-navigation/";
const entries = {
  model: ["verify-types.mjs", "ready-baseline/run.mjs"],
  core: ["run.mjs"],
  controls: ["facility.test.mjs", "ready-baseline/facility.test.mjs"],
};
const scenarios = [
  ["model", "none", -1],
  ["core", "none", -1],
  ["controls", "none", -1],
  ["model", "exit", 0],
  ["model", "signal", 1],
  ["model", "missing", 1],
  ["controls", "missing", 0],
  ["controls", "missing", 1],
  ["controls", "exit", 1],
];

for (const [mode, fault, index] of scenarios)
  test(`navigation entry: ${mode}/${fault}/${index}`, async () => {
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "hier-a-navigation gate 中文-"),
    );
    try {
      const root = await fs.realpath(temporary);
      const wrapper = path.join(root, wrapperPath);
      await fs.mkdir(path.dirname(wrapper), { recursive: true });
      await fs.copyFile(path.join(product, wrapperPath), wrapper);
      for (const [i, file] of entries[mode].entries()) {
        if (fault === "missing" && i === index) continue;
        const target = path.join(root, directory, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const marker =
          `console.log("A-NAVIGATION-ENTRY " + JSON.stringify({i:${i},args:process.argv.slice(2),` +
          "cwd:process.cwd(),product:process.env.HIER_B_PRODUCT_ROOT," +
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
      // Isolate the test runner's own child marker so the nested controls
      // aggregate behaves like the normal npm gate; preserve caller env otherwise.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const actual = spawnSync(
        process.execPath,
        [wrapper, mode, "navigation"],
        {
          cwd: os.tmpdir(),
          encoding: "utf8",
          env: {
            ...env,
            HIER_B_PRODUCT_ROOT: "must-be-overridden",
            HIER_A_ENTRY_MARKER: "A-navigation-marker",
            HIER_BIN: "A-not-a-Core-binary",
          },
        },
      );
      assert.equal(actual.error, undefined);
      assert.equal(actual.signal, null);
      assert.equal(
        actual.status,
        fault === "none" ? 0 : fault === "exit" && mode === "model" ? 23 : 1,
        actual.stderr,
      );
      const rows = [
        ...actual.stdout.matchAll(/A-NAVIGATION-ENTRY (\{[^\n]*\})/g),
      ].map((match) => JSON.parse(match[1]));
      const expectedCount =
        mode === "controls"
          ? fault === "missing"
            ? 0
            : entries[mode].length
          : fault === "none"
            ? entries[mode].length
            : index + (fault === "missing" ? 0 : 1);
      const observedIds = rows.map((row) => row.i);
      if (mode === "controls") observedIds.sort();
      assert.deepEqual(
        observedIds,
        Array.from({ length: expectedCount }, (_, i) => i),
      );
      for (const row of rows) {
        assert.equal(await fs.realpath(row.cwd), root);
        assert.equal(await fs.realpath(row.product), root);
        assert.equal(row.marker, "A-navigation-marker");
        assert.equal(row.bin, "A-not-a-Core-binary");
        assert.deepEqual(
          row.args,
          mode === "core"
            ? ["--core"]
            : mode === "model" && row.i === 1
              ? ["--all"]
              : [],
        );
      }
      if (fault === "signal") assert.match(actual.stderr, /SIGTERM/);
      if (fault === "missing")
        assert.match(
          actual.stderr,
          mode === "controls" ? /ENOENT/ : /MODULE_NOT_FOUND/,
        );
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });
