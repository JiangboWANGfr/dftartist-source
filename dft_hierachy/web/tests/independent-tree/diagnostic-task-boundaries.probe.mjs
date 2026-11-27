// Agent B additional public invariants, separate from unchanged 68/248/761 gates.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(
  new URL("./diagnostic-task-runner.mjs", import.meta.url),
);
const cases = [];
for (const method of ["roots", "children"])
  for (const pendingObserver of [false, true])
    cases.push({
      name:
        "Q01 " +
        method +
        " every same-page waiter retains original failure after diagnostic dispose, pending observer=" +
        pendingObserver,
      method,
      scenario: "waiter-dispose",
      dispose: true,
      pendingObserver,
    });
for (const dispose of [false, true])
  cases.push({
    name:
      "Q02 manual children/reveal shared page preserves original cause, getter dispose=" +
      dispose,
    method: "children",
    scenario: "shared-page",
    dispose,
  });
for (const method of ["roots", "children", "reveal"])
  cases.push({
    name: "Q03 " + method + " nested failure stops remaining ancestor fields",
    method,
    scenario: "ancestor-stop",
  });
assert.equal(cases.length, 9);
for (const cfg of cases)
  test(cfg.name, { timeout: 30000 }, () => {
    const child = spawnSync(
      process.execPath,
      ["--unhandled-rejections=throw", runner, JSON.stringify(cfg)],
      {
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      },
    );
    assert.equal(child.error, undefined, "test hang guard, not SLA");
    assert.equal(child.signal, null, child.stderr);
    assert.equal(
      child.status,
      0,
      "plain child must settle original task errors without background rejection:\n" +
        child.stdout +
        "\n" +
        child.stderr,
    );
    const observation = JSON.parse(child.stdout.trim().split("\n").at(-1));
    assert.equal(observation.method, cfg.method);
    assert.equal(observation.scenario, cfg.scenario);
  });
