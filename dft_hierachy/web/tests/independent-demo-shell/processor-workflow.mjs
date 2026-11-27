// Existing M5-A-04 stage workflow, explicit opt-in; never added to the original 26.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export const processorWorkflow = {
  id: "M5-A04-processor-core",
  input: {
    filelist: "nx9000/design/processor_core/processor_core.vc",
    top: "processor_core",
    path: "processor_core.PROCESSOR_1.execution_unit_0",
    search: "GPIO_1",
  },
  expected:
    "standalone app shows unselected root; explicit deep path reveals correct instance; search explicitly selects GPIO_1; source matches RTL definition/declarator; public close completes",
  basis: "DESIGN §6.27/§9/§10; M5-A-04; processor_core.v:1969 and openMSP430.v:354",
  async run(c) {
    const input = process.env.HIER_B_PROCESSOR_FILELIST;
    assert(input && path.isAbsolute(input), "explicit readonly real design input");
    const filelist = fs.realpathSync(input),
      dir = path.dirname(filelist);
    assert.equal(path.basename(filelist), "processor_core.vc");
    const steps = [],
      source = (name) => fs.readFileSync(path.join(dir, name), "utf8");
    c.files.filelist = filelist;
    c.files.top = "processor_core";
    await c.openUI("filelist");
    await c.ui("initialDesign", c.files.top);
    steps.push("unselected-root");
    await c.click("tree", c.files.top);
    await c.ui("property", c.files.top);
    await c.ui("sourceHighlightPattern", "module\\s+processor_core\\b");
    assert.equal((await c.ui("sourceState")).code, source("processor_core.v"));
    steps.push("root-properties-and-original-source");
    await c.submit("path", processorWorkflow.input.path);
    await c.choose("path", "execution_unit_0");
    await c.ui("property", "execution_unit_0");
    await c.ui("treeContains", ["execution_unit_0"]);
    await c.click("tree", "execution_unit_0");
    await c.ui("sourceHighlightPattern", "module\\s+omsp_execution_unit\\b");
    assert.equal((await c.ui("sourceState")).code, source("omsp_execution_unit.v"));
    steps.push("deep-path-confirm-reveal-and-browse");
    await c.submit("search", processorWorkflow.input.search);
    await c.choose("search", "GPIO_1", "选择对象");
    await c.ui("property", "GPIO_1");
    await c.ui("sourceHighlightPattern", "module\\s+omsp_gpio\\b");
    assert.equal((await c.ui("sourceState")).code, source("omsp_gpio.v"));
    steps.push("explicit-search-and-definition");
    await c.ui("sourceKind", "instantiation");
    await c.ui("sourceHighlight", "GPIO_1(");
    const selected = await c.ui("sourceState");
    assert.equal(selected.code, source("processor_core.v"));
    const marks = selected.marks.join("");
    assert(marks.startsWith("GPIO_1("), "original instance declarator, not module type");
    assert(marks.includes(".irq_port1  (irq[0])"), "GPIO_1 original connection");
    assert(!marks.includes("GPIO_2("), "not a different occurrence");
    steps.push("original-instantiation-source");
    await c.closeUI();
    steps.push("public-close-completed");
    c.milestoneEvidence = { input: filelist, steps, instantiation: marks };
  },
};
