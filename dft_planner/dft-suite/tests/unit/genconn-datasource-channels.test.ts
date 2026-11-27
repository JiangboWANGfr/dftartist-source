import { test } from "node:test";
import assert from "node:assert/strict";
import type { BusInterface, HardenDef } from "../../src/genconn/core/model.ts";
import { dataSourceChannels, isPrimaryDataSource, DS_LABEL } from "../../src/genconn/dataSource.ts";

const mkDef = (interfaces: BusInterface[]): HardenDef => ({
  id: "D", designName: "D", designLevel: "sub_block", designType: "tiling",
  interfaces, childInstances: [], connections: [],
});

test("SSN pad：单通道，行标签=总线类别 SSN", () => {
  const iface: BusInterface = { id: "s1", busType: "SSN", role: "client", isDataSource: true, placement: "other" };
  const chans = dataSourceChannels(iface, mkDef([iface]));
  assert.equal(chans.length, 1);
  assert.equal(chans[0].label, "SSN");
  assert.equal(chans[0].ifId, "s1");
  assert.equal(chans[0].pd, undefined);
  assert.equal(chans[0].busType, "SSN");
});

test("BISR pdList：N 行，每行带 pd，颜色为 BISR", () => {
  const iface: BusInterface = { id: "b1", busType: "BISR", role: "client", isDataSource: true, placement: "other", pdList: ["pdA", "pdB"] };
  const chans = dataSourceChannels(iface, mkDef([iface]));
  assert.deepEqual(chans.map((c) => c.label), ["pdA", "pdB"]);
  assert.deepEqual(chans.map((c) => c.pd), ["pdA", "pdB"]);
  assert.ok(chans.every((c) => c.ifId === "b1"));
  assert.ok(chans.every((c) => c.busType === "BISR"));
});

test("共享 tap：内部 ijtag/bscan 自动合并、各成员一行，ifId 为各成员", () => {
  const a: BusInterface = { id: "ij", busType: "IJTAG", role: "client", isDataSource: true, placement: "other" };
  const b: BusInterface = { id: "bs", busType: "BSCAN", role: "client", isDataSource: true, placement: "other" };
  const chans = dataSourceChannels(a, mkDef([a, b]));
  assert.equal(chans.length, 2);
  assert.deepEqual(chans.map((c) => c.ifId), ["ij", "bs"]);
  assert.deepEqual(chans.map((c) => c.busType), ["IJTAG", "BSCAN"]);
});

test("isPrimaryDataSource：组内第一个为 true、其余 false", () => {
  const a: BusInterface = { id: "ij", busType: "IJTAG", role: "client", isDataSource: true, placement: "other" };
  const b: BusInterface = { id: "bs", busType: "BSCAN", role: "client", isDataSource: true, placement: "other" };
  const def = mkDef([a, b]);
  assert.equal(isPrimaryDataSource(a, def), true);
  assert.equal(isPrimaryDataSource(b, def), false);
});

test("DS_LABEL 覆盖全 busType", () => {
  assert.deepEqual(DS_LABEL, { SSN: "pad", IJTAG: "tap", BISR: "bisrController", BSCAN: "tap", JTAG1838: "tap" });
});
