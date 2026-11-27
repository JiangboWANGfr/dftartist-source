import { test } from "node:test";
import assert from "node:assert/strict";
import { expandInterface } from "../../src/genconn/core/expand.ts";
import type { BusInterface } from "../../src/genconn/core/model.ts";

const client: BusInterface = { id: "c", busType: "JTAG1838", role: "client" };
const sec: BusInterface = { id: "s", busType: "JTAG1838", role: "secondary", interfaceName: "host_stap" };

test("JTAG1838 client：stap_ + [ijtag_] + leaf", () => {
  const names = expandInterface(client).map((s) => `${s.direction} ${s.name}`);
  assert.deepEqual(names, [
    "input stap_tck", "input stap_tms", "input stap_trst",
    "input stap_ijtag_reset", "input stap_ijtag_ce", "input stap_ijtag_se", "input stap_ijtag_ue",
    "input stap_tdi", "output stap_tdo",
  ]);
});

test("JTAG1838 secondary：<if>_[ijtag_]to_/from_ leaf", () => {
  const names = expandInterface(sec).map((s) => `${s.direction} ${s.name}`);
  assert.deepEqual(names, [
    "output host_stap_to_tck", "output host_stap_to_tms", "output host_stap_to_trst",
    "output host_stap_ijtag_to_reset", "output host_stap_ijtag_to_ce", "output host_stap_ijtag_to_se", "output host_stap_ijtag_to_ue",
    "output host_stap_to_tdi", "input host_stap_from_tdo",
  ]);
});
