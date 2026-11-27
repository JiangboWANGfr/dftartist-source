import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
const worker = fileURLToPath(
  new URL("./c77-control-worker.mjs", import.meta.url),
);
for (const [mode, exit] of [
  ["raw-missing-consumer", 1],
  ["raw-with-consumer", 0],
  ["real-L6-no-view", 0],
  ["real-L6-plus-B-observer-no-view", 0],
])
  test("C77 independent observation control: " + mode, () => {
    const r = spawnSync(
      process.execPath,
      ["--unhandled-rejections=throw", worker, mode],
      {
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
        timeout: 20000,
      },
    );
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    console.log(
      JSON.stringify({
        mode,
        expectedExit: exit,
        actualExit: r.status,
        stdout: r.stdout,
        stderr: r.stderr,
      }),
    );
    assert.equal(r.status, exit);
    if (mode === "raw-missing-consumer")
      assert.ok(r.stderr.includes("B-C77-own-raw-rejection"));
    else if (mode === "raw-with-consumer")
      assert.ok(r.stdout.includes('"consumerSawOriginal":true'));
    else {
      assert.ok(r.stdout.includes('"consumerHandler":false'));
      assert.ok(r.stdout.includes('"originalPromiseIdentity":true'));
      assert.ok(
        r.stdout.includes("exit0 cannot prove a view registered a handler"),
      );
    }
  });
