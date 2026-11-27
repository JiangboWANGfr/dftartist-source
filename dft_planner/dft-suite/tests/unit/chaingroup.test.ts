import { test } from "node:test"; import assert from "node:assert/strict";
import { chainGroupOf, chainGroupMembers } from "../../src/specgen/chaingroup.ts";

import type { DftConfig } from "../../src/genconn/core/dft-model.ts";

const edt = (instanceName: string, group?: string) => ({
  ipType: "Edt" as const, instanceName,
  config: (group === undefined ? {} : { Connections: { ssh_chain_group: group } }) as DftConfig,
});

test("no group configured: the controller's own name, not a house default", () => {
  assert.equal(chainGroupOf(edt("int_edt")), "int_edt");
  assert.equal(chainGroupOf({ instanceName: "e", config: undefined }), "e");
  assert.equal(chainGroupOf(edt("e", "   ")), "e");   // blank is not a group name
});

test("a configured group wins, trimmed", () => {
  assert.equal(chainGroupOf(edt("int_edt", "edt_gp")), "edt_gp");
  assert.equal(chainGroupOf(edt("int_edt", " edt_gp ")), "edt_gp");
});

test("several controllers can share one group", () => {
  const m = chainGroupMembers([
    edt("int_edt", "edt_gp"), edt("ext_edt", "edt_gp"), edt("lone_edt"),
    { ipType: "ScanHost" as const, instanceName: "ssh_1", config: {} as DftConfig },
  ]);
  assert.deepEqual([...m.entries()], [["edt_gp", ["int_edt", "ext_edt"]], ["lone_edt", ["lone_edt"]]]);
});
