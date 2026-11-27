import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDocument } from "../../src/genconn/core/document.ts";
import { allocModuleDs, allocMuxDs, upsertCtrlIp, removeCtrlIp, ctrlIpByModule, moduleNameOf, addDfxInstance, removeDfxInstance, targetsFromSpec }
  from "../../src/genconn/dfx/edit.ts";
import { useStore } from "../../src/genconn/store.ts";
import type { DfxRow } from "../../src/genconn/dfx/build.ts";
import type { CtrlIpSpec } from "../../src/genconn/core/model.ts";

test("counters are independent and monotonic (D3/A6)", () => {
  let d = emptyDocument("chip");
  let r = allocModuleDs(d); d = r.doc;
  assert.equal(r.ds, 1);
  r = allocModuleDs(d); d = r.doc;
  assert.equal(r.ds, 2);
  const m = allocMuxDs(d, 3); d = m.doc;          // 一次要 3 个 mux 号
  assert.deepEqual(m.ds, [1, 2, 3]);
  const m2 = allocMuxDs(d, 1); d = m2.doc;
  assert.deepEqual(m2.ds, [4]);                    // 跨模块连续
  assert.equal(allocModuleDs(d).ds, 3);            // 模块计数器不受 mux 影响
});

test("allocMuxDs(0): empty list, counter unchanged", () => {
  const d = emptyDocument("chip");
  const m = allocMuxDs(d, 0);
  assert.deepEqual(m.ds, []);
  assert.equal(m.doc.muxDsNext, d.muxDsNext);
});

test("moduleNameOf without dsIndex is just the base", () => {
  assert.equal(moduleNameOf({ schemaVersion: 2, moduleBase: "m", pins: [] }), "m");
});

test("upsert/remove ctrlIp keyed by final module name", () => {
  let d = emptyDocument("chip");
  const entry = {
    spec: { schemaVersion: 2 as const, moduleBase: "pll_ctrl", dsIndex: 1, pins: [] },
    ctrlInstId: "i1", targets: {},
  };
  d = upsertCtrlIp(d, entry);
  assert.equal(d.ctrlIps.length, 1);
  d = upsertCtrlIp(d, { ...entry, ctrlInstId: "i2" });   // 同名 -> 替换
  assert.equal(d.ctrlIps.length, 1);
  assert.equal(d.ctrlIps[0].ctrlInstId, "i2");
  assert.equal(moduleNameOf(entry.spec), "pll_ctrl_ds1");
  assert.ok(ctrlIpByModule(d, "pll_ctrl_ds1"));
  d = removeCtrlIp(d, "pll_ctrl_ds1");
  assert.equal(d.ctrlIps.length, 0);
});

// ---- M3 去画布化：dfxInstances + confirmCtrlIpV3 ----

test("addDfxInstance dedups; removeDfxInstance drops the nodeId (M3/D11)", () => {
  let d = emptyDocument("chip");
  d = addDfxInstance(d, "top.pll");
  d = addDfxInstance(d, "top.pll");                 // 同 nodeId 再加 → 去重
  assert.deepEqual(d.dfxInstances, ["top.pll"]);
  d = addDfxInstance(d, "top.mem");
  assert.deepEqual(d.dfxInstances, ["top.pll", "top.mem"]);
  d = removeDfxInstance(d, "top.pll");
  assert.deepEqual(d.dfxInstances, ["top.mem"]);
});

test("targetsFromSpec reverse-looks-up nodeIds from spec.pins via dfxInstances (V3 has no targets map)", () => {
  const spec: CtrlIpSpec = {
    schemaVersion: 2, moduleBase: "pll_ctrl", dsIndex: 1,
    pins: [
      { portName: "enable", mode: "control", width: 1, target: "PLL_1/enable" },
      { portName: "LOCKED", mode: "observe", width: 1, target: "PLL_1/LOCKED" }, // 同实例 → 去重
      { portName: "cfg", mode: "control", width: 1, target: "u_a/u_b/cfg" },      // 嵌套实例
    ],
  };
  const tgs = targetsFromSpec(spec, ["chip_top.PLL_1", "chip_top.u_a.u_b"]);
  assert.equal(tgs.length, 2, "两个不同目标实例(PLL_1 去重)");
  assert.deepEqual(tgs[0], { nodeId: "chip_top.PLL_1", instName: "PLL_1", fallback: false });
  assert.deepEqual(tgs[1], { nodeId: "chip_top.u_a.u_b", instName: "u_b", fallback: false });
});

test("targetsFromSpec falls back to target instance segment when not in dfxInstances", () => {
  const spec: CtrlIpSpec = {
    schemaVersion: 2, moduleBase: "m", dsIndex: 1,
    pins: [{ portName: "en", mode: "control", width: 1, target: "PLL_9/en" }],
  };
  const tgs = targetsFromSpec(spec, ["chip_top.PLL_1"]); // PLL_9 不在 tab 上
  assert.deepEqual(tgs, [{ nodeId: "PLL_9", instName: "PLL_9", fallback: true }]);
});

test("confirmCtrlIpV3 writes a canvas-free ctrlIp (no ctrlInstId), bumps moduleDsNext (M3/§5.3)", () => {
  useStore.getState().newDoc("chip");
  const before = useStore.getState().doc.moduleDsNext;
  const rows: DfxRow[] = [
    { pin: "scan_en", dir: "in", width: 1, nodeId: "top.pll", instName: "u_pll", role: "control", stitch: ["mux"] },
  ];
  useStore.getState().confirmCtrlIpV3({ editModule: null, moduleBase: "pll_ctrl", rows });

  const doc = useStore.getState().doc;
  assert.equal(doc.ctrlIps.length, 1, "one ctrlIp entry written");
  const entry = ctrlIpByModule(doc, "pll_ctrl_ds1")!;
  assert.ok(entry, "keyed by final module name");
  assert.equal(entry.spec.moduleBase, "pll_ctrl");
  assert.equal(entry.ctrlInstId, undefined, "去画布：no canvas ctrlInstId");
  assert.equal(entry.targets, undefined, "去画布：no canvas targets map");
  assert.equal(entry.spec.pins[0].target, "pll/scan_en", "target carried by spec.pin");
  assert.equal(doc.moduleDsNext, before + 1, "moduleDsNext bumped");
});

test("confirmCtrlIpV3 registers all distinct row targets into dfxInstances (Fix1a: multi-instance edit round-trip)", () => {
  useStore.getState().newDoc("chip");
  const rows: DfxRow[] = [
    { pin: "enable", dir: "in", width: 1, nodeId: "chip_top.PLL_1", instName: "PLL_1", role: "control", stitch: ["mux"] },
    { pin: "start", dir: "in", width: 1, nodeId: "chip_top.RDS_1", instName: "RDS_1", role: "control", stitch: ["mux"] },
    { pin: "ready", dir: "out", width: 1, nodeId: "chip_top.RDS_1", instName: "RDS_1", role: "observe", stitch: [] },
  ];
  useStore.getState().confirmCtrlIpV3({ editModule: null, moduleBase: "multi_ctrl", rows });
  // 两个不同目标都被登记(RDS_1 去重),编辑反查(targetsFromSpec)方能命中完整 nodeId。
  assert.deepEqual(useStore.getState().doc.dfxInstances, ["chip_top.PLL_1", "chip_top.RDS_1"]);
});
