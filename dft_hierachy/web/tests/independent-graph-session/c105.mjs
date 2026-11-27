// Opt-in single C-105 regression; no generic performance SLA or product instrumentation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { capability, using, source, command, local, find, consistent } from "./harness.mjs";
import { fragment, X } from "./input.mjs";

const depth = 36;
function shared(value) {
  let v = { terminal: value };
  for (let i = 0; i < depth; i++) v = { a: v, b: v };
  return v;
}
const input = (c, left, right) => {
  const n = X();
  n.value.B_c105 = { first: left, second: right };
  return fragment(c, [n]);
};
if (process.argv.includes("--worker")) {
  capability();
  await using(async (c) => {
    const a = source(c),
      b = source(c),
      left = shared("B same leaf");
    await command(c, a, "replace", input(c, left, left));
    console.log(
      JSON.stringify({
        stage: "before-shared-equal-replace",
        depth,
        distinctExtensionObjectsA: depth + 2,
        nodes: 1,
        edges: 0,
      }),
    );
    await command(c, b, "replace", input(c, shared("B same leaf"), shared("B same leaf")));
    assert.deepEqual(find(c, "B-x").owners, [a.id, b.id]);
    const before = c.graph.state;
    // Either traversal order must compare distinct (left,right) pairs, not only left objects.
    for (const changed of ["first", "second"]) {
      const one = shared(changed === "first" ? "B different leaf" : "B same leaf"),
        two = shared(changed === "second" ? "B different leaf" : "B same leaf");
      await assert.rejects(command(c, b, "replace", input(c, one, two)), local("conflicting_fact"));
      assert.equal(c.graph.state, before, "non-equal replacement must be atomic");
      assert.deepEqual(find(c, "B-x").owners, [a.id, b.id]);
    }
    consistent(c.graph.state);
    console.log(
      JSON.stringify({
        stage: "shared-equality-and-both-conflict-controls-complete",
        passed: true,
      }),
    );
  });
} else {
  // Same 20s safety guard as the original finite runtime tests, moved outside a blocked JS thread.
  // This process owns only this worker; it has no Core/OS transport or child of its own.
  const worker = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker"], {
    env: process.env,
    encoding: "utf8",
    timeout: 20000,
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
  });
  const passed = worker.status === 0 && !worker.error;
  console.log(
    JSON.stringify(
      {
        id: "G25-C105-shared-acyclic-comparison",
        input:
          "one canonical node; A aliases two branches of a depth36 acyclic extension; B has structurally equal independent branches, then each branch differs in turn",
        expected:
          "equal input shares owners; each non-equal input rejects conflicting_fact atomically without losing either owner",
        basis: "DESIGN 6.28.2/.3; real C-105, original G01-24 unchanged",
        planned: 1,
        passed: passed ? 1 : 0,
        failed: passed ? 0 : 1,
        skipped: 0,
        safetyWatchdogOnly: true,
        worker: {
          pid: worker.pid,
          status: worker.status,
          signal: worker.signal,
          error: worker.error ? String(worker.error) : null,
          stdout: worker.stdout,
          stderr: worker.stderr,
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = passed ? 0 : 1;
}
