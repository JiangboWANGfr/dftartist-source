import { test } from "node:test"; import assert from "node:assert/strict";
import { complete, commonPrefix, parseCompletion, wordAt } from "../../src/hierarchy/core/complete.ts";

// Verbatim shape of `report_commands -completion`.
const FEED = [
  "get_instances\t-below_instances -of_instances -of_modules -direction -filter -regexp -limit",
  "get_ports\t-direction -filter -regexp -nocase -silent -limit",
  "get_pins\t-direction -filter -of_instances -limit",
  "report_commands\t-pattern -group -verbose -completion",
  "report_clock_tree\t-sdc -unconstrained",
  "report_reset\t-sdc -violations",
  "help\t",
].join("\n");
const CMDS = parseCompletion(FEED);

test("parseCompletion: name and switches, ignoring noise", () => {
  assert.equal(CMDS.length, 7);
  assert.deepEqual(CMDS[1], { name: "get_ports", opts: ["-direction", "-filter", "-regexp", "-nocase", "-silent", "-limit"] });
  assert.deepEqual(CMDS[6], { name: "help", opts: [] });
  assert.deepEqual(parseCompletion("no tab here\n# comment\n"), []);
});

test("commonPrefix", () => {
  assert.equal(commonPrefix(["report_reset", "report_clock_tree", "report_commands"]), "report_");
  assert.equal(commonPrefix(["a", "b"]), "");
  assert.equal(commonPrefix([]), "");
});

test("a unique command completes and gets its trailing space", () => {
  assert.deepEqual(complete("help", CMDS).line, "help ");
  assert.deepEqual(complete("get_pi", CMDS).line, "get_pins ");
});

test("an ambiguous command fills the common prefix and lists the candidates", () => {
  const r = complete("report_", CMDS);
  assert.equal(r.line, null, "already at the common prefix — nothing to add");
  assert.deepEqual(r.candidates, ["report_clock_tree", "report_commands", "report_reset"]);
  assert.equal(complete("rep", CMDS).line, "report_");
});

test("switches complete against THAT command, not the global set", () => {
  assert.equal(complete("get_ports -dir", CMDS).line, "get_ports -direction ");
  // -violations belongs to report_reset; get_ports must not offer it
  assert.equal(complete("get_ports -vio", CMDS).line, null);
  assert.equal(complete("report_reset -vio", CMDS).line, "report_reset -violations ");
  // an unknown command has no switches to offer
  assert.deepEqual(complete("no_such_cmd -x", CMDS).candidates, []);
});

test("a second word that is not a switch completes paths", () => {
  const paths = ["design.sv", "design.sdc", "spec/"];
  // two candidates share "design.s", so Tab fills exactly that much
  assert.equal(complete("read_sdc des", CMDS, paths).line, "read_sdc design.s");
  assert.equal(complete("read_sdc design.sd", CMDS, paths).line, "read_sdc design.sdc ");
});

test("the text before the word being completed is preserved verbatim", () => {
  assert.equal(complete("foreach p [get_po", CMDS).line, "foreach p [get_ports ");
  assert.equal(wordAt("foreach p [get_po"), "get_po");
  assert.equal(wordAt("get_ports {clk"), "clk");
});

test("nothing to complete is reported as nothing, not as an empty line", () => {
  assert.deepEqual(complete("zzz", CMDS), { line: null, candidates: [] });
});
