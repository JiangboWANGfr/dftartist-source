// 示例工程：spec §9 的 chip 模型。既作 golden 测试输入，也供 UI「示例」加载。
// 实例带了 position 以便画布按图示布局；接口未设 edge → 渲染时自动分边。

import type { BusConnection, BusInterface, GenConnDocument, HardenDef, HardenInstance, HardenLibrary } from "../model.ts";
import { CURRENT_SCHEMA_VERSION } from "../document.ts";

function I(
  id: string,
  busType: BusInterface["busType"],
  role: BusInterface["role"],
  opts: Partial<BusInterface> = {},
): BusInterface {
  return { id, busType, role, ...opts };
}

// ---- def c1：tiling、client-only ----
const c1: HardenDef = {
  id: "c1", designName: "c1", designLevel: "sub_block", designType: "tiling",
  interfaces: [
    I("c1.bscan.cli", "BSCAN", "client", { bscanVariant: "DC" }),
    I("c1.ijtag.cli", "IJTAG", "client"),
    I("c1.bisr.cli.pdgB", "BISR", "client", { powerDomain: "pdgB" }),
    I("c1.ssn.cli", "SSN", "client", { busWidth: 4 }),
  ],
  childInstances: [], connections: [], inLibrary: true,
};

// ---- def c2：tiling，4 类 client（BISR pdgA+pdgB）+ secondary r1/r2 ----
const c2: HardenDef = {
  id: "c2", designName: "c2", designLevel: "physical_block", designType: "tiling",
  interfaces: [
    I("c2.bscan.cli", "BSCAN", "client", { bscanVariant: "DC" }),
    I("c2.bscan.r1", "BSCAN", "secondary", { interfaceName: "r1", bscanVariant: "DC" }),
    I("c2.bscan.r2", "BSCAN", "secondary", { interfaceName: "r2", bscanVariant: "DC" }),
    I("c2.ijtag.cli", "IJTAG", "client"),
    I("c2.ijtag.r1", "IJTAG", "secondary", { interfaceName: "r1" }),
    I("c2.ijtag.r2", "IJTAG", "secondary", { interfaceName: "r2" }),
    I("c2.bisr.cli.pdgA", "BISR", "client", { powerDomain: "pdgA" }),
    I("c2.bisr.cli.pdgB", "BISR", "client", { powerDomain: "pdgB" }),
    I("c2.bisr.r1.pdgB", "BISR", "secondary", { interfaceName: "r1", powerDomain: "pdgB" }),
    I("c2.bisr.r2.pdgB", "BISR", "secondary", { interfaceName: "r2", powerDomain: "pdgB" }),
    I("c2.ssn.cli", "SSN", "client", { busWidth: 4 }),
    I("c2.ssn.r1", "SSN", "secondary", { interfaceName: "r1", busWidth: 4 }),
    I("c2.ssn.r2", "SSN", "secondary", { interfaceName: "r2", busWidth: 4 }),
  ],
  childInstances: [], connections: [], inLibrary: true,
};

// ---- def c3：tiling、secondary-only。BISR 序：pdgA-left,pdgA-right,pdgB-left,pdgB-right ----
const c3: HardenDef = {
  id: "c3", designName: "c3", designLevel: "physical_block", designType: "tiling",
  interfaces: [
    I("c3.bscan.left", "BSCAN", "secondary", { interfaceName: "left", bscanVariant: "DC" }),
    I("c3.bscan.right", "BSCAN", "secondary", { interfaceName: "right", bscanVariant: "DC" }),
    I("c3.ijtag.left", "IJTAG", "secondary", { interfaceName: "left" }),
    I("c3.ijtag.right", "IJTAG", "secondary", { interfaceName: "right" }),
    I("c3.bisr.left.pdgA", "BISR", "secondary", { interfaceName: "left", powerDomain: "pdgA" }),
    I("c3.bisr.right.pdgA", "BISR", "secondary", { interfaceName: "right", powerDomain: "pdgA" }),
    I("c3.bisr.left.pdgB", "BISR", "secondary", { interfaceName: "left", powerDomain: "pdgB" }),
    I("c3.bisr.right.pdgB", "BISR", "secondary", { interfaceName: "right", powerDomain: "pdgB" }),
    I("c3.ssn.left", "SSN", "secondary", { interfaceName: "left", busWidth: 4 }),
    I("c3.ssn.right", "SSN", "secondary", { interfaceName: "right", busWidth: 4 }),
  ],
  childInstances: [], connections: [], inLibrary: true,
};

