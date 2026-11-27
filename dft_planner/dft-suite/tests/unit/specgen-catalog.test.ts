import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogEntry, catalogBus, dftIpSize, portBus, DFT_CATALOG } from "../../src/specgen/catalog.ts";

test("catalogBus：EBScanPipeline→BSCAN，其余→SSN（缺省）", () => {
  assert.equal(catalogBus("EBScanPipeline"), "BSCAN");
  assert.equal(catalogBus("ScanHost"), "SSN");
  assert.equal(catalogBus("DesignInstance"), "SSN");
});

test("EBScanPipeline catalog 条目：abbr/bus/端口/尺寸齐全", () => {
  const e = catalogEntry("EBScanPipeline");
  assert.equal(e.abbr, "EBP");
  assert.equal(e.bus, "BSCAN");
  assert.equal(e.group, "datapath");
  assert.deepEqual(e.ports.map((p) => p.name), ["scan_in", "scan_out", "bscan_clock"]);
  assert.deepEqual(dftIpSize("EBScanPipeline"), { w: 100, h: 40 });
});

test("DesignInstance 有 SSN/BSCAN 各一对 in/out，带 bus 标注", () => {
  const ports = catalogEntry("DesignInstance").ports;
  const byName = Object.fromEntries(ports.map((p) => [p.name, p]));
  assert.equal(byName["bus_data_in"].bus, "SSN");
  assert.equal(byName["bus_data_out"].bus, "SSN");
  assert.equal(byName["bscan_scan_in"].bus, "BSCAN");
  assert.equal(byName["bscan_scan_out"].bus, "BSCAN");
  assert.equal(byName["bus_data_in"].dir, "in");
  assert.equal(byName["bscan_scan_out"].dir, "out");
});

test("portBus 返回端口的 bus；无 bus 或未知端口返回 undefined", () => {
  assert.equal(portBus("DesignInstance", "bscan_scan_in"), "BSCAN");
  assert.equal(portBus("DesignInstance", "bus_data_out"), "SSN");
  assert.equal(portBus("Pipeline", "bus_data_in"), undefined);
  assert.equal(portBus("DesignInstance", "nope"), undefined);
});

test("JTAG1838：catalogBus + 只有 StapPipeline 一个可放置 IP", () => {
  assert.equal(catalogBus("STapPipeline"), "JTAG1838");
  const sp = catalogEntry("STapPipeline");
  assert.equal(sp.abbr, "SPP");
  assert.equal(sp.bus, "JTAG1838");
  assert.deepEqual(sp.ports.map((p) => p.name), ["scan_in", "scan_out", "tck"]);
  assert.equal(DFT_CATALOG.filter((e) => e.bus === "JTAG1838").length, 1);
});
