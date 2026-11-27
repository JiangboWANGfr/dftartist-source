import { test } from "node:test";
import assert from "node:assert/strict";
import { componentSchema } from "../../src/specgen/schema.ts";

// 更正后 1838jtag 唯一可放置 IP = StapPipeline（STap/SecondaryHostScanInterface 属 genconn 边界接口，非 specgen IP）。
test("StapPipeline schema：props + Interface", () => {
  const s = componentSchema("STapPipeline");
  assert.deepEqual((s.props ?? []).map((p) => p.name), ["parent_instance", "leaf_instance_name", "capture_value", "so_retiming"]);
  const iface = (s.blocks ?? []).find((b) => b.name === "Interface")!;
  assert.deepEqual((iface.props ?? []).map((p) => p.name), ["scan_in", "scan_out", "tck", "shift_en", "capture_en"]);
});
