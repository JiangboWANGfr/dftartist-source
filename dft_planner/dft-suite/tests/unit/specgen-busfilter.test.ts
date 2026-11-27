import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import type { DftIpInstance, DftWire } from "../../src/genconn/core/dft-model.ts";
import { filterDocToDomain, splitSpecSections } from "../../src/specgen/busFilter.ts";

function doc(dftIps: DftIpInstance[], dftWires: DftWire[], interfaces: HardenDef["interfaces"]): GenConnDocument {
  const root: HardenDef = { id: "p", designName: "p", designLevel: "sub_block", designType: "tiling",
    interfaces, childInstances: [], connections: [], inSpecgen: true, dftIps, dftWires };
  return { schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1 };
}
const topOf = (d: GenConnDocument) => d.library.defs.find((x) => x.id === "p")!;

const di: DftIpInstance = { id: "di1", ipType: "DesignInstance", instanceName: "h1", position: { x: 0, y: 0 } };
const pp: DftIpInstance = { id: "pp1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
const ebp: DftIpInstance = { id: "ebp1", ipType: "EBScanPipeline", instanceName: "ebp_1", position: { x: 0, y: 0 } };
const ssnW: DftWire = { id: "w_ssn", from: { kind: "ip", ipId: "pp1", port: "bus_data_out" }, to: { kind: "ip", ipId: "di1", port: "bus_data_in" } };
const bscanW: DftWire = { id: "w_bscan", from: { kind: "ip", ipId: "ebp1", port: "scan_out" }, to: { kind: "ip", ipId: "di1", port: "bscan_scan_in" } };
const ifs: HardenDef["interfaces"] = [{ id: "s", busType: "SSN", role: "client", busWidth: 4 }, { id: "b", busType: "BSCAN", role: "client", bscanVariant: "DC" }];

test("filterDocToDomain SSN：留 SSN 接口 + Pipeline + DI + SSN 线，去 BSCAN", () => {
  const d = topOf(filterDocToDomain(doc([pp, ebp, di], [ssnW, bscanW], ifs), "p", "SSN"));
  assert.deepEqual(d.interfaces.map((i) => i.busType), ["SSN"]);
  assert.deepEqual((d.dftIps ?? []).map((i) => i.id).sort(), ["di1", "pp1"]);
  assert.deepEqual((d.dftWires ?? []).map((w) => w.id), ["w_ssn"]);
});

test("filterDocToDomain BSCAN：留 BSCAN 接口 + EBScanPipeline + DI + BSCAN 线，且 DI 端口归一化为 bus_data_in", () => {
  const d = topOf(filterDocToDomain(doc([pp, ebp, di], [ssnW, bscanW], ifs), "p", "BSCAN"));
  assert.deepEqual(d.interfaces.map((i) => i.busType), ["BSCAN"]);
  assert.deepEqual((d.dftIps ?? []).map((i) => i.id).sort(), ["di1", "ebp1"]);
  const w = (d.dftWires ?? [])[0];
  assert.equal(w.id, "w_bscan");
  assert.equal((w.to as { port: string }).port, "bus_data_in", "DI 的 bscan_scan_in 归一化为 bus_data_in");
});

test("filterDocToDomain 设 rootDefId", () => {
  const out = filterDocToDomain(doc([], [], ifs), "p", "SSN");
  assert.equal(out.ui.rootDefId, "p");
});

const SSN_EDT = `read_config_data -in_wrapper $dftspec -rep -from_string {
  SSN {
    DataPath (1) {
      ScanHost (ssh_1) {
        ChainGroup (edt_1) {
        }
      }
    }
  }
  EDT {
    Controller (edt_1) {
    }
  }
}`;

test("splitSpecSections 从 SSN+EDT 输出切出两段，花括号配对不吞不漏", () => {
  const secs = splitSpecSections(SSN_EDT);
  assert.deepEqual(Object.keys(secs).sort(), ["EDT", "SSN"]);
  assert.ok(secs.SSN.startsWith("SSN {"));
  assert.ok(secs.SSN.includes("ChainGroup (edt_1)"));
  assert.ok(secs.SSN.trimEnd().endsWith("}"));
  assert.ok(secs.EDT.startsWith("EDT {"));
  assert.ok(secs.EDT.includes("Controller (edt_1)"));
});

test("splitSpecSections 从 EmbeddedBoundaryScan 输出切一段", () => {
  const bscan = `read_config_data -in_wrapper $dftspec -rep -from_string {
  EmbeddedBoundaryScan {
    HostBScanInterface (client) {
      EBScanInstance (h1) {
      }
    }
  }
}`;
  const secs = splitSpecSections(bscan);
  assert.deepEqual(Object.keys(secs), ["EmbeddedBoundaryScan"]);
  assert.ok(secs.EmbeddedBoundaryScan.includes("EBScanInstance (h1)"));
});

test("splitSpecSections 对空/无 from_string 文本返回空对象", () => {
  assert.deepEqual(splitSpecSections(""), {});
  assert.deepEqual(splitSpecSections("// 还不能生成：xxx"), {});
});
