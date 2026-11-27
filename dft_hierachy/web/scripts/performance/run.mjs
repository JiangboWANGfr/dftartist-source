import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { build } from "esbuild";
import { chromium } from "playwright";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

const exec = promisify(execFile);
const web = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(web, "package.json"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function percentiles(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    count: sorted.length,
    min: sorted[0],
    p50: rank(0.5),
    p95: rank(0.95),
    max: sorted.at(-1),
  };
}
export function syntheticDesign(children) {
  assert(Number.isSafeInteger(children) && children > 0);
  // Stay below Slang's per-array elaboration limit without reducing the total
  // direct-child count or changing production compilation limits.
  const arrays = Array.from(
    { length: Math.ceil(children / 10000) },
    (_, i) =>
      `leaf u${i}[0:${Math.min(10000, children - i * 10000) - 1}](a,y);`,
  ).join(" ");
  return `module leaf(input wire [7:0] a, output wire [7:0] y); assign y = a; endmodule
module bench_top; wire [7:0] a = 8'h00; wire [7:0] y; ${arrays} endmodule\n`;
}
async function main() {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    assert(
      [
        "--output",
        "--repetitions",
        "--instances",
        "--graphs",
        "--processor-filelist",
        "--openc910-design",
      ].includes(key),
      `unknown option ${key}`,
    );
    assert(
      process.argv[i + 1] && options[key] === undefined,
      `missing/duplicate ${key}`,
    );
    options[key] = process.argv[i + 1];
  }
  assert(
    options["--output"] && process.env.HIER_BIN,
    "Usage: HIER_BIN=/path/hier npm run perf -- --output NEW_DIRECTORY [--repetitions 5] [--instances 10000,100000] [--graphs 100,500,2000] [--processor-filelist PATH] [--openc910-design DIR]",
  );
  const counts = (text) =>
    text.split(",").map((v) => {
      const n = Number(v);
      assert(Number.isSafeInteger(n) && n > 0, `invalid count ${v}`);
      return n;
    });
  const repetitionValues = counts(options["--repetitions"] ?? "5");
  assert.equal(repetitionValues.length, 1, "repetitions must be one count");
  const repetitions = repetitionValues[0];
  const sizes = counts(options["--instances"] ?? "10000,100000");
  const graphSizes = counts(options["--graphs"] ?? "100,500,2000");
  const output = path.resolve(options["--output"]);
  await mkdir(output); // Never overwrite a previous run, including a failed one.
  let binary = path.resolve(process.env.HIER_BIN);
  const report = {
    format: 1,
    startedAt: new Date().toISOString(),
    status: "running",
    binary,
    binarySha256: null,
    machine: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      cpus: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      node: process.version,
    },
    settings: {
      repetitions,
      sizes,
      graphSizes,
      sdkCacheEntries: 0,
      pageSize: 200,
      watchdogMs: 180000,
      shutdownGraceMillis: 2000,
    },
    limitations: [
      "RSS is sampled every 50ms, a lower bound on peak, not an exact OS high-water mark.",
      "Cold means a new Core process; OS filesystem cache is not flushed.",
      "Cancellation samples are queued-or-running; they do not prove worst-case uninterruptible latency.",
      "Browser transport includes Playwright forwarding overhead; Core SDK samples use native Node transport.",
      "Browser memory is checkpointed renderer V8 heap, excluding native allocations and Worker heaps; it is not a process peak or leak proof.",
      "Synthetic layout is external display data, not a claim of full-chip netlist rendering.",
      "No product budget or independent acceptance is inferred from these measurements.",
    ],
    core: [],
    browser: [],
  };
  report.toolSha256 = Object.fromEntries(
    await Promise.all(
      ["run.mjs", "browser.mjs"].map(async (name) => [
        name,
        hash(await readFile(new URL(name, import.meta.url))),
      ]),
    ),
  );
  let writing = Promise.resolve();
  const save = () => {
    const json = JSON.stringify(report, null, 2) + "\n";
    writing = writing.then(() =>
      writeFile(path.join(output, "report.json"), json),
    );
    return writing;
  };
  let browser, server;
  const active = new Set();
  const memory = async () => {
    const { stdout } = await exec("ps", ["-ax", "-o", "pid=,ppid=,rss=,comm="]);
    return stdout
      .trim()
      .split("\n")
      .flatMap((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
        return match && Number(match[2]) === process.pid && match[4] === binary
          ? [{ pid: Number(match[1]), rssBytes: Number(match[3]) * 1024 }]
          : [];
      });
  };
  const openTransport = (input) => {
    const transport = createProcessTransport({
      command: binary,
      args: ["serve", ...input.args],
      env: input.env ?? process.env,
    });
    active.add(transport);
    void transport.exited
      .finally(() => active.delete(transport))
      .catch(() => {});
    return transport;
  };
  const deadline = async (operation, close) => {
    let timer;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            close();
            reject(new Error("benchmark watchdog exceeded"));
          }, 180000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    binary = await realpath(binary);
    report.binary = binary;
    report.binarySha256 = hash(await readFile(binary));
    const { stdout: head } = await exec("git", ["rev-parse", "HEAD"], {
      cwd: web,
    });
    const { stdout: dirty } = await exec("git", ["status", "--short"], {
      cwd: web,
    });
    report.checkout = { head: head.trim(), status: dirty };
    const inputs = [];
    for (const children of sizes) {
      const file = path.join(output, `instances-${children}.sv`);
      await writeFile(file, syntheticDesign(children));
      inputs.push({
        name: `synthetic-${children}`,
        children,
        file,
        args: ["--top", "bench_top", file],
      });
    }
    if (options["--processor-filelist"]) {
      const file = await realpath(options["--processor-filelist"]);
      inputs.push({
        name: "processor_core",
        file,
        args: ["-f", file, "--top", "processor_core"],
      });
    }
    if (options["--openc910-design"]) {
      const design = await realpath(options["--openc910-design"]);
      const { symlink } = await import("node:fs/promises");
      await symlink(design, path.join(output, "gen_rtl"), "dir");
      const file = path.join(design, "filelists/C910_asic_rtl.fl");
      inputs.push({
        name: "openc910",
        file,
        args: ["-f", file, "--top", "openC910"],
        env: { ...process.env, CODE_BASE_PATH: output },
      });
    }
    for (const input of inputs) {
      const group = {
        name: input.name,
        args: input.args,
        fileSha256: hash(await readFile(input.file)),
        samples: [],
        closeWithPendingQuery: [],
      };
      report.core.push(group);
      for (let run = 0; run < repetitions; run++) {
        const sample = {
          run,
          pageMs: [],
          warmSearchMs: [],
          resourceBefore: process.memoryUsage(),
          resourceSamples: [],
        };
        group.samples.push(sample);
        const begin = performance.now();
        const transport = openTransport(input);
        const client = new HierClient(transport, { cacheEntries: 0 });
        let sampling = false,
          samplingFailure;
        const poll = async () => {
          if (sampling) return;
          sampling = true;
          try {
            sample.resourceSamples.push({
              ms: performance.now() - begin,
              children: await memory(),
            });
          } catch (error) {
            samplingFailure = String(error);
          } finally {
            sampling = false;
          }
        };
        const interval = setInterval(poll, 50);
        try {
          await deadline(
            async () => {
              const snapshot = await client.ready;
              sample.openMs = performance.now() - begin;
              sample.inputHash = snapshot.inputHash;
              sample.inputHashComplete = snapshot.inputHashComplete;
              await poll();
              sample.diagnostics = (
                await client.diagnostics({ maxItems: 20 })
              ).result;
              assert.equal(
                sample.diagnostics.errorCount,
                0,
                "input has compilation errors",
              );
              const roots = (await client.roots()).result;
              assert.equal(roots.length, 1);
              let start = performance.now();
              await client.search(
                { text: "", kinds: ["instance"] },
                { limit: 200 },
              );
              sample.coldIndexSearchMs = performance.now() - start;
              for (let i = 0; i < 5; i++) {
                start = performance.now();
                await client.search(
                  { text: "", kinds: ["instance"] },
                  { limit: 200 },
                );
                sample.warmSearchMs.push(performance.now() - start);
              }
              let cursor,
                children = 0;
              do {
                start = performance.now();
                const page = (
                  await client.children(roots[0].ref, {
                    limit: 200,
                    ...(cursor ? { cursor } : {}),
                  })
                ).result;
                sample.pageMs.push(performance.now() - start);
                children += page.items.length;
                cursor = page.next;
              } while (cursor);
              sample.rootChildren = children;
              if (input.children !== undefined)
                assert.equal(children, input.children);
              const controller = new AbortController();
              const request = client.search(
                { text: "", kinds: ["signal"] },
                { limit: 200 },
                controller.signal,
              );
              const cancelled = request.then(
                () => "success",
                (error) => error.code,
              );
              start = performance.now();
              controller.abort();
              sample.cancelResult = await cancelled;
              sample.cancelLocalMs = performance.now() - start;
              assert.equal(sample.cancelResult, "cancelled");
              await client.info();
              sample.cancelDrainMs = performance.now() - start;
            },
            () => client.dispose(),
          );
        } finally {
          clearInterval(interval);
          while (sampling)
            await new Promise((resolve) => setTimeout(resolve, 1));
          const start = performance.now();
          client.dispose();
          sample.exit = await transport.exited;
          sample.closeMs = performance.now() - start;
          sample.resourceAfter = process.memoryUsage();
          sample.sampledPeakChildRssBytes = Math.max(
            0,
            ...sample.resourceSamples.flatMap((x) =>
              x.children.map((c) => c.rssBytes),
            ),
          );
          if (samplingFailure) sample.samplingFailure = samplingFailure;
          await save();
        }
        assert.equal(sample.exit.code, 0);
        assert(!samplingFailure, `RSS sampling failed: ${samplingFailure}`);
        assert(
          sample.sampledPeakChildRssBytes > 0,
          "no Core RSS sample was observed",
        );
        console.log(
          `${input.name} ${run + 1}/${repetitions}: open ${sample.openMs.toFixed(1)}ms, ${sample.rootChildren} children`,
        );
      }
      group.summary = Object.fromEntries(
        [
          "openMs",
          "coldIndexSearchMs",
          "closeMs",
          "cancelDrainMs",
          "sampledPeakChildRssBytes",
        ].map((key) => [key, percentiles(group.samples.map((s) => s[key]))]),
      );
      group.summary.pageMs = percentiles(
        group.samples.flatMap((s) => s.pageMs),
      );
      group.summary.warmSearchMs = percentiles(
        group.samples.flatMap((s) => s.warmSearchMs),
      );
      // Measure the existing process-close fallback separately from cooperative
      // cancellation. A submitted request can still be queued: retain its actual
      // OS exit rather than claiming a worst-case interruption guarantee.
      for (let run = 0; run < repetitions; run++) {
        const transport = openTransport(input);
        const client = new HierClient(transport, { cacheEntries: 0 });
        try {
          await deadline(
            () => client.ready,
            () => client.dispose(),
          );
          const query = client.search(
            { text: "", kinds: ["signal"] },
            { limit: 200 },
          );
          const settled = query.then(
            () => "success",
            (error) => error.code,
          );
          const begin = performance.now();
          client.dispose();
          const exit = await transport.exited;
          group.closeWithPendingQuery.push({
            run,
            millis: performance.now() - begin,
            queryResult: await settled,
            exit,
          });
          assert.equal(
            group.closeWithPendingQuery.at(-1).queryResult,
            "disposed",
          );
          assert(
            exit.code === 0 || exit.signal === "SIGKILL",
            "unexpected pending-close exit",
          );
          await save();
        } finally {
          client.dispose();
          await transport.exited;
        }
      }
      group.summary.closeWithPendingQueryMs = percentiles(
        group.closeWithPendingQuery.map((s) => s.millis),
      );
      await save();
    }
    const assets = path.join(output, "browser");
    await mkdir(assets);
    await build({
      entryPoints: [fileURLToPath(new URL("./browser.mjs", import.meta.url))],
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: path.join(assets, "bundle.js"),
      define: { "process.env.NODE_ENV": '"production"' },
    });
    await copyFile(
      require.resolve("elkjs/lib/elk-worker.min.js"),
      path.join(assets, "elk-worker.min.js"),
    );
    await copyFile(
      require.resolve("@hier/views/hierarchy-tree.css"),
      path.join(assets, "style.css"),
    );
    report.browserAssets = Object.fromEntries(
      await Promise.all(
        ["bundle.js", "elk-worker.min.js", "style.css"].map(async (name) => [
          name,
          hash(await readFile(path.join(assets, name))),
        ]),
      ),
    );
    await writeFile(
      path.join(assets, "index.html"),
      '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>',
    );
    server = createServer(async (request, response) => {
      const file = {
        "/": "index.html",
        "/bundle.js": "bundle.js",
        "/style.css": "style.css",
        "/elk-worker.min.js": "elk-worker.min.js",
      }[request.url];
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      try {
        response.setHeader(
          "Content-Type",
          file.endsWith("js")
            ? "text/javascript"
            : file.endsWith("css")
              ? "text/css"
              : "text/html",
        );
        response.end(await readFile(path.join(assets, file)));
      } catch {
        response.writeHead(500).end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({ headless: true });
    report.machine.chromium = browser.version();
    for (const input of inputs.filter((x) => x.children !== undefined)) {
      const sample = { name: input.name, errors: [], heapCheckpoints: [] };
      report.browser.push(sample);
      const page = await browser.newPage();
      let metrics;
      let transport,
        delivery = Promise.resolve(),
        offMessage = () => {},
        offClose = () => {};
      try {
        metrics = await page.context().newCDPSession(page);
        await metrics.send("Performance.enable");
        const recordHeap = async (phase) => {
          const { metrics: values } = await metrics.send(
            "Performance.getMetrics",
          );
          const measured = Object.fromEntries(
            values
              .filter(({ name }) =>
                [
                  "JSHeapUsedSize",
                  "JSHeapTotalSize",
                  "Nodes",
                  "Documents",
                ].includes(name),
              )
              .map(({ name, value }) => [name, value]),
          );
          assert(
            Number.isFinite(measured.JSHeapUsedSize),
            "missing browser heap metrics",
          );
          sample.heapCheckpoints.push({ phase, ...measured });
        };
        page.on("pageerror", (error) => sample.errors.push(String(error)));
        await page.exposeFunction("sendCore", (message) =>
          transport.send(message),
        );
        await page.exposeFunction("closeCore", () => transport.close());
        await page.exposeFunction("saveBrowserSample", async (value) => {
          sample.result = value;
          const latest = value.layouts.at(-1);
          await recordHeap(
            value.cleanup.mountedNodes === 0
              ? "released"
              : latest
                ? `layout-${latest.nodes}-sample-${latest.millis.length}`
                : "tree-loaded",
          );
          if (value.tree.modelRows && !sample.treeScreenshot) {
            sample.treeScreenshot = `${input.name}-tree.png`;
            await page.screenshot({
              path: path.join(output, sample.treeScreenshot),
            });
          }
          await save();
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await recordHeap("before-core-open");
        transport = openTransport(input);
        offMessage = transport.onMessage((message) => {
          delivery = delivery.then(() =>
            page.evaluate((frame) => window.receiveCore(frame), message),
          );
          void delivery.catch((error) => {
            sample.errors.push(String(error));
            transport.close();
          });
        });
        offClose = transport.onClose((error) => {
          if (error) {
            sample.transportClose = error.message;
            delivery = delivery.then(() =>
              page.evaluate(
                (message) => window.coreClosed(message),
                error.message,
              ),
            );
            void delivery.catch((failure) =>
              sample.errors.push(String(failure)),
            );
          }
        });
        sample.result = await deadline(
          () =>
            page.evaluate((options) => window.measure(options), {
              children: input.children,
              repetitions,
              graphSizes,
            }),
          () => transport.close(),
        );
        for (const layout of sample.result.layouts)
          layout.summary = percentiles(layout.millis);
        assert.deepEqual(sample.errors, []);
        await page.screenshot({
          path: path.join(output, `${input.name}-released.png`),
        });
        console.log(
          `${input.name}: tree ${sample.result.tree.modelRows} rows / ${sample.result.tree.visibleDomRows} DOM rows; native layouts complete`,
        );
      } finally {
        offMessage();
        offClose();
        if (transport) {
          transport.close();
          sample.exit = await transport.exited;
        }
        await delivery.catch(() => {});
        await metrics?.detach();
        await page.close();
        await save();
      }
      assert.deepEqual(
        sample.exit,
        { code: 0, signal: null },
        "Browser measurement Core exited abnormally",
      );
    }
    report.status = "complete";
  } catch (error) {
    report.status = "failed";
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    const cleanupErrors = [];
    for (const transport of active) {
      try {
        transport.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const result of await Promise.allSettled(
      [...active].map((transport) => transport.exited),
    )) {
      if (result.status === "rejected") cleanupErrors.push(result.reason);
    }
    try {
      await browser?.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (server?.listening)
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    } catch (error) {
      cleanupErrors.push(error);
    }
    report.finishedAt = new Date().toISOString();
    report.remainingOwnedProcesses = active.size;
    if (cleanupErrors.length) {
      report.status = "failed";
      report.cleanupErrors = cleanupErrors.map(String);
    }
    await save();
    if (cleanupErrors.length)
      throw new AggregateError(
        cleanupErrors,
        "Benchmark cleanup failed; original failure retained in report.json",
      );
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
