import { test } from "node:test"; import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolveBin } from "../../electron/bin.cjs";
import { run, specgenGen, specgenFragment } from "../../electron/cli.cjs";
import { filterDocToDomain } from "../../src/specgen/busFilter.ts";
import { serialize } from "../../src/genconn/core/document.ts";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";

process.env.DFT_CORE_BIN_DIR = process.env.DFT_CORE_BIN_DIR || "../dft-core/build";
const have = existsSync(resolveBin("specgen"));

// Smoke test: the specgen CLI bridge round-trips a scope doc to a single .spec text.
// Skips cleanly when ../dft-core/build/specgen isn't built.
test("specgenGen spawns bin, passes doc file, returns the .spec text", { skip: !have }, async () => {
  const FIXTURE = "tests/fixtures/specgen_basic.doc.json";
  const docText = readFileSync(FIXTURE, "utf8");

  const out = await specgenGen(docText);

  // Shape checks: single-file .spec text (no ===FILE:=== markers).
  assert.ok(out.startsWith("read_config_data -in_wrapper $dftspec"),
    "output must start with the read_config_data header");
  assert.ok(out.includes("DataPath (1)"), "output must contain DataPath (1)");

  // Stronger: byte-identical to the CLI's own output on the same fixture on disk.
  const direct = await run("specgen", ["gen", FIXTURE]);
  assert.strictEqual(out, direct);
});

// Smoke test: the specgen fragment bridge round-trips a single-IP {ipType,instanceName,config}
// to a single `.spec` fragment. Skips cleanly when the binary isn't built.
test("specgenFragment spawns bin, passes frag file, returns the .spec fragment", { skip: !have }, async () => {
  const fragJson = JSON.stringify({
    ipType: "Pipeline",
    instanceName: "pl0",
    config: { ijtag_host_interface: "Sib(ssn)" },
  });

  const out = await specgenFragment(fragJson);

  // Fragment shape: `CompName (instanceName) { ... }` (no read_config_data header, no ===FILE:===).
  assert.ok(out.startsWith("Pipeline (pl0) {"), "output must start with the fragment header");
  assert.ok(out.includes("ijtag_host_interface"), "output must contain the configured prop");
});

function scopeDoc(over: Partial<HardenDef>): GenConnDocument {
  const root: HardenDef = { id: "p", designName: "p", designLevel: "sub_block", designType: "tiling",
    interfaces: [], childInstances: [], connections: [], inSpecgen: true, dftIps: [], dftWires: [], ...over };
  return { schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1 };
}

test("域隔离：BSCAN 断链不影响 SSN 域生成", { skip: !have }, async () => {
  const d = scopeDoc({
    interfaces: [{ id: "s", busType: "SSN", role: "client", busWidth: 8 }, { id: "b", busType: "BSCAN", role: "client", bscanVariant: "DC" }],
    dftIps: [{ id: "ssh", ipType: "ScanHost", instanceName: "ssh_1", position: { x: 0, y: 0 } }],
    dftWires: [
      { id: "w1", from: { kind: "iface", instanceId: "p", interfaceId: "s", pin: "out" }, to: { kind: "ip", ipId: "ssh", port: "bus_data_in" } },
      { id: "w2", from: { kind: "ip", ipId: "ssh", port: "bus_data_out" }, to: { kind: "iface", instanceId: "p", interfaceId: "s", pin: "in" } },
    ],
  });
  const ssn = await specgenGen(serialize(filterDocToDomain(d, "p", "SSN")));
  assert.ok(ssn.includes("ScanHost (ssh_1)"), "SSN 域独立生成成功，不被 BSCAN 断链拖累");
  await assert.rejects(() => specgenGen(serialize(filterDocToDomain(d, "p", "BSCAN"))), "BSCAN 域断链单独报错");
});

test("DI 在 BScan 链 → 归一化后生成 EBScanInstance", { skip: !have }, async () => {
  const d = scopeDoc({
    interfaces: [{ id: "b", busType: "BSCAN", role: "client", bscanVariant: "DC" }],
    dftIps: [{ id: "di1", ipType: "DesignInstance", instanceName: "h1", moduleName: "harden1", position: { x: 0, y: 0 } }],
    dftWires: [
      { id: "w1", from: { kind: "iface", instanceId: "p", interfaceId: "b", pin: "out" }, to: { kind: "ip", ipId: "di1", port: "bscan_scan_in" } },
      { id: "w2", from: { kind: "ip", ipId: "di1", port: "bscan_scan_out" }, to: { kind: "iface", instanceId: "p", interfaceId: "b", pin: "in" } },
    ],
  });
  const bscan = await specgenGen(serialize(filterDocToDomain(d, "p", "BSCAN")));
  assert.ok(bscan.includes("EmbeddedBoundaryScan"), "有 BScan 顶层段");
  assert.ok(bscan.includes("EBScanInstance (h1)"), "DI 归一化后生成 EBScanInstance");
});
