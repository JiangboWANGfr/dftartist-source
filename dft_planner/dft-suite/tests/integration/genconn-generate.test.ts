import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolveBin } from "../../electron/bin.cjs";
import { genconnGenerateAll } from "../../electron/cli.cjs";
process.env.DFT_CORE_BIN_DIR = process.env.DFT_CORE_BIN_DIR || "../dft-core/build";
const have = existsSync(resolveBin("genconn"));
test("genconn generate-all matches the golden top-level file", { skip: !have }, async () => {
  const doc = readFileSync("tests/fixtures/chip.genconn.json", "utf8");
  const r = await genconnGenerateAll(doc);
  const top = r.files.find(f => f.name.includes("top_level_ports_and_connectionss"));
  assert.ok(top, "top-level file produced");
  // Golden = newProject's TS genconn generateAll(chip.genconn.json) — the authoritative oracle.
  // The C++ genconn-core is byte-identical to this TS oracle (verified independently by
  // dft-core's test/diff/genconn_diff.sh), so this asserts the CLI round-trip equals the TS
  // reference (NOT the C++ binary's own output). trimEnd-per-line guards incidental whitespace.
  const normalize = (s: string) => s.split("\n").map(l => l.trimEnd()).join("\n").trim();
  assert.equal(normalize(top.text), normalize(readFileSync("tests/fixtures/top.golden", "utf8")));
});
