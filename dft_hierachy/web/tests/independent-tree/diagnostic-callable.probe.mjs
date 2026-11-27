// Agent B standalone C-75 baseline; original 248/761 files and expectations untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(
  new URL("./diagnostic-callable-runner.mjs", import.meta.url),
);
const scenarios = [
  "plain",
  "properties",
  "shared",
  "array",
  "root",
  "ordinary",
  "throw",
  "dispose-return",
  "dispose-throw",
  "enumerate",
];
let cases = 0;
for (const method of ["roots", "children", "reveal"])
  for (const scenario of scenarios) {
    cases++;
    test(
      "F75 " + method + " callable structural projection " + scenario,
      { timeout: 30000 },
      () => {
        const cfg = { method, scenario };
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
        assert.equal(child.error, undefined, "test watchdog, not SLA");
        assert.equal(child.signal, null, child.stderr);
        assert.equal(
          child.status,
          0,
          "plain Node must preserve owned callable diagnostics and original errors:\n" +
            child.stdout +
            "\n" +
            child.stderr,
        );
        const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
        assert.equal(result.method, method);
        assert.equal(result.scenario, scenario);
      },
    );
  }
assert.equal(cases, 30);
