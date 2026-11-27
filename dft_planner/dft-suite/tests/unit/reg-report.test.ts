import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRegReport } from "../../src/hierarchy/core/regReport.ts";

test("formatRegReport 产出 TCL 可 source 数组 + 汇总", () => {
  const rc = { total: 45678, counts: [
    { instanceId: "chip_top", own: 0, subtree: 45678, memoryBits: 2048 },
    { instanceId: "chip_top.u_cpu", own: 1234, subtree: 12000, memoryBits: 0 },
  ] };
  const s = formatRegReport("chip_top", rc);
  assert.ok(s.includes("set reg_count(chip_top,total_flops) 45678"));
  assert.ok(s.includes("set reg_count(chip_top,total_memory) 2048"));
  assert.ok(s.includes("set reg_count(chip_top.u_cpu,own) 1234"));
  assert.ok(s.includes("set reg_count(chip_top.u_cpu,subtree) 12000"));
  assert.ok(s.includes("set reg_count(chip_top.u_cpu,memory) 0"));
});
