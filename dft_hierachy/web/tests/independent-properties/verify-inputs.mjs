import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import "./diagnostic-cases.mjs";
import "./subscribe-cases.mjs";
import { coreCases } from "./core-runtime.mjs";
const all = [...cases, ...coreCases];
assert.equal(new Set(all.map((c) => c.id)).size, all.length);
for (const c of all)
  assert.ok(
    c.input && c.expected && c.basis && typeof c.run === "function",
    c.id,
  );
for (const group of [
  "construct",
  "input",
  "data",
  "tasks",
  "lifecycle",
  "errors",
  "ownership",
  "notifications",
  "diagnostic",
  "promises",
  "subscribe-disposal",
])
  assert.ok(
    cases.some((c) => c.group === group),
    group,
  );
for (const stage of ["instance", "ports", "params"])
  for (const suffix of [
    "normal-" + stage + "-shared-cycle",
    "normal-" + stage + "-function",
    "dispose-" + stage + "-data-true",
  ])
    assert.ok(cases.some((c) => c.id === "IP-R-" + suffix));
assert.equal(cases.filter((c) => c.group === "subscribe-disposal").length, 29);
assert.equal(cases.filter((c) => c.group !== "subscribe-disposal").length, 252);
console.log(
  JSON.stringify({
    runtimeInputs: cases.length,
    realCoreModelInputs: coreCases.length,
    groups: Object.fromEntries(
      [...new Set(cases.map((c) => c.group))].map((g) => [
        g,
        cases.filter((c) => c.group === g).length,
      ]),
    ),
    typeNegatives: 22,
    allInputExpectedBasisPresent: true,
    productionSemanticsExecuted: 0,
  }),
);
