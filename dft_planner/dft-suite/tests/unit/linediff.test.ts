import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLines, fileStat } from "../../src/common/genpreview/linediff.ts";

test("新文件(before=undefined)全部按新增", () => {
  const d = diffLines(undefined, "a\nb\nc");
  assert.deepEqual(d.map((l) => l.type), ["add", "add", "add"]);
  assert.deepEqual(d.map((l) => l.text), ["a", "b", "c"]);
});
test("相同内容全是上下文", () => {
  const d = diffLines("a\nb", "a\nb");
  assert.deepEqual(d.map((l) => l.type), ["ctx", "ctx"]);
});
test("一增一删", () => {
  const d = diffLines("a\nb\nc", "a\nB\nc");
  const types = d.map((l) => l.type);
  assert.ok(types.includes("del") && types.includes("add"));
  assert.equal(d.find((l) => l.type === "del")?.text, "b");
  assert.equal(d.find((l) => l.type === "add")?.text, "B");
});
test("fileStat 计数 新增/删除 + isNew", () => {
  assert.deepEqual(fileStat(undefined, "a\nb"), { added: 2, removed: 0, isNew: true });
  const s = fileStat("a\nb\nc", "a\nB\nc");
  assert.equal(s.added, 1); assert.equal(s.removed, 1); assert.equal(s.isNew, false);
});
