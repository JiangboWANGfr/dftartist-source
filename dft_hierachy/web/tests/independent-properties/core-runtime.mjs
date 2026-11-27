import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
import { withReal, verifyFacts, result, real } from "./core.mjs";
import { capability, product, deep } from "./harness.mjs";
export const coreCases = [
  {
    id: "IP-CORE-parameterized",
    input: "own SV narrow W=2 / wide W=6 same definition",
    expected:
      "instance-specific widths/parameter text, original facts, same-definition targets not merged",
    run: () =>
      withReal(async (c) => {
        const a = await verifyFacts(c, "narrow", 2),
          b = await verifyFacts(c, "wide", 6);
        await c.m.load(a.inst.ref);
        assert.deepEqual(c.m.state.data, a.expected);
        const old = c.m.state;
        await c.m.load(b.inst.ref);
        assert.deepEqual(c.m.state.data, b.expected);
        assert.equal(
          old.data.ports.result.find((x) => x.name === "d").width,
          2,
        );
        deep(old);
      }, true),
  },
  {
    id: "IP-CORE-empty",
    input: "own real empty module instance",
    expected: "success with two genuine empty arrays, not missing data",
    run: () =>
      withReal(async (c) => {
        const x = await verifyFacts(c, "empty", null);
        await c.m.load(x.inst.ref);
        assert.deepEqual(c.m.state.data, x.expected);
      }, true),
  },
  {
    id: "IP-CORE-error-release",
    input: "real port ref followed by valid target and model dispose",
    expected:
      "original Core failure path; retry works; dispose does not close borrowed SDK",
    run: () =>
      withReal(async (c) => {
        const x = await verifyFacts(c, "narrow", 2);
        let error;
        try {
          await c.m.load(x.expected.ports.result[0].ref);
        } catch (e) {
          error = e;
        }
        assert.ok(error);
        assert.equal(error.origin, "core");
        await c.m.load(x.inst.ref);
        c.m.dispose();
        assert.ok(result(await c.client.roots()).length > 0);
      }, true),
  },
  {
    id: "IP-CORE-two-models",
    input: "two models bound to same real SDK",
    expected: "disposing one does not change other success or SDK",
    run: () =>
      withReal(async (c) => {
        const a = await verifyFacts(c, "narrow", 2),
          b = await verifyFacts(c, "wide", 6),
          other = c.newModel();
        await Promise.all([c.m.load(a.inst.ref), other.load(b.inst.ref)]);
        c.m.dispose();
        assert.deepEqual(other.state.data, b.expected);
        assert.ok(result(await c.client.roots()).length > 0);
      }, true),
  },
  {
    id: "IP-CORE-reopen",
    input: "close own first SDK then reopen same SV and new model",
    expected:
      "new snapshot, new model idle; old frozen state remains readable; no claim bare ref encodes origin",
    run: async () => {
      const a = await real(true);
      let id, old;
      try {
        id = a.m.snapshotId;
        await a.m.load(a.children[0].ref);
        old = a.m.state;
      } finally {
        await a.close();
      }
      await withReal(async (b) => {
        assert.notEqual(b.m.snapshotId, id);
        assert.deepEqual(b.m.state, { status: "idle", target: null });
        deep(old);
      }, true);
    },
  },
].map((c) => ({
  ...c,
  basis: "DESIGN 6.9.1-5 and B b_instance_properties.sv KAT",
}));
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      { count: coreCases.length, cases: coreCases.map(({ run, ...c }) => c) },
      null,
      2,
    ),
  );
else if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const report = {
    product,
    plannedCases: coreCases.length,
    executedCases: 0,
    skippedCases: 0,
    results: [],
  };
  try {
    report.stage = "production-export-capability";
    capability();
    report.stage = "real-Core-model-semantics";
    for (const c of coreCases) {
      await c.run();
      report.results.push({ id: c.id, pass: true });
      report.executedCases++;
    }
    report.exitCode = 0;
  } catch (error) {
    report.exitCode = 1;
    report.error = describeFailure(error);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
