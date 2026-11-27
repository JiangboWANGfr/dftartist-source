import { test } from "node:test";
import assert from "node:assert/strict";

import type { GenConnDocument, HardenDef } from "../../src/genconn/core/model.ts";
import type { DftIpInstance, DftEndpoint } from "../../src/genconn/core/dft-model.ts";
import {
  addToSpecgen, addDftIp, moveDftIp, deleteDftIp, setDftIpConfig,
  addDftWire, rotateDftIp, syncDesignInstances, migrateLegacyIpNames,
  clearDftScope, removeFromSpecgen,
} from "../../src/specgen/edit.ts";
import { validateDftWire } from "../../src/specgen/wire.ts";
import { applyAutoLayout } from "../../src/specgen/edit.ts";

function baseDoc(): GenConnDocument {
  const root: HardenDef = {
    id: "p", designName: "p", designLevel: "chip", designType: "hierarchical",
    interfaces: [], childInstances: [], connections: [],
  };
  return {
    schemaVersion: 1, library: { defs: [root] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}
const defOf = (d: GenConnDocument) => d.library.defs.find((x) => x.id === "p") as HardenDef;

test("addToSpecgen 置 inSpecgen=true，不动其它 def", () => {
  const d = addToSpecgen(baseDoc(), "p");
  assert.equal(defOf(d).inSpecgen, true);
});

test("addDftIp 追加一个 IP，带类型/自增名/位置，原 doc 不被改（不可变）", () => {
  const d0 = baseDoc();
  const d1 = addDftIp(d0, "p", "ScanHost");
  assert.equal(defOf(d0).dftIps, undefined);           // 原 doc 不变
  const ips = defOf(d1).dftIps!;
  assert.equal(ips.length, 1);
  assert.equal(ips[0].ipType, "ScanHost");
  assert.equal(ips[0].instanceName, "ssh_1");
  assert.ok(ips[0].id.length > 0);
});

test("addDftIp Edt → 自增名 edt_1", () => {
  const d = addDftIp(baseDoc(), "p", "Edt");
  assert.equal(defOf(d).dftIps![0].instanceName, "edt_1");
});

test("addDftIp ScanHost 带默认参数（可见可改可删，不是生成期注入）", () => {
  const d = addDftIp(baseDoc(), "p", "ScanHost");
  assert.deepEqual(defOf(d).dftIps![0].config, {
    use_clock_shaper_cell: "on",
    support_from_scan_out_le_strobing: "off",
  });
  // 只有 ScanHost 有房规默认；其它 IP 仍然从空配置开始。
  const e = addDftIp(baseDoc(), "p", "Edt");
  assert.equal(defOf(e).dftIps![0].config, undefined);
});

test("addDftIp 再加同型 → 名字自增到 _2，位置错开", () => {
  let d = addDftIp(baseDoc(), "p", "ScanHost");
  d = addDftIp(d, "p", "ScanHost");
  const ips = defOf(d).dftIps!;
  assert.deepEqual(ips.map((i) => i.instanceName), ["ssh_1", "ssh_2"]);
  assert.notDeepEqual(ips[0].position, ips[1].position);
});

test("moveDftIp 改位置", () => {
  let d = addDftIp(baseDoc(), "p", "Multiplexer");
  const id = defOf(d).dftIps![0].id;
  d = moveDftIp(d, "p", id, { x: 300, y: 120 });
  assert.deepEqual(defOf(d).dftIps![0].position, { x: 300, y: 120 });
});

test("deleteDftIp 删掉指定 IP", () => {
  let d = addDftIp(baseDoc(), "p", "Fifo");
  const id = defOf(d).dftIps![0].id;
  d = deleteDftIp(d, "p", id);
  assert.equal(defOf(d).dftIps!.length, 0);
});

// —— setDftIpConfig ——

test("setDftIpConfig 整体写入 config", () => {
  let d = addDftIp(baseDoc(), "p", "ScanHost");
  const id = defOf(d).dftIps![0].id;
  d = setDftIpConfig(d, "p", id, { foo: "bar" });
  assert.deepEqual(defOf(d).dftIps![0].config, { foo: "bar" });
});

// —— 连线校验 + 落线（wire.ts + addDftWire）——

test("validateDftWire out→in 合法，addDftWire 落线成功", () => {
  let d = addDftIp(baseDoc(), "p", "ScanHost");
  d = addDftIp(d, "p", "Pipeline");
  const [ssh, pp] = defOf(d).dftIps!;
  const from: DftEndpoint = { kind: "ip", ipId: ssh.id, port: "bus_data_out" };
  const to: DftEndpoint = { kind: "ip", ipId: pp.id, port: "bus_data_in" };
  assert.equal(validateDftWire(defOf(d), from, to), null);
  d = addDftWire(d, "p", from, to);
  assert.equal(defOf(d).dftWires!.length, 1);
});

test("validateDftWire 拒绝 in→out（起点必须是输出端口）", () => {
  let d = addDftIp(baseDoc(), "p", "ScanHost");
  d = addDftIp(d, "p", "Pipeline");
  const [ssh, pp] = defOf(d).dftIps!;
  const err = validateDftWire(defOf(d),
    { kind: "ip", ipId: ssh.id, port: "bus_data_in" },
    { kind: "ip", ipId: pp.id, port: "bus_data_out" });
  assert.ok(err);
});

test("validateDftWire 拒绝已占用的 in 口（每个 in 只接一条）", () => {
  let d = addDftIp(baseDoc(), "p", "ScanHost");
  d = addDftIp(d, "p", "OutputPipeline");
  d = addDftIp(d, "p", "Pipeline");
  const [ssh, opp, pp] = defOf(d).dftIps!;
  d = addDftWire(d, "p",
    { kind: "ip", ipId: ssh.id, port: "bus_data_out" },
    { kind: "ip", ipId: pp.id, port: "bus_data_in" });
  const err = validateDftWire(defOf(d),
    { kind: "ip", ipId: opp.id, port: "bus_data_out" },
    { kind: "ip", ipId: pp.id, port: "bus_data_in" });
  assert.ok(err);
});

test("deleteDftIp 级联删掉引用它的连线（避免孤儿线占着 in 口）", () => {
  let d = addDftIp(baseDoc(), "p", "ScanHost");
  d = addDftIp(d, "p", "Pipeline");
  const [ssh, pp] = defOf(d).dftIps!;
  d = addDftWire(d, "p",
    { kind: "ip", ipId: ssh.id, port: "bus_data_out" },
    { kind: "ip", ipId: pp.id, port: "bus_data_in" });
  assert.equal(defOf(d).dftWires!.length, 1);
  d = deleteDftIp(d, "p", ssh.id);
  assert.equal(defOf(d).dftIps!.length, 1);
  assert.equal(defOf(d).dftWires!.length, 0);
});

// —— rotateDftIp ——

test("rotateDftIp 顺时针 +90 / 逆时针 -90", () => {
  let d = addDftIp(baseDoc(), "p", "Pipeline");
  const id = defOf(d).dftIps![0].id;
  d = rotateDftIp(d, "p", id);
  assert.equal(defOf(d).dftIps![0].rotation, 90);
  d = rotateDftIp(d, "p", id, -1);
  assert.equal(defOf(d).dftIps![0].rotation, 0);
});

test("rotateDftIp: DesignInstance 不可旋转（跨层节点，返回原 doc 不变）", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  const d0 = withIps([di]);
  const d1 = rotateDftIp(d0, "p", "d1");
  assert.equal(d1, d0, "跨层节点旋转应为 no-op，返回同一 doc 引用");
  assert.equal(defOf(d1).dftIps![0].rotation, undefined);
});

// —— syncDesignInstances ——

test("syncDesignInstances 为 physical_block 子实例建 DesignInstance（名/模块/来源跟随）", () => {
  const pb: HardenDef = {
    id: "pbdef", designName: "core", designLevel: "physical_block", designType: "hierarchical",
    interfaces: [], childInstances: [], connections: [],
  };
  const root: HardenDef = {
    id: "p", designName: "p", designLevel: "chip", designType: "hierarchical",
    interfaces: [], childInstances: [{ id: "ci1", instanceName: "core_inst", hardenId: "pbdef" }], connections: [],
  };
  const doc: GenConnDocument = {
    schemaVersion: 1, library: { defs: [root, pb] }, ui: { openDefId: "p", rootDefId: "p" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
  const d = syncDesignInstances(doc, "p");
  const ips = d.library.defs.find((x) => x.id === "p")!.dftIps!;
  assert.equal(ips.length, 1);
  assert.equal(ips[0].ipType, "DesignInstance");
  assert.equal(ips[0].instanceName, "core_inst");
  assert.equal(ips[0].moduleName, "core");
  assert.equal(ips[0].sourceChildId, "ci1");
});

test("syncDesignInstances 无 physical_block 子块 → 返回同一个 doc 引用", () => {
  const d0 = baseDoc();
  assert.equal(syncDesignInstances(d0, "p"), d0);
});

// —— migrateLegacyIpNames：老自动实例名一次性迁移 ——

function withIps(ips: DftIpInstance[]): GenConnDocument {
  const d = baseDoc();
  return { ...d, library: { ...d.library, defs: [{ ...defOf(d), dftIps: ips }] } };
}
const ip = (over: Partial<DftIpInstance>): DftIpInstance =>
  ({ id: over.id ?? `ip_${Math.random()}`, ipType: "Pipeline", instanceName: "x", position: { x: 0, y: 0 }, ...over });

test("migrateLegacyIpNames: Multiplexer_1 → mux_1，ScanHost_2 → ssh_2（编号保留）", () => {
  const d = withIps([
    ip({ id: "a", ipType: "Multiplexer", instanceName: "Multiplexer_1" }),
    ip({ id: "b", ipType: "ScanHost", instanceName: "ScanHost_2" }),
  ]);
  const d2 = migrateLegacyIpNames(d, "p");
  const names = defOf(d2).dftIps!.map((i) => i.instanceName);
  assert.deepEqual(names, ["mux_1", "ssh_2"]);
});

test("migrateLegacyIpNames: 冲突顺延——已有新式 pp_1 + 老式 Pipeline_1 → Pipeline_1 变 pp_2", () => {
  const d = withIps([
    ip({ id: "a", ipType: "Pipeline", instanceName: "pp_1" }),
    ip({ id: "b", ipType: "Pipeline", instanceName: "Pipeline_1" }),
  ]);
  const d2 = migrateLegacyIpNames(d, "p");
  const names = defOf(d2).dftIps!.map((i) => i.instanceName);
  assert.deepEqual(names, ["pp_1", "pp_2"]);
});

test("migrateLegacyIpNames: 手动名/DesignInstance/同步实例不动", () => {
  const d = withIps([
    ip({ id: "a", ipType: "Multiplexer", instanceName: "my_mux" }),
    ip({ id: "b", ipType: "DesignInstance", instanceName: "DesignInstance_1" }),
    ip({ id: "c", ipType: "DesignInstance", instanceName: "core_inst", sourceChildId: "childX" }),
  ]);
  const d2 = migrateLegacyIpNames(d, "p");
  const names = defOf(d2).dftIps!.map((i) => i.instanceName);
  assert.deepEqual(names, ["my_mux", "DesignInstance_1", "core_inst"]);
});

test("migrateLegacyIpNames: 全部已是新式名 → 返回同一个 doc 引用", () => {
  const d = withIps([
    ip({ id: "a", ipType: "Multiplexer", instanceName: "mux_1" }),
    ip({ id: "b", ipType: "ScanHost", instanceName: "ssh_1" }),
  ]);
  const d2 = migrateLegacyIpNames(d, "p");
  assert.equal(d2, d);
});

test("moveDftIp: 单层 IP 写 position（layer 参不影响）", () => {
  let d = addDftIp(baseDoc(), "p", "Pipeline");
  const id = defOf(d).dftIps![0].id;
  d = moveDftIp(d, "p", id, { x: 300, y: 120 }, "SSN");
  assert.deepEqual(defOf(d).dftIps![0].position, { x: 300, y: 120 });
  assert.equal(defOf(d).dftIps![0].layerPos, undefined);
});

test("moveDftIp: DesignInstance 在具体层写 layerPos，不动 position 与别层", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core",
    position: { x: 10, y: 10 }, layerPos: { SSN: { x: 1, y: 1 } } };
  let d = withIps([di]);
  d = moveDftIp(d, "p", "d1", { x: 500, y: 500 }, "BSCAN");
  const out = defOf(d).dftIps![0];
  assert.deepEqual(out.position, { x: 10, y: 10 }, "position 不动");
  assert.deepEqual(out.layerPos!.SSN, { x: 1, y: 1 }, "SSN 覆盖不动");
  assert.deepEqual(out.layerPos!.BSCAN, { x: 500, y: 500 }, "BSCAN 覆盖被写入");
});

test("moveDftIp: DesignInstance 在 layer=null 写 position（全部视图不该发生但兜底一致）", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 10, y: 10 } };
  let d = withIps([di]);
  d = moveDftIp(d, "p", "d1", { x: 7, y: 7 }, null);
  assert.deepEqual(defOf(d).dftIps![0].position, { x: 7, y: 7 });
});

