import { test } from "node:test";
import assert from "node:assert/strict";
import { orderInterfaces, expandDef } from "../../src/genconn/core/order.ts";
import type { HardenDef } from "../../src/genconn/core/model.ts";

function def(): HardenDef {
  return {
    id: "d", designName: "top", designLevel: "chip", designType: "hierarchical",
    interfaces: [
      { id: "s", busType: "SSN", role: "client" },
      { id: "j", busType: "JTAG1838", role: "client" },
    ],
    childInstances: [], connections: [],
  };
}

test("orderInterfaces 保留 JTAG1838 接口（不被 BUS_ORDER 丢弃）", () => {
  const ids = orderInterfaces(def()).map((i) => i.id);
  assert.ok(ids.includes("j"), `JTAG1838 接口应保留，实际 ${JSON.stringify(ids)}`);
});

test("expandDef 含 JTAG1838 client 的 stap_* 端口", () => {
  const { inputPorts, outputPorts } = expandDef(def());
  const names = [...inputPorts, ...outputPorts].map((p) => p.name);
  assert.ok(names.includes("stap_tck"), "应含 stap_tck");
  assert.ok(names.includes("stap_tdo"), "应含 stap_tdo");
});
