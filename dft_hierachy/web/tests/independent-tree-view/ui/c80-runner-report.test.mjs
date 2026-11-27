import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execute = promisify(execFile);
for (const mode of [
  "stable",
  "message-bigint",
  "stack-cycle",
  "proxy-bigint",
  "message-toJSON",
])
  test(
    "C80 real runner report survives " + mode,
    { timeout: 45000 },
    async () => {
      let result;
      try {
        result = {
          ...(await execute(
            process.execPath,
            [
              "--unhandled-rejections=throw",
              fileURLToPath(
                new URL("./c80-report-worker.mjs", import.meta.url),
              ),
              mode,
            ],
            { timeout: 40000, maxBuffer: 4 * 1024 * 1024 },
          )),
          code: 0,
        };
      } catch (error) {
        result = error;
      }
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
      assert.equal(result.killed ?? false, false, "worker must exit naturally");
      const marker = result.stdout
        ?.split("\n")
        .find((line) => line.startsWith("C80_REPORT_CONTROL "));
      assert.ok(marker);
      const { observedBeforeRescue: s, rescue } = JSON.parse(
        marker.slice("C80_REPORT_CONTROL ".length),
      );
      assert.equal(s.injected, true);
      assert.equal(
        s.runnerReports,
        1,
        "one complete structured runner report, not just a serialization exception",
      );
      assert.equal(s.importError, undefined);
      assert.equal(s.browserConnected, false);
      assert.equal(s.serverListening, false);
      assert.equal(s.portRebind, true);
      assert.deepEqual(rescue, {
        browserConnected: false,
        serverListening: false,
      });
      assert.equal(s.exitCode, 1);
      assert.equal(result.code, 1, "original failure remains nonzero");
      const report = s.reports[0];
      assert.equal(report.exitCode, 1);
      assert.equal(report.executedCases, 0);
      assert.equal(report.closedOwnBrowserServerAndCore, true);
      assert.deepEqual(
        report.coreSessions,
        [],
        "no real Core claimed by reporting control",
      );
      if (mode === "stable")
        assert.equal(report.error.message, "B stable failure");
      else {
        assert.deepEqual(s.reads, { message: 1, stack: 1 });
        assert.equal(report.error[s.field], "B original " + s.field);
      }
      assert.equal(s.poisonHooks, 0);
    },
  );
