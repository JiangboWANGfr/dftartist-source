import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { percentiles, syntheticDesign } from "../scripts/performance/run.mjs";

for (const signal of [undefined, "SIGTERM", "SIGKILL"]) {
  test(`browser measurement retains and validates Core exit: ${signal ?? "normal"}`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hier-perf-exit-"));
    const output = path.join(directory, "result");
    try {
      const run = spawnSync(
        process.execPath,
        [
          ...(signal
            ? [
                "--import",
                fileURLToPath(
                  new URL(
                    "./performance-tools/abnormal-browser-exit.mjs",
                    import.meta.url,
                  ),
                ),
              ]
            : []),
          fileURLToPath(
            new URL("../scripts/performance/run.mjs", import.meta.url),
          ),
          "--output",
          output,
          "--instances",
          "2",
          "--repetitions",
          "1",
          "--graphs",
          "2",
        ],
        {
          encoding: "utf8",
          timeout: 20000,
          env: {
            ...process.env,
            HIER_BIN:
              process.env.HIER_BIN ??
              fileURLToPath(new URL("../../core/build/hier", import.meta.url)),
            ...(signal ? { HIER_A_BROWSER_EXIT_SIGNAL: signal } : {}),
          },
        },
      );
      assert.equal(run.status, signal ? 1 : 0, run.stderr);
      const report = JSON.parse(
        await readFile(path.join(output, "report.json")),
      );
      assert.equal(report.status, signal ? "failed" : "complete");
      assert.equal(report.remainingOwnedProcesses, 0);
      assert.deepEqual(
        report.browser[0].exit,
        signal ? { code: null, signal } : { code: 0, signal: null },
      );
      if (signal) {
        assert.match(run.stderr, /A negative control: browser Core/);
        assert.match(report.error, /Core exited abnormally/);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("performance summaries use nearest-rank percentiles and retain tail samples", () => {
  const samples = [100, 2, 9, 4, 3];
  assert.deepEqual(percentiles(samples), {
    count: 5,
    min: 2,
    p50: 4,
    p95: 100,
    max: 100,
  });
  assert.deepEqual(samples, [100, 2, 9, 4, 3]);
  assert.equal(percentiles([]), null);
  assert.deepEqual(percentiles([7]), {
    count: 1,
    min: 7,
    p50: 7,
    p95: 7,
    max: 7,
  });
  const design = syntheticDesign(100000);
  assert.equal([...design.matchAll(/leaf u\d+\[0:9999\]/g)].length, 10);
  assert.doesNotMatch(design, /99999/);
});

test("missing Core fails with retained report and no owned process; output is never overwritten", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hier-perf-control-"));
  const output = path.join(directory, "result");
  const run = () =>
    spawnSync(
      process.execPath,
      [
        new URL("../scripts/performance/run.mjs", import.meta.url).pathname,
        "--output",
        output,
        "--instances",
        "2",
        "--repetitions",
        "1",
        "--graphs",
        "2",
      ],
      {
        env: { ...process.env, HIER_BIN: process.execPath },
        encoding: "utf8",
        timeout: 10000,
      },
    );
  try {
    // Node is executable but is not Core: transport failure must not become an empty green run.
    const failure = run();
    assert.equal(failure.status, 1, failure.stderr);
    const bytes = await readFile(path.join(output, "report.json"));
    const report = JSON.parse(bytes);
    assert.equal(report.status, "failed");
    assert.equal(report.remainingOwnedProcesses, 0);
    assert.match(report.error, /process|exited|closed/i);
    assert.equal(run().status, 1);
    assert.deepEqual(await readFile(path.join(output, "report.json")), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("nonexistent Core also retains a failed report", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hier-perf-missing-"));
  const output = path.join(directory, "result");
  try {
    const failure = spawnSync(
      process.execPath,
      [
        new URL("../scripts/performance/run.mjs", import.meta.url).pathname,
        "--output",
        output,
      ],
      {
        env: { ...process.env, HIER_BIN: path.join(directory, "missing-core") },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(failure.status, 1, failure.stderr);
    const report = JSON.parse(await readFile(path.join(output, "report.json")));
    assert.equal(report.status, "failed");
    assert.equal(report.remainingOwnedProcesses, 0);
    assert.match(report.error, /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
