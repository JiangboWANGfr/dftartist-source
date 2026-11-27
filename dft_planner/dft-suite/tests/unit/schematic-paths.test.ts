// Hierarchical paths the schematic COPIES and sends to dp_shell.
//
// Ground truth measured on the user's real design (processor_core, 2026-07-27):
//   get_nets processor_core/PROCESSOR_1/clock_module_0/mclk  -> hit
//   get_pins processor_core/PROCESSOR_1/clock_module_0/mclk  -> hit   (mclk IS a port)
//   get_nets processor_core/.../clock_module_0/nodiv_mclk    -> hit   (internal net, not a pin)
//   get_nets PROCESSOR_1/clock_module_0/mclk                 -> NOTHING (top-stripped form)
// So a command/copy path MUST keep the harden top. That is what these tests lock down.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fullNetPath, fullPin, realNodePath, userPath } from "../../src/hierarchy/schematic/paths.ts";

test("command paths keep the harden top and use '/'", () => {
  assert.equal(fullPin("processor_core.PROCESSOR_1.clock_module_0", "mclk"),
               "processor_core/PROCESSOR_1/clock_module_0/mclk");
  assert.equal(userPath("processor_core.PROCESSOR_1:dco_clk"), "processor_core/PROCESSOR_1/dco_clk");
  // a top-level port on the harden top itself
  assert.equal(fullPin("processor_core", "dco_clk"), "processor_core/dco_clk");
});

test("synthetic clock/reset-view node ids map back to real design objects", () => {
  // flop group -> its real clock pin (owner + net), NOT the synthetic id
  assert.equal(realNodePath("ff:clock:processor_core.GPIO_1.sync_cell_p1in_0:clk"),
               "processor_core.GPIO_1.sync_cell_p1in_0:clk");
  assert.equal(fullPin("ff:clock:processor_core.GPIO_1.sync_cell_p1in_0:clk", "clk"),
               "processor_core/GPIO_1/sync_cell_p1in_0/clk",
               "the pin name must not be appended twice");

  // RTL gate node -> the net it drives. An `assign` has NO physical pins, so no pin name is
  // ever appended (`.../puc_rst/y` would name an object that does not exist in the design).
  assert.equal(fullPin("g:processor_core.PROCESSOR_1.clock_module_0:puc_rst", "y"),
               "processor_core/PROCESSOR_1/clock_module_0/puc_rst");
  assert.equal(fullPin("g:processor_core.PROCESSOR_1.clock_module_0:puc_rst", "a"),
               "processor_core/PROCESSOR_1/clock_module_0/puc_rst");
  assert.equal(realNodePath("g:processor_core.PROCESSOR_1.clock_module_0:puc_rst"),
               "processor_core.PROCESSOR_1.clock_module_0:puc_rst");

  // terminus node -> the instance, with the " [reason]" annotation stripped
  assert.equal(realNodePath("term:processor_core.PROCESSOR_1.u_icgX [icg gated, en=X]"),
               "processor_core.PROCESSOR_1.u_icgX");

  // an SDC clock NAME is not a design path — callers hide the action rather than emit garbage
  assert.equal(realNodePath("clk:dco_clk"), "");
  assert.equal(realNodePath("pi:processor_core.dco_clk"), "processor_core.dco_clk");

  // behavioural-block ids carry their owning INSTANCE since the per-instance id change
  // (logic:<scope>:<file>:<line>); the scope is what copy / Show All Pins should resolve to.
  assert.equal(realNodePath("logic:top.u_ip.u1:/d/leaf.v:3"), "top.u_ip.u1");
  // old-format id (no scope) — a file path is not an instance, offer nothing
  assert.equal(realNodePath("logic:/d/leaf.v:3"), "");

  // source symbols map to the object they stand for — never leak the id prefix or the
  // synthetic pin (the bar once showed "port/processor_core/PROCESSOR_1/cpu_en/o").
  assert.equal(realNodePath("port:processor_core.PROCESSOR_1.cpu_en"),
               "processor_core.PROCESSOR_1.cpu_en");
  assert.equal(realNodePath("thru:processor_core.PROCESSOR_1.clock_module_0:mclk"),
               "processor_core.PROCESSOR_1.clock_module_0:mclk");
  assert.equal(fullPin("port:processor_core.PROCESSOR_1.cpu_en", "o"),
               "processor_core/PROCESSOR_1/cpu_en");
  assert.equal(fullPin("thru:processor_core.PROCESSOR_1.clock_module_0:mclk", "i"),
               "processor_core/PROCESSOR_1/clock_module_0/mclk");
  assert.equal(fullPin("pi:processor_core.dco_clk", "o"), "processor_core/dco_clk");
});

test("net path resolves to the scope declaring the net", () => {
  // both endpoints inside clock_module_0 -> the net is declared there
  assert.equal(
    fullNetPath("processor_core.PROCESSOR_1.clock_module_0",
                "processor_core.PROCESSOR_1.clock_module_0", "nodiv_mclk"),
    "processor_core.PROCESSOR_1.clock_module_0.nodiv_mclk");
  // crossing a boundary -> the net belongs to the common ancestor
  assert.equal(
    fullNetPath("processor_core.PROCESSOR_1", "processor_core.GPIO_1", "mclk"),
    "processor_core.mclk");
});
