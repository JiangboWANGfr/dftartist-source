import { test } from "node:test"; import assert from "node:assert/strict";
import {
  applyBulk, filterRows, mergeCfg, overlayFromRows, rowIssue, selectByPattern, ssnWidths,
  type PadRow,
} from "../../src/hierarchy/core/pad.ts";

function mk(over: Partial<PadRow>): PadRow {
  return {
    path: "t.u", gpio: "G0", cell: "iopad", dir: "inout",
    padNet: "P", coreInNet: "i", coreOutNet: "o", autoEnableNet: "oe",
    bscanEn: false, reuse: "", func: "", enable: "oe", ...over,
  };
}

test("selectByPattern: 数字区间按数值比较(含前导零)", () => {
  const rows = [
    mk({ path: "a", gpio: "GPIO_01" }), mk({ path: "b", gpio: "GPIO_33" }),
    mk({ path: "c", gpio: "GPIO_64" }), mk({ path: "d", gpio: "GPIO_65" }),
    mk({ path: "e", gpio: "EMMC_DAT3" }),
  ];
  const hit = selectByPattern(rows, "GPIO_33..64");
  assert.deepEqual([...hit].sort(), ["b", "c"]);
  assert.ok(selectByPattern(rows, "GPIO_1..40").has("a")); // GPIO_01 -> n=1
});

test("selectByPattern: glob 与子串", () => {
  const rows = [mk({ path: "a", gpio: "EMMC_DAT3" }), mk({ path: "b", gpio: "GPIO_1" })];
  assert.deepEqual([...selectByPattern(rows, "EMMC_*")], ["a"]);
  assert.deepEqual([...selectByPattern(rows, "gpio")], ["b"]); // 大小写不敏感子串
  assert.equal(selectByPattern(rows, "").size, 0);
});

test("applyBulk: reuse 跳过非 inout 并计数; 其它键照常应用", () => {
  const rows = [mk({ path: "a", dir: "inout" }), mk({ path: "b", dir: "in" })];
  const { rows: next, skipped } = applyBulk(rows, new Set(["a", "b"]), { reuse: "in", bscanEn: true });
  assert.equal(skipped, 1);
  assert.equal(next[0].reuse, "in");
  assert.equal(next[1].reuse, "");        // 跳过
  assert.ok(next[0].bscanEn && next[1].bscanEn); // bscan 两行都应用
  assert.equal(rows[0].reuse, "");        // 不可变: 原数组未动
});

test("rowIssue: ssn 双向无 reuse 报错; 指派后通过; 固定向 ssn 通过", () => {
  assert.ok(rowIssue(mk({ func: "ssn", dir: "inout", reuse: "" })));
  assert.equal(rowIssue(mk({ func: "ssn", dir: "inout", reuse: "in" })), null);
  assert.equal(rowIssue(mk({ func: "ssn", dir: "in" })), null);
});

test("filterRows: dir/状态/名称组合", () => {
  const rows = [
    mk({ path: "a", dir: "inout", reuse: "", gpio: "GPIO_1" }),
    mk({ path: "b", dir: "inout", reuse: "in", bscanEn: true, gpio: "GPIO_2" }),
    mk({ path: "c", dir: "in", gpio: "CLK" }),
    mk({ path: "d", dir: "inout", gpio: "" }), // gpio 未解析
  ];
  assert.deepEqual(filterRows(rows, { dir: "in", state: "", name: "" }).map((r) => r.path), ["c"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "no-reuse", name: "" }).map((r) => r.path), ["a", "d"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "bscan-y", name: "" }).map((r) => r.path), ["b"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "unresolved", name: "" }).map((r) => r.path), ["d"]);
  assert.deepEqual(filterRows(rows, { dir: "", state: "", name: "gpio_1" }).map((r) => r.path), ["a"]);
});

test("overlayFromRows: 只输出非默认值, snake_case, enable 仅在覆盖时输出", () => {
  const rows = [
    mk({ path: "a" }),                                              // 全默认 -> 不出现
    mk({ path: "b", bscanEn: true, reuse: "in", func: "ssn" }),
    mk({ path: "c", enable: "my_en" }),                             // enable 覆盖
  ];
  const o = overlayFromRows(rows);
  assert.deepEqual(Object.keys(o.pads).sort(), ["b", "c"]);
  assert.deepEqual(o.pads.b, { bscan_en: "yes", reuse: "in", func: "ssn" });
  assert.deepEqual(o.pads.c, { enable: "my_en" });
});

test("mergeCfg: path 对齐合并, 消失的 path 进 dropped", () => {
  const rows = [mk({ path: "a" }), mk({ path: "b", dir: "inout" })];
  const { rows: next, dropped } = mergeCfg(rows, {
    pads: { b: { reuse: "out", bscan_en: "yes" }, gone: { reuse: "in" } },
  });
  assert.deepEqual(dropped, ["gone"]);
  assert.equal(next[1].reuse, "out");
  assert.ok(next[1].bscanEn);
  assert.equal(next[0].reuse, "");
  const same = mergeCfg(rows, null);
  assert.equal(same.rows, rows);
});

test("ssnWidths: 有效方向计数", () => {
  const rows = [
    mk({ func: "ssn", dir: "inout", reuse: "in" }),
    mk({ path: "x", func: "ssn", dir: "in" }),
    mk({ path: "y", func: "ssn", dir: "inout", reuse: "out" }),
    mk({ path: "z", func: "" }),
  ];
  const s = ssnWidths(rows);
  assert.equal(s.inWidth, 2);
  assert.equal(s.outWidth, 1);
});
