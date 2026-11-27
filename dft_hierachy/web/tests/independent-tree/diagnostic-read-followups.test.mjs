// Agent B: additive coverage from DESIGN 6.6.6; original 64 parent unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(
  new URL("./diagnostic-read-runner.mjs", import.meta.url),
);
const cases = ["roots", "children", "reveal"].map((method) => ({
  name:
    "R10 " + method + " throwing diagnostic restores per-model command guard",
  method,
  scenario: "reentrant",
  throwAfterRead: true,
}));
cases.push({
  name: "R11 shared failing object uses its first-discovered raw path",
  method: "children",
  scenario: "sharedFailure",
});
for (const spec of cases)
  test(spec.name, { timeout: 30000 }, () => {
    const child = spawnSync(
      process.execPath,
      ["--unhandled-rejections=throw", runner, JSON.stringify(spec)],
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
      "plain Node must settle correctly without unhandled rejection:\n" +
        child.stdout +
        "\n" +
        child.stderr,
    );
    const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
    assert.equal(result.method, spec.method);
    assert.equal(result.scenario, spec.scenario);
  });
