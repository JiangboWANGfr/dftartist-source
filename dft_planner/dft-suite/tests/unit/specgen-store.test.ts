import { test } from "node:test";
import assert from "node:assert/strict";
import { useStore } from "../../src/genconn/store.ts";
import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import type { DftIpInstance } from "../../src/genconn/core/dft-model.ts";

function scopeDoc(dftIps: DftIpInstance[] = [], interfaces: HardenDef["interfaces"] = []): GenConnDocument {
  const root: HardenDef = {
    id: "p", designName: "p", designLevel: "sub_block", designType: "tiling",
    interfaces, childInstances: [], connections: [], inSpecgen: true, dftIps,
  };
  return {
    schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}
const topOf = () => useStore.getState().doc.library.defs.find((d) => d.id === "p")!;

test("moveDftIp: 具体层里挪 DesignInstance 写 layerPos，不动 position", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  useStore.setState({ doc: scopeDoc([di]), activeLayer: "BSCAN" });
  useStore.getState().moveDftIp("p", "d1", { x: 200, y: 200 });
  const out = topOf().dftIps![0];
  assert.deepEqual(out.position, { x: 0, y: 0 });
  assert.deepEqual(out.layerPos!.BSCAN, { x: 200, y: 200 });
});

test("openSpecgenScope: 默认进入首个有内容的层（有 BSCAN 接口→BSCAN）", () => {
  useStore.setState({ doc: scopeDoc([], [{ id: "if1", busType: "BSCAN", role: "client", bscanVariant: "DC" }]) });
  useStore.getState().openSpecgenScope("p");
  assert.equal(useStore.getState().activeLayer, "BSCAN");
});

test("addToSpecgen: 默认进入首个有内容的层（有 SSN 接口→SSN，不停在只读全部）", () => {
  useStore.setState({ doc: scopeDoc([], [{ id: "if1", busType: "SSN", role: "client", busWidth: 4 }]), activeLayer: null });
  useStore.getState().addToSpecgen("p");
  assert.equal(useStore.getState().activeLayer, "SSN");
});

test("autoArrangeDft: 层间快照隔离——切层后再排列走全新排列而非误触恢复", () => {
  const ss: DftIpInstance = { id: "s1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 10, y: 10 } };
  const bs: DftIpInstance = { id: "b1", ipType: "EBScanPipeline", instanceName: "ebsp_1", position: { x: 20, y: 20 } };
  useStore.setState({ doc: scopeDoc([ss, bs]), activeLayer: "BSCAN", arrangeSnapshot: null });
  useStore.getState().autoArrangeDft("p", 600, 800);
  assert.equal(useStore.getState().arrangeSnapshot?.layer, "BSCAN", "BSCAN 排列后快照属 BSCAN");
  useStore.setState({ activeLayer: "SSN" }); // 切层（setActiveLayer 不清快照）
  useStore.getState().autoArrangeDft("p", 600, 800);
  // 修复前：defId 相同 → 误走恢复分支 → arrangeSnapshot 变 null；修复后：layer 不同 → 全新排列 → 快照属 SSN
  assert.equal(useStore.getState().arrangeSnapshot?.layer, "SSN", "切到 SSN 后应是全新 SSN 排列，非误触恢复");
});

test("toggleDftIp additive 累加/移除；非 additive 单选", () => {
  useStore.setState({ doc: scopeDoc([]), selectedDftIps: [] });
  useStore.getState().toggleDftIp("a", true);
  useStore.getState().toggleDftIp("b", true);
  assert.deepEqual(useStore.getState().selectedDftIps, ["a", "b"]);
  useStore.getState().toggleDftIp("a", true);
  assert.deepEqual(useStore.getState().selectedDftIps, ["b"]);
  useStore.getState().toggleDftIp("c", false);
  assert.deepEqual(useStore.getState().selectedDftIps, ["c"]);
});
test("selectAllDftIps 排除 DesignInstance", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  const pp: DftIpInstance = { id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
  useStore.setState({ doc: scopeDoc([di, pp]), activeLayer: null });
  useStore.getState().selectAllDftIps("p");
  assert.deepEqual(useStore.getState().selectedDftIps, ["p1"]);
});
test("removeFromSpecgen 置 inSpecgen=false 并切走当前打开 scope", () => {
  const d = scopeDoc([]);
  d.library.defs.push({ id: "q", designName: "q", designLevel: "sub_block", designType: "tiling",
    interfaces: [], childInstances: [], connections: [], inSpecgen: true });
  useStore.setState({ doc: d, specgenScope: "p" });
  useStore.getState().removeFromSpecgen("p");
  assert.equal(topOf().inSpecgen, false);
  assert.equal(useStore.getState().specgenScope, "q");
});
test("clearDftScope 清内容（IP 与连线都清）", () => {
  const ssh: DftIpInstance = { id: "s1", ipType: "ScanHost", instanceName: "ssh_1", position: { x: 0, y: 0 } };
  const pp: DftIpInstance = { id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
  const doc = scopeDoc([ssh, pp]);
  doc.library.defs[0].dftWires = [{ id: "w1", from: { kind: "ip", ipId: "s1", port: "bus_data_out" }, to: { kind: "ip", ipId: "p1", port: "bus_data_in" } }];
  useStore.setState({ doc });
  useStore.getState().clearDftScope("p");
  assert.equal((topOf().dftIps ?? []).length, 0);
  assert.equal((topOf().dftWires ?? []).length, 0);
});
