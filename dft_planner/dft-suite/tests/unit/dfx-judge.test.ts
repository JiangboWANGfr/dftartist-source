import { test } from "node:test"; import assert from "node:assert/strict";
import { parseTie, judgeBit, judgePin, tclTarget, parentOf } from "../../src/genconn/dfx/judge.ts";

test("parseTie: binary literal to per-bit values, bit0 = LSB", () => {
  assert.deepEqual(parseTie("1'b0", 1), [0]);
  assert.deepEqual(parseTie("1'b1", 1), [1]);
  // 4'b101 = 0101 -> bit0=1, bit1=0, bit2=1, bit3=0
  assert.deepEqual(parseTie("4'b101", 4), [1, 0, 1, 0]);
  assert.equal(parseTie("", 1), null);
  assert.equal(parseTie("garbage", 2), null);
  assert.equal(parseTie("8'b1", 4), null); // 声明宽度 ≠ 端口宽度
});

test("judgeBit: tie0->replace, tie1->mux, net->mux, dangling->connect", () => {
  assert.equal(judgeBit({ net: "", tie: 0 }), "replace");
  assert.equal(judgeBit({ net: "", tie: 1 }), "mux");
  assert.equal(judgeBit({ net: "w", tie: null }), "mux");
  assert.equal(judgeBit({ net: "", tie: null }), "connect");
});

test("judgePin: scalar and mixed bus", () => {
  assert.deepEqual(judgePin({ net: "", tie: "1'b0" }, 1), ["replace"]);
  // 4'b0101: bits [1,0,1,0] -> [mux, replace, mux, replace]
  assert.deepEqual(judgePin({ net: "", tie: "4'b101" }, 4), ["mux", "replace", "mux", "replace"]);
  assert.deepEqual(judgePin({ net: "clk_net", tie: "" }, 2), ["mux", "mux"]);
  assert.deepEqual(judgePin({ net: "", tie: "" }, 3), ["connect", "connect", "connect"]);
});

test("tclTarget: strip top segment, dots to slashes, append pin", () => {
  assert.equal(tclTarget("top.PLL_1", "enable"), "PLL_1/enable");
  assert.equal(tclTarget("chip.u_a.u_b", "din"), "u_a/u_b/din");
});

test("parentOf", () => {
  assert.equal(parentOf("top.u_mid.u_kid"), "top.u_mid");
  assert.equal(parentOf("top"), null);
});
