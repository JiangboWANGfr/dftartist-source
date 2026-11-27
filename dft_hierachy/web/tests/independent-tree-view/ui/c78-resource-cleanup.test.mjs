import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execute = promisify(execFile);
for (const mode of [
  "normal",
  "page-gone",
  "shutdown-reject",
  "page-close-reject",
  "browser-close-reject",
  "core-nonzero",
  "server-close-reject",
]) {
  test(`C78 real resource cleanup: ${mode}`, { timeout: 45000 }, async () => {
    let output;
    try {
      const result = await execute(
        process.execPath,
        [
          "--unhandled-rejections=throw",
          fileURLToPath(new URL("./c78-resource-worker.mjs", import.meta.url)),
          mode,
        ],
        { timeout: 40000, maxBuffer: 4 * 1024 * 1024 },
      );
      output = { ...result, code: 0 };
    } catch (error) {
      output = error;
    }
    process.stdout.write(output.stdout ?? "");
    process.stderr.write(output.stderr ?? "");
    assert.equal(output.killed ?? false, false, "worker must exit naturally");
    const marker = output.stdout
      ?.split("\n")
      .find((line) => line.startsWith("C78_RESOURCE_CONTROL "));
    assert.ok(
      marker,
      "control must observe before rescue and report own cleanup",
    );
    const { observedBeforeRescue: s, rescue } = JSON.parse(
      marker.slice("C78_RESOURCE_CONTROL ".length),
    );
    assert.equal(s.workerError, undefined, "runner must return its report");
    assert.equal(s.prepared, true);
    assert.equal(s.cores.length, 2);
    assert.equal(s.pageClosed, true);
    assert.equal(
      s.browserConnected,
      false,
      "runner, not rescue, closes browser",
    );
    assert.equal(s.serverListening, false, "runner closes HTTP listening port");
    assert.ok(
      s.cores.every((x) => x.closed),
      "runner reaps both real children",
    );
    assert.equal(s.pollsEnded, 2, "both pending polls completed before rescue");
    assert.equal(s.portRebind, true, "same port immediately bindable");
    assert.deepEqual(rescue, {
      browserConnected: false,
      serverListening: false,
      allOwnedCoresClosed: true,
    });
    assert.equal(output.code, mode === "normal" ? 0 : 1);
    assert.equal(s.runnerExitCode, mode === "normal" ? 0 : 1);
    assert.equal(
      s.runnerResult.executedCases,
      0,
      "not production UI semantics",
    );
    assert.equal(s.runnerResult.closedOwnBrowserServerAndCore, true);
    if (mode !== "normal") assert.ok(s.injected.length > 0);
  });
}
