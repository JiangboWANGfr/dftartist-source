import { test } from "node:test"; import assert from "node:assert/strict";
import { controllerBlock, controllerConfig, mergeSpec, parseSpecBlock, type SpecNode } from "../../src/hierarchy/core/specblock.ts";
import { genBlock } from "../../src/specgen/gen.ts";
import { componentSchema } from "../../src/specgen/schema.ts";

// Verbatim shape of what ScanBudget.cpp emitController() writes, two controllers deep so the
// brace matching has something to get wrong.
const SPEC = `DftSpecification(processor_core,rtl) {
  ScanCompression {
    Controller(int_edt) {
      longest_chain_range           : 360, 440;
      scan_chain_count              : 5;
      input_channel_count           : 1;
      output_channel_count          : 1;
      separate_control_data_channels : on;
      Compactor {
        pipeline_logic_levels_in_compactor: 2;
      }
      ShiftPowerOptions {
        present               : on;
        min_switching_threshold_percentage: 5;
      }
      Connections {
        ssh_chain_group           : edt_gp;
        mode_enables              : DftSignal(int_edt_mode);
        EdtChannelsIn(1:1) {
          PipelineStage {
            leaf_instance_name    : dfx_int_edt_channels_in_pipe;
          }
        }
        EdtChannelsOut(1:1) {
          PipelineStage {
            leaf_instance_name    : dfx_int_edt_channels_out_pipe;
          }
        }
        scan_en                   : OptionalDftSignal(scan_en);
      }
    }
    Controller(ext_edt) {
      scan_chain_count              : 2;
    }
  }
}
`;

test("controllerBlock: brace-matched, and does not run into the next controller", () => {
  const b = controllerBlock(SPEC, "int_edt");
  assert.ok(b.startsWith("    Controller(int_edt) {"));
  assert.ok(b.trimEnd().endsWith("}"));
  assert.ok(!b.includes("ext_edt"));
  assert.equal(controllerBlock(SPEC, "no_such_edt"), "");
});

test("parseSpecBlock: the WHOLE block, not four scalars", () => {
  const c = controllerConfig(SPEC, "int_edt") as Record<string, never>;
  assert.equal(c.longest_chain_range as unknown, "360, 440");
  assert.equal(c.scan_chain_count as unknown, "5");
  assert.equal(c.separate_control_data_channels as unknown, "on");
  // The sub-blocks the dialog used to lose entirely.
  assert.deepEqual(c.Compactor as unknown, { pipeline_logic_levels_in_compactor: "2" });
  assert.deepEqual(c.ShiftPowerOptions as unknown,
    { present: "on", min_switching_threshold_percentage: "5" });
  const conn = c.Connections as unknown as SpecNode;
  assert.equal(conn.ssh_chain_group, "edt_gp");
  assert.equal(conn.mode_enables, "DftSignal(int_edt_mode)");
  assert.equal(conn.scan_en, "OptionalDftSignal(scan_en)");
  // An id'd block is a LIST, keyed by the range in its header.
  assert.deepEqual(conn.EdtChannelsIn, [
    { PipelineStage: { leaf_instance_name: "dfx_int_edt_channels_in_pipe" }, id: "1:1" },
  ]);
  assert.deepEqual(conn.EdtChannelsOut, [
    { PipelineStage: { leaf_instance_name: "dfx_int_edt_channels_out_pipe" }, id: "1:1" },
  ]);
});

test("parseSpecBlock: comments and blank lines are not fields", () => {
  const n = parseSpecBlock("X {\n  // a note\n\n  a : 1;\n}\n");
  assert.deepEqual(n, { a: "1" });
});

test("round-trip: parsed config regenerates the same fields through the Edt schema", () => {
  const cfg = controllerConfig(SPEC, "int_edt");
  const out = genBlock(componentSchema("Edt"), cfg as never, 0);
  for (const s of ["longest_chain_range", "scan_chain_count", "separate_control_data_channels",
                   "pipeline_logic_levels_in_compactor", "min_switching_threshold_percentage",
                   "ssh_chain_group", "mode_enables", "scan_en",
                   "dfx_int_edt_channels_in_pipe", "dfx_int_edt_channels_out_pipe"])
    assert.ok(out.includes(s), `regenerated block lost ${s}:\n${out}`);
  assert.ok(out.includes("EdtChannelsIn (1:1)"), out);
});

test("mergeSpec fill: keeps what was typed, fills what is empty, and is a no-op twice", () => {
  const base: SpecNode = { scan_chain_count: "99", input_channel_count: "" };
  const add = controllerConfig(SPEC, "int_edt");
  const m1 = mergeSpec(base, add);
  assert.equal(m1.scan_chain_count, "99");           // hand-typed wins
  assert.equal(m1.input_channel_count, "1");         // empty takes the planner's
  assert.equal((m1.Compactor as SpecNode).pipeline_logic_levels_in_compactor, "2");
  // Idempotent: a React effect calling this on every render must not create a new object.
  assert.equal(mergeSpec(m1, add), m1);
});

test("mergeSpec overwrite: Re-apply replaces even hand-typed values", () => {
  const base: SpecNode = { scan_chain_count: "99", Compactor: { pipeline_logic_levels_in_compactor: "7" } };
  const m = mergeSpec(base, controllerConfig(SPEC, "int_edt"), true);
  assert.equal(m.scan_chain_count, "5");
  assert.equal((m.Compactor as SpecNode).pipeline_logic_levels_in_compactor, "2");
  assert.equal(mergeSpec(m, controllerConfig(SPEC, "int_edt"), true), m);
});

test("mergeSpec: an existing channel range keeps its edits and gains the missing ones", () => {
  const base: SpecNode = { Connections: { EdtChannelsIn: [{ id: "1:1", port_pin_name: "chan_in" }] } };
  const m = mergeSpec(base, controllerConfig(SPEC, "int_edt"));
  const ch = (m.Connections as SpecNode).EdtChannelsIn as SpecNode[];
  assert.equal(ch.length, 1);
  assert.equal(ch[0].port_pin_name, "chan_in");
  assert.deepEqual(ch[0].PipelineStage, { leaf_instance_name: "dfx_int_edt_channels_in_pipe" });
});
