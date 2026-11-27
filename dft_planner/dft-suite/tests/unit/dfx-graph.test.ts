// buildDfxSchematicGraph(args) → SchematicGraph:把整张 DFX Ctrl tab 的「多实例 + 多
// ctrlIp」合成一张 ELK 原理图(detailGraph 的多修改推广)。纯函数,node --test 可 import。
import { test } from "node:test"; import assert from "node:assert/strict";
import { buildDfxSchematicGraph } from "../../src/genconn/dfx/dfxGraph.ts";

const instances = [
  { nodeId: "top.PLL_1", instanceName: "PLL_1", designName: "pll",
    ports: [{ name: "enable", direction: "in", width: 1 },
            { name: "LOCKED", direction: "out", width: 1 }] },
  { nodeId: "top.U_X", instanceName: "U_X", designName: "xmod",
    ports: [{ name: "cfg", direction: "in", width: 2 }] },
];
const ctrlIps = [
  { spec: { schemaVersion: 2 as const, moduleBase: "pll_ctrl", dsIndex: 1,
    pins: [
      { portName: "enable", mode: "control" as const, width: 1, target: "PLL_1/enable",
        stitch: "mux" as const, muxName: "u_dfx_PLL_1_enable_persistent_mux_inst_ds1" },
      { portName: "LOCKED", mode: "observe" as const, width: 1, target: "PLL_1/LOCKED" },
    ] } },
];

test("multi-instance + ctrlIp merge into one graph", () => {
  const g = buildDfxSchematicGraph({ instances: instances as never, ctrlIps: ctrlIps as never });
  // 两个实例节点存在(按 nodeId)
  assert.ok(g.nodes["top.PLL_1"]);
  assert.ok(g.nodes["top.U_X"]);
  // ctrl 块节点存在(终名 pll_ctrl_ds1)
  const names = Object.values(g.nodes).map((n: any) => n.instanceName);
  assert.ok(names.includes("pll_ctrl_ds1"));
  // mux 节点存在
  assert.ok(names.some((n: string) => n.includes("mux")));
  // dfx 源节点存在且唯一(多 ctrlIp 也只一个)
  const dfxNodes = Object.keys(g.nodes).filter((id) => id.includes("static_hyper"));
  assert.equal(dfxNodes.length, 1);
  // 控制 mux 边:ctrl 输出 -> mux;观测边:目标 -> ctrl
  assert.ok(g.edges.some((e: any) => e.fromNode.includes("pll_ctrl_ds1")));
  assert.ok(g.edges.some((e: any) => e.toNode.includes("pll_ctrl_ds1")));
  // mux.out -> 目标实例 PLL_1(桥接 tcl 路径->nodeId)
  assert.ok(g.edges.some((e: any) => e.toNode === "top.PLL_1"));
});

test("empty inputs -> empty graph, no throw", () => {
  const g = buildDfxSchematicGraph({ instances: [], ctrlIps: [] });
  assert.equal(Object.keys(g.nodes).length, 0);
  assert.equal(g.edges.length, 0);
});

test("two ctrlIps share single dfx source node", () => {
  const two = [ctrlIps[0], { spec: { ...ctrlIps[0].spec, moduleBase: "x2", dsIndex: 2,
    pins: [{ portName: "cfg", mode: "control" as const, width: 2, target: "U_X/cfg",
             stitch: ["mux", "replace"] as const,
             muxName: ["u_dfx_U_X_cfg_persistent_mux_inst_ds2", null] }] } }];
  const g = buildDfxSchematicGraph({ instances: instances as never, ctrlIps: two as never });
  assert.equal(Object.keys(g.nodes).filter((id) => id.includes("static_hyper")).length, 1);
});
