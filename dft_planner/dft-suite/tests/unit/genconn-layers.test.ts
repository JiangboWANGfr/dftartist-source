import { test } from "node:test";
import assert from "node:assert/strict";
import { layerStateOf } from "../../src/genconn/layers.ts";

test("layerStateOf：hidden 优先；activeLayer=null 全 normal；非活动层→dim", () => {
  assert.equal(layerStateOf("SSN", null, new Set()), "normal");
  assert.equal(layerStateOf("SSN", "SSN", new Set()), "normal"); // 活动层本身
  assert.equal(layerStateOf("IJTAG", "SSN", new Set()), "dim"); // 活动层生效、非本层
  assert.equal(layerStateOf("SSN", "SSN", new Set(["SSN"])), "hidden"); // 显式隐藏优先于活动
  assert.equal(layerStateOf("SSN", null, new Set(["SSN"])), "hidden");
  assert.equal(layerStateOf("BISR", "IJTAG", new Set(["BISR"])), "hidden");
});
