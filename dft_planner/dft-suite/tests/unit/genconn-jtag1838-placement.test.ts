import { test } from "node:test";
import assert from "node:assert/strict";
import { setInterfacePlacement } from "../../src/genconn/core/edit.ts";
import type { GenConnDocument } from "../../src/genconn/core/model.ts";

function doc(): GenConnDocument {
  return {
    schemaVersion: 1,
    library: { defs: [{
      id: "d", designName: "top", designLevel: "chip", designType: "hierarchical",
      interfaces: [
        { id: "js", busType: "JTAG1838", role: "secondary", interfaceName: "r1" },
        { id: "ss", busType: "SSN", role: "secondary", interfaceName: "s1" },
      ],
      childInstances: [], connections: [],
    }] },
    ui: { openDefId: "d", rootDefId: "d" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}

test("placement=other：JTAG1838 secondary 放行（STAP host）", () => {
  const out = setInterfacePlacement(doc(), "d", "js", "other");
  const iface = out.library.defs[0].interfaces.find((i) => i.id === "js")!;
  assert.equal(iface.placement, "other");
});

test("placement=other：非 JTAG1838 的 secondary 仍被拒（SSN 等不受影响）", () => {
  assert.throws(() => setInterfacePlacement(doc(), "d", "ss", "other"));
});
