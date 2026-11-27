import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Anti-drift guard: the UI schema copy (config form + palette) MUST stay byte-identical to the
// C++ canonical schema in dft-core. `scripts/sync-schema.sh` copies it; this test fails if the
// local copy drifts. Skips cleanly when the dft-core checkout isn't present (mirrors the
// binary-skip pattern in tests/integration/genconn-parity.test.ts).
const CANONICAL = `${process.env.DFT_CORE_DIR || "../dft-core"}/specgen-core/bscan.schema.json`;
const LOCAL = "src/specgen/schema/bscan.schema.json";
const have = existsSync(CANONICAL);

test("UI bscan.schema.json == dft-core canonical (byte-identical)", { skip: !have }, () => {
  const canonical = readFileSync(CANONICAL, "utf8");
  const local = readFileSync(LOCAL, "utf8");
  assert.strictEqual(local, canonical);
});
