import { test } from "node:test";
import assert from "node:assert/strict";
import { filterDocToDomain } from "../../src/specgen/busFilter.ts";
import type { GenConnDocument } from "../../src/genconn/core/model.ts";

function doc(): GenConnDocument {
  const def = {
    id: "d1", designName: "top", designLevel: "chip" as const, designType: "tiling" as const,
    interfaces: [
      { id: "i1", busType: "SSN" as const, role: "client" as const },
      { id: "i2", busType: "JTAG1838" as const, role: "secondary" as const, interfaceName: "host_stap" },
    ],
    childInstances: [], connections: [],
    dftIps: [
      { id: "p1", ipType: "ScanHost" as const, instanceName: "sh1", position: { x: 0, y: 0 } },
      { id: "p2", ipType: "STapPipeline" as const, instanceName: "sp1", position: { x: 0, y: 0 } },
    ],
    dftWires: [],
  };
  return {
    schemaVersion: 1, library: { defs: [def] },
    ui: { openDefId: "d1", rootDefId: "d1" },
    ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
  };
}

test("filterDocToDomain('JTAG1838')：只留 JTAG1838 接口 + STAP IP", () => {
  const out = filterDocToDomain(doc(), "d1", "JTAG1838");
  const def = out.library.defs.find((d) => d.id === "d1")!;
  assert.deepEqual(def.interfaces.map((i) => i.id), ["i2"]);
  assert.deepEqual((def.dftIps ?? []).map((p) => p.id), ["p2"]);
});
