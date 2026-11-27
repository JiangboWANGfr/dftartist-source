import { test } from "node:test";
import assert from "node:assert/strict";
import type { DftIpInstance } from "../../src/genconn/core/dft-model.ts";
import { isCrossLayerIp, ipPosIn } from "../../src/specgen/edit.ts";

const di = (over: Partial<DftIpInstance> = {}): DftIpInstance =>
  ({ id: "d1", ipType: "DesignInstance", instanceName: "core", position: { x: 10, y: 10 }, ...over });
const pipe = (over: Partial<DftIpInstance> = {}): DftIpInstance =>
  ({ id: "p1", ipType: "Pipeline", instanceName: "pp_1", position: { x: 20, y: 20 }, ...over });

test("isCrossLayerIp 只对 DesignInstance 为 true", () => {
  assert.equal(isCrossLayerIp(di()), true);
  assert.equal(isCrossLayerIp(pipe()), false);
});

test("ipPosIn: 单层 IP 恒返回 position", () => {
  assert.deepEqual(ipPosIn(pipe(), "SSN"), { x: 20, y: 20 });
  assert.deepEqual(ipPosIn(pipe(), null), { x: 20, y: 20 });
});

test("ipPosIn: DesignInstance 具体层有覆盖用覆盖、无覆盖回退 position", () => {
  const d = di({ layerPos: { SSN: { x: 99, y: 88 } } });
  assert.deepEqual(ipPosIn(d, "SSN"), { x: 99, y: 88 });
  assert.deepEqual(ipPosIn(d, "BSCAN"), { x: 10, y: 10 });
  assert.deepEqual(ipPosIn(d, null), { x: 10, y: 10 });
});
