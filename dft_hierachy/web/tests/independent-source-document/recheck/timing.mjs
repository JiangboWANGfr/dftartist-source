// Narrow precision freeze from C-ORCH-6's public contract decision, not A code.
import assert from "node:assert/strict";
import {
  boot,
  using,
  begin,
  second,
  invoke,
  failure,
  local,
  read,
  releaseAll,
} from "../harness.mjs";
import { describeFailure } from "../../independent-tree-view/ui/resource-cleanup.mjs";
const cases = [];
for (const stage of ["source", "readSource"])
  for (const action of ["cancel", "clear"])
    cases.push({
      id: `SD-BD01-${stage}-${action}`,
      input: {
        stage,
        action,
        event: "dispose in action notification",
        waiters: 2,
      },
      expected:
        "old load and joiner disposed with Source cancelled cause; own action disposed; no later listener or revival; borrowed SDK usable",
      basis:
        "C-ORCH-6 incremental public decision / DESIGN6.9.4+6.10.4, BD-SOURCE-01 precision",
      run: () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "readSource") t = await second(c, t);
          const join = invoke(c, "load", t.ref, t.kind),
            n = c.events.length;
          let later = 0;
          c.m.subscribe(() => {
            if (c.m.state.status !== "pending") c.m.dispose();
          });
          c.m.subscribe(() => {
            later++;
          });
          const own = invoke(c, action);
          for (const waiter of [t.o, join]) {
            const e = await failure(waiter, "disposed");
            local(e, "disposed");
            local(e.cause, "cancelled");
          }
          local(await failure(own, "disposed"), "disposed");
          assert.equal(later, 0);
          assert.equal(c.events.length, n + 1);
          assert.deepEqual(c.m.state, { status: "idle", target: null });
          assert.equal(c.m.disposed, true);
          assert.equal(c.wire.closed, false);
          assert.equal(c.m.snapshotId, c.client.snapshot.snapshotId);
          const p = c.client.readSource("B-still-usable"),
            q = await c.wire.next(
              "source.read",
              (q) => q.params.file === "B-still-usable",
            );
          c.wire.ok(q, read());
          assert.equal((await p).result.text, "abc");
        }),
    });
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      { count: cases.length, cases: cases.map(({ run, ...r }) => r) },
      null,
      2,
    ),
  );
else {
  const report = {
    kind: "B-BD-SOURCE-01-precision",
    planned: cases.length,
    executed: 0,
    skipped: 0,
    stage: "public-capability",
    results: [],
  };
  try {
    await boot();
    report.stage = "contract-precision";
    for (const c of cases) {
      let timer, problem;
      try {
        await Promise.race([
          c.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B timing watchdog, not SLA")),
              10000,
            );
          }),
        ]);
      } catch (e) {
        problem = describeFailure(e);
      } finally {
        clearTimeout(timer);
        try {
          await releaseAll();
        } catch (e) {
          problem = { primary: problem, cleanup: describeFailure(e) };
        }
      }
      report.executed++;
      report.results.push({
        id: c.id,
        pass: !problem,
        ...(problem ? { error: problem } : {}),
      });
    }
    assert.ok(report.results.every((r) => r.pass));
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = describeFailure(e);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
