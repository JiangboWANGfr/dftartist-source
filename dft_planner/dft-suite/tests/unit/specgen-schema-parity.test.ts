import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { serialize } from "../../src/genconn/core/document.ts";

// Anti-drift guard: the UI schema copy (config form + palette) MUST stay byte-identical to the
// C++ canonical schema in dft-core. `scripts/sync-schema.sh` copies it; this test fails if the
// local copy drifts. Skips cleanly when the dft-core checkout isn't present (mirrors the
// binary-skip pattern in tests/integration/genconn-parity.test.ts).
const CANONICAL = `${process.env.DFT_CORE_DIR || "../dft-core"}/specgen-core/datapath.schema.json`;
const LOCAL = "src/specgen/schema/datapath.schema.json";
const have = existsSync(CANONICAL);

test("UI datapath.schema.json == dft-core canonical (byte-identical)", { skip: !have }, () => {
  const canonical = readFileSync(CANONICAL, "utf8");
  const local = readFileSync(LOCAL, "utf8");
  assert.strictEqual(local, canonical);
});

test("layerPos 序列化 round-trip：带 layerPos 的 DesignInstance 不丢字段", () => {
  const di = { id: "d1", ipType: "DesignInstance" as const, instanceName: "core",
    position: { x: 1, y: 2 }, layerPos: { SSN: { x: 3, y: 4 } } };
  const doc = {
    schemaVersion: 1, library: { defs: [{ id: "p", designName: "p", designLevel: "sub_block" as const,
      designType: "tiling" as const, interfaces: [], childInstances: [], connections: [], inSpecgen: true, dftIps: [di] }] },
    ui: { openDefId: "p", rootDefId: "p" }, ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
  const s = serialize(doc as never);
  const back = JSON.parse(s);
  const ip = back.library.defs[0].dftIps[0];
  assert.deepEqual(ip.layerPos, { SSN: { x: 3, y: 4 } });
  assert.deepEqual(ip.position, { x: 1, y: 2 });
});