test("applyAutoLayout: DesignInstance 具体层写 layerPos，单层 IP 写 position", () => {
  const di: DftIpInstance = { id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 0, y: 0 } };
  const pp: DftIpInstance = { id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } };
  let d = withIps([di, pp]);
  d = applyAutoLayout(d, "p", { positions: { d1: { x: 40, y: 40 }, p1: { x: 60, y: 60 } }, mirror: {} }, "SSN");
  const [od, op] = defOf(d).dftIps!;
  assert.deepEqual(od.layerPos!.SSN, { x: 40, y: 40 });
  assert.deepEqual(od.position, { x: 0, y: 0 });
  assert.deepEqual(op.position, { x: 60, y: 60 });
});

// —— clearDftScope / removeFromSpecgen ——

test("clearDftScope 清空 dftIps 与 dftWires，其余不动", () => {
  let d = addToSpecgen(baseDoc(), "p");
  d = addDftIp(d, "p", "ScanHost");
  d = addDftIp(d, "p", "Pipeline");
  const [ssh, pp] = defOf(d).dftIps!;
  d = addDftWire(d, "p", { kind: "ip", ipId: ssh.id, port: "bus_data_out" }, { kind: "ip", ipId: pp.id, port: "bus_data_in" });
  d = clearDftScope(d, "p");
  assert.equal(defOf(d).dftIps!.length, 0);
  assert.equal(defOf(d).dftWires!.length, 0);
  assert.equal(defOf(d).inSpecgen, true, "clear 不改 inSpecgen");
});

