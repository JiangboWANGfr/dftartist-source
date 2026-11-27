import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolveBin } from "../../electron/bin.cjs";
import { run } from "../../electron/cli.cjs";
import { generateAll } from "../../src/genconn/core/generate.ts";

process.env.DFT_CORE_BIN_DIR = process.env.DFT_CORE_BIN_DIR || "../dft-core/build";
const have = existsSync(resolveBin("genconn"));

// Anti-drift guard: dft-suite's TS genconn/core generator MUST stay byte-identical to the
// C++ `genconn` CLI (the source of truth). This feeds the SAME feature fixture (omitMemCtrl /
// SSN naming / multi-SSN) to both generators and asserts byte-equality. If TS drifts from C++
// again — as it did with SSN naming / omitMemCtrl — this test fails with a diff pinpointing it.
test("TS generateAll == C++ genconn generate-all (byte-identical)", { skip: !have }, async () => {
  const FIXTURE = "tests/fixtures/genconn_features.doc.json";
  const doc = JSON.parse(readFileSync(FIXTURE, "utf8"));

  // TS side: same call the app uses, serialized to the CLI's ===FILE:<file>===\n<text> concat
  // (one block per {file,text}; text already ends with \n). Mirrors app/genconn_main.cpp.
  const tsText = generateAll(doc.library, doc.ui.rootDefId)
    .map((r) => `===FILE:${r.file}===\n${r.text}`)
    .join("");

  // C++ side: raw stdout of the CLI on the same fixture on disk.
  const cxxText = await run("genconn", ["generate-all", FIXTURE]);

  assert.strictEqual(tsText, cxxText);
});