const inst = (id: string, hardenId: string, x: number, y: number): HardenInstance => ({
  id, instanceName: id, hardenId, position: { x, y },
});

let cid = 0;
const K = (sInst: string, sIf: string, cInst: string, cIf: string): BusConnection => ({
  id: `k${cid++}`, secondaryInstanceId: sInst, secondaryInterfaceId: sIf, clientInstanceId: cInst, clientInterfaceId: cIf,
});

const connections: BusConnection[] = [
  K("c3_i1", "c3.bscan.left", "c2_i1", "c2.bscan.cli"),
  K("c3_i1", "c3.ijtag.left", "c2_i1", "c2.ijtag.cli"),
  K("c3_i1", "c3.bisr.left.pdgA", "c2_i1", "c2.bisr.cli.pdgA"),
  K("c3_i1", "c3.bisr.left.pdgB", "c2_i1", "c2.bisr.cli.pdgB"),
  K("c3_i1", "c3.ssn.left", "c2_i1", "c2.ssn.cli"),
  K("c3_i1", "c3.bscan.right", "c2_i2", "c2.bscan.cli"),
  K("c3_i1", "c3.ijtag.right", "c2_i2", "c2.ijtag.cli"),
  K("c3_i1", "c3.bisr.right.pdgA", "c2_i2", "c2.bisr.cli.pdgA"),
  K("c3_i1", "c3.bisr.right.pdgB", "c2_i2", "c2.bisr.cli.pdgB"),
  K("c3_i1", "c3.ssn.right", "c2_i2", "c2.ssn.cli"),
  K("c2_i1", "c2.bscan.r1", "c1_i1", "c1.bscan.cli"),
  K("c2_i1", "c2.ijtag.r1", "c1_i1", "c1.ijtag.cli"),
  K("c2_i1", "c2.bisr.r1.pdgB", "c1_i1", "c1.bisr.cli.pdgB"),
  K("c2_i1", "c2.ssn.r1", "c1_i1", "c1.ssn.cli"),
  K("c2_i1", "c2.bscan.r2", "c1_i2", "c1.bscan.cli"),
  K("c2_i1", "c2.ijtag.r2", "c1_i2", "c1.ijtag.cli"),
  K("c2_i1", "c2.bisr.r2.pdgB", "c1_i2", "c1.bisr.cli.pdgB"),
  K("c2_i1", "c2.ssn.r2", "c1_i2", "c1.ssn.cli"),
  K("c2_i2", "c2.bscan.r1", "c1_i3", "c1.bscan.cli"),
  K("c2_i2", "c2.ijtag.r1", "c1_i3", "c1.ijtag.cli"),
  K("c2_i2", "c2.bisr.r1.pdgB", "c1_i3", "c1.bisr.cli.pdgB"),
  K("c2_i2", "c2.ssn.r1", "c1_i3", "c1.ssn.cli"),
  K("c2_i2", "c2.bscan.r2", "c1_i4", "c1.bscan.cli"),
  K("c2_i2", "c2.ijtag.r2", "c1_i4", "c1.ijtag.cli"),
  K("c2_i2", "c2.bisr.r2.pdgB", "c1_i4", "c1.bisr.cli.pdgB"),
  K("c2_i2", "c2.ssn.r2", "c1_i4", "c1.ssn.cli"),
];

// 顶层 chip：按图示布局（左 c1 列 / c2 / c3 / c2 / 右 c1 列）
export const chip: HardenDef = {
  id: "chip", designName: "chip", designLevel: "chip", designType: "hierarchical",
  interfaces: [],
  childInstances: [
    inst("c1_i1", "c1", 0, 0),
    inst("c1_i2", "c1", 0, 200),
    inst("c1_i3", "c1", 880, 0),
    inst("c1_i4", "c1", 880, 200),
    inst("c2_i1", "c2", 220, 0),
    inst("c2_i2", "c2", 660, 0),
    inst("c3_i1", "c3", 440, 0),
  ],
  connections,
};

export const chipLib: HardenLibrary = { defs: [chip, c1, c2, c3] };

export const chipDoc: GenConnDocument = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  library: chipLib,
  ui: { openDefId: "chip", rootDefId: "chip", viewport: { zoom: 1, panX: 0, panY: 0 } },
  ctrlIps: [],
  dfxInstances: [],
  moduleDsNext: 1,
  muxDsNext: 1,
};