test("removeFromSpecgen 置 inSpecgen=false，内容保留", () => {
  let d = addToSpecgen(baseDoc(), "p");
  d = addDftIp(d, "p", "ScanHost");
  d = removeFromSpecgen(d, "p");
  assert.equal(defOf(d).inSpecgen, false);
  assert.equal(defOf(d).dftIps!.length, 1, "内容保留，可再加入恢复");
});

test("同一 DI 可被 SSN 与 BSCAN 各连一条 in（不同端口，不撞 fan-in）", () => {
  const pp = ip({ id: "pp1", ipType: "Pipeline", instanceName: "pp_1" });
  const ebp = ip({ id: "ebp1", ipType: "EBScanPipeline", instanceName: "ebp_1" });
  const di = ip({ id: "di1", ipType: "DesignInstance", instanceName: "h1" });
  let d = withIps([pp, ebp, di]);
  d = addDftWire(d, "p", { kind: "ip", ipId: "pp1", port: "bus_data_out" }, { kind: "ip", ipId: "di1", port: "bus_data_in" });
  // 第二条线接 DI 的 BSCAN 端口（不同于已占用的 bus_data_in）→ 不该被 fan-in 挡
  const err = validateDftWire(defOf(d), { kind: "ip", ipId: "ebp1", port: "scan_out" }, { kind: "ip", ipId: "di1", port: "bscan_scan_in" });
  assert.equal(err, null, "SSN 与 BSCAN 各接 DI 的不同端口，校验通过");
});
