// D-REUSE-04 research only. Uses a separate, temporary Chrome profile.
// Usage: node elk-browser.mjs <playwright-core directory> <elkjs directory> <output directory>
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [playwrightPath, elkPath, output] = process.argv.slice(2);
if (!output)
  throw new Error("Expected playwright-core, elkjs and output directories");
const { chromium } = await import(
  pathToFileURL(resolve(playwrightPath, "index.mjs"))
);

// The gate changes delivery order, not ELK geometry or responses. It acknowledges
// holding a layout before ELK sees it, so cancellation does not depend on a sleep.
const gatedWorker = `
importScripts('/elk-worker.min.js');
const elkHandler = self.onmessage;
let held;
self.onmessage = event => {
  if (event.data.probe === 'release') {
    const next = held; held = undefined; elkHandler.call(self, next); return;
  }
  if (event.data.cmd === 'layout' && event.data.graph.id.startsWith('held-')) {
    held = event; self.postMessage({probe: 'held'}); return;
  }
  elkHandler.call(self, event);
};`;

async function runInPage() {
  const result = { userAgent: navigator.userAgent, cases: {} };
  const workers = [];
  const create = (gated = false) => {
    const worker = new Worker(
      gated ? "/gated-worker.js" : "/elk-worker.min.js",
    );
    workers.push(worker);
    return { worker, elk: new ELK({ workerFactory: () => worker }) };
  };
  const held = (worker) =>
    new Promise((resolve) => {
      const listener = (event) => {
        if (event.data.probe === "held") {
          worker.removeEventListener("message", listener);
          resolve();
        }
      };
      worker.addEventListener("message", listener);
    });
  const graph = (id) => ({
    id,
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
    children: [
      {
        id: "a",
        width: 60,
        height: 80,
        layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
        ports: [
          {
            id: "a.p0",
            width: 4,
            height: 4,
            layoutOptions: { "elk.port.side": "EAST" },
          },
          {
            id: "a.p1",
            width: 4,
            height: 4,
            layoutOptions: { "elk.port.side": "EAST" },
          },
        ],
      },
      {
        id: "b",
        width: 40,
        height: 40,
        ports: [{ id: "b.in", width: 4, height: 4 }],
      },
      {
        id: "c",
        width: 40,
        height: 40,
        ports: [{ id: "c.in", width: 4, height: 4 }],
      },
    ],
    edges: [
      { id: "fact-1", sources: ["a.p0"], targets: ["b.in"] },
      { id: "fact-2", sources: ["a.p0"], targets: ["b.in"] },
      { id: "fact-3", sources: ["a.p1"], targets: ["c.in"] },
    ],
  });
  const freeze = (object) => {
    for (const item of Object.values(object))
      if (item && typeof item === "object") freeze(item);
    return Object.freeze(object);
  };
  try {
    const normal = create();
    const input = freeze(graph("normal"));
    const before = JSON.stringify(input);
    const laidOut = await normal.elk.layout(input);
    result.cases.layout = {
      input_unchanged: JSON.stringify(input) === before,
      output_distinct: laidOut !== input,
      edges: laidOut.edges.map((e) => ({
        id: e.id,
        sources: e.sources,
        targets: e.targets,
        sections: e.sections,
      })),
      ports: laidOut.children[0].ports,
      finite_geometry: laidOut.children.every(
        (n) => Number.isFinite(n.x) && Number.isFinite(n.y),
      ),
    };
    const bad = graph("invalid");
    bad.edges[0].targets = ["missing-node"];
    try {
      await normal.elk.layout(bad);
      result.cases.invalid_graph = { rejected: false };
    } catch (error) {
      result.cases.invalid_graph = { rejected: true, message: error.message };
    }
    normal.elk.terminateWorker();

    const raw = create(true);
    await raw.elk.knownLayoutAlgorithms();
    let rawState = "pending";
    const rawHeld = held(raw.worker);
    raw.elk.layout(graph("held-raw")).then(
      () => {
        rawState = "fulfilled";
      },
      () => {
        rawState = "rejected";
      },
    );
    await rawHeld;
    raw.elk.terminateWorker();
    await Promise.resolve();
    // An immediate, finite observation plus source inspection, not an infinite wait proof.
    result.cases.raw_termination = {
      state_after_terminate: rawState,
      retained_resolvers: Object.keys(raw.elk.worker.resolvers).length,
      terminate_threw: false,
    };

    const ordered = create(true);
    let generation = 1;
    const completed = [],
      published = [];
    const submit = (id, ownGeneration) =>
      ordered.elk.layout(graph(id)).then((value) => {
        completed.push(value.id);
        if (generation === ownGeneration) published.push(value.id);
      });
    const firstHeld = held(ordered.worker);
    const first = submit("held-old", generation);
    await firstHeld;
    generation++;
    await submit("new", generation);
    ordered.worker.postMessage({ probe: "release" });
    await first;
    result.cases.stale_completion = { completed, published };
    ordered.elk.terminateWorker();

    const managed = create(true);
    let rejectJob;
    const pending = new Set();
    const managedHeld = held(managed.worker);
    const operation = new Promise((resolve, reject) => {
      rejectJob = reject;
      pending.add(reject);
      managed.elk.layout(graph("held-managed")).then(resolve, reject);
    }).then(
      () => "fulfilled",
      (error) => error.message,
    );
    await managedHeld;
    // Minimal application-owned settlement; not a production LayoutManager.
    rejectJob(new Error("cancelled"));
    pending.delete(rejectJob);
    managed.elk.terminateWorker();
    result.cases.managed_termination = {
      state: await operation,
      pending: pending.size,
    };

    const restarted = create();
    result.cases.restart = {
      id: (await restarted.elk.layout(graph("restart"))).id,
    };
    restarted.elk.terminateWorker();
    result.cases.raw_termination.state_after_other_workers_completed = rawState;
    result.cases.raw_termination.resolvers_after_other_workers_completed =
      Object.keys(raw.elk.worker.resolvers).length;
    return result;
  } finally {
    workers.forEach((worker) => worker.terminate());
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>ELK Worker research</title><link rel="icon" href="data:,">
<h1>ELK browser Worker probe</h1><button id="run">Run experiments</button>
<p id="status">Ready</p><pre id="result"></pre><script src="/elk-api.js"></script>
<script>document.querySelector('#run').onclick = async () => {
  document.querySelector('#status').textContent = 'Running';
  try {
    const result = await (${runInPage.toString()})();
    document.querySelector('#result').textContent = JSON.stringify(result, null, 2);
    document.querySelector('#status').textContent = 'Done';
  } catch (error) {
    document.querySelector('#result').textContent = JSON.stringify({error: error.stack});
    document.querySelector('#status').textContent = 'Failed';
  }
};</script>`;
const assets = new Map([
  ["/", { body: html, type: "text/html" }],
  ["/gated-worker.js", { body: gatedWorker, type: "text/javascript" }],
  [
    "/elk-api.js",
    {
      body: await readFile(resolve(elkPath, "lib/elk-api.js")),
      type: "text/javascript",
    },
  ],
  [
    "/elk-worker.min.js",
    {
      body: await readFile(resolve(elkPath, "lib/elk-worker.min.js")),
      type: "text/javascript",
    },
  ],
]);
const server = createServer((request, response) => {
  const asset = assets.get(request.url);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response
    .writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store" })
    .end(asset.body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const evidence = { worker_events: [], page_errors: [], console_errors: [] };
const workerCloses = [];
try {
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  evidence.browser_version = browser.version();
  const page = await browser.newPage();
  page.on("pageerror", (error) => evidence.page_errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.console_errors.push(message.text());
  });
  page.on("worker", (worker) => {
    evidence.worker_events.push({ event: "created", url: worker.url() });
    workerCloses.push(
      new Promise((resolve) =>
        worker.once("close", () => {
          evidence.worker_events.push({ event: "closed", url: worker.url() });
          resolve();
        }),
      ),
    );
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  evidence.before = await page.locator("body").innerText();
  await page
    .getByRole("button", { name: "Run experiments", exact: true })
    .click();
  await page.getByText("Done", { exact: true }).waitFor({ timeout: 30000 });
  evidence.result = JSON.parse(await page.locator("#result").innerText());
  await Promise.all(workerCloses);
  evidence.active_workers = page.workers().length;
  const cases = evidence.result.cases;
  assert.equal(cases.layout.input_unchanged, true);
  assert.equal(cases.layout.output_distinct, true);
  assert.equal(cases.layout.finite_geometry, true);
  assert.deepEqual(
    cases.layout.edges.map((e) => e.id),
    ["fact-1", "fact-2", "fact-3"],
  );
  assert(cases.layout.edges.every((e) => e.sections.length > 0));
  assert.equal(cases.invalid_graph.rejected, true);
  assert.equal(
    cases.raw_termination.state_after_other_workers_completed,
    "pending",
  );
  assert.equal(cases.raw_termination.retained_resolvers, 1);
  assert.deepEqual(cases.stale_completion.completed, ["new", "held-old"]);
  assert.deepEqual(cases.stale_completion.published, ["new"]);
  assert.deepEqual(cases.managed_termination, {
    state: "cancelled",
    pending: 0,
  });
  assert.equal(cases.restart.id, "restart");
  assert.equal(evidence.active_workers, 0);
  assert.equal(
    evidence.worker_events.filter((e) => e.event === "created").length,
    5,
  );
  assert.equal(
    evidence.worker_events.filter((e) => e.event === "closed").length,
    5,
  );
  assert.deepEqual(evidence.page_errors, []);
  assert.deepEqual(evidence.console_errors, []);
  evidence.assertions_passed = true;
} catch (error) {
  evidence.failure = error.stack;
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(output, "elk-browser-result.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await writeFile(resolve(output, "elk-browser-page.html"), html);
  await writeFile(resolve(output, "elk-browser-gated-worker.js"), gatedWorker);
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  JSON.stringify({
    assertions_passed: evidence.assertions_passed ?? false,
    failure: evidence.failure,
    worker_events: evidence.worker_events.length,
  }),
);
