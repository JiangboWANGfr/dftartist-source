import { test } from "node:test";
import assert from "node:assert/strict";

import type { HardenDef } from "../../src/genconn/core/model.ts";
import { autoLayoutPositions, linearizeDatapaths } from "../../src/specgen/layout.ts";

// 一个合法的单段 datapath：边界接口 if1(out脚) → ssh → pp → 边界接口 if1(in脚)。
function datapathScope(): HardenDef {
  return {
    id: "p", designName: "p", designLevel: "chip", designType: "hierarchical",
    interfaces: [{ id: "if1", busType: "SSN", role: "secondary", interfaceName: "sib1", busWidth: 4, isDataSource: true }],
    childInstances: [], connections: [],
    dftIps: [
      { id: "ssh", ipType: "ScanHost", instanceName: "ssh_1", position: { x: 0, y: 0 } },
      { id: "pp", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } },
    ],
    dftWires: [
      { id: "w1", from: { kind: "iface", instanceId: "p", interfaceId: "if1", pin: "out" }, to: { kind: "ip", ipId: "ssh", port: "bus_data_in" } },
      { id: "w2", from: { kind: "ip", ipId: "ssh", port: "bus_data_out" }, to: { kind: "ip", ipId: "pp", port: "bus_data_in" } },
      { id: "w3", from: { kind: "ip", ipId: "pp", port: "bus_data_out" }, to: { kind: "iface", instanceId: "p", interfaceId: "if1", pin: "in" } },
    ],
  };
}

test("linearizeDatapaths 在合法 datapath 上不抛错，得到一段含两个 IP 的链", () => {
  const scope = datapathScope();
  const segs = linearizeDatapaths(scope);
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0].order.map((n) => n.instanceName).sort(), ["pp_1", "ssh_1"]);
});

test("autoLayoutPositions 给每个 dftIp 一个数值坐标 + 返回 mirror map", () => {
  const scope = datapathScope();
  const { positions, mirror } = autoLayoutPositions(scope);
  for (const ip of scope.dftIps!) {
    const p = positions[ip.id];
    assert.ok(p, `缺 ${ip.instanceName} 的位置`);
    assert.equal(typeof p.x, "number");
    assert.equal(typeof p.y, "number");
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  assert.equal(typeof mirror, "object");
});

test("autoLayoutPositions 在无 datapath 的 scope 上兜底（不抛错，网格排布）", () => {
  const scope: HardenDef = {
    id: "p", designName: "p", designLevel: "chip", designType: "hierarchical",
    interfaces: [], childInstances: [], connections: [],
    dftIps: [{ id: "pp", ipType: "Pipeline", instanceName: "pp_1", position: { x: 0, y: 0 } }],
  };
  const { positions } = autoLayoutPositions(scope);
  assert.ok(positions["pp"]);
});
