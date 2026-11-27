import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cpus, platform, arch, release } from "node:os";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";
const output = resolve(process.env.UI_EVIDENCE_DIR ?? `results/run-${Date.now()}`);
await mkdir(output, { recursive: true });
const server = await startServer(),
  browser = await chromium.launch({ headless: true });
const report = {
  environment: {
    node: process.version,
    os: platform(),
    arch: arch(),
    release: release(),
    cpu: cpus()[0].model,
    browser: browser.version(),
    viewport: { width: 1100, height: 1100 },
    headless: true,
  },
  build: JSON.parse(await readFile("dist/build.json", "utf8")),
  runs: [],
};
const call = (page, method, ...args) =>
  page.evaluate(([m, a]) => window.EXPERIMENT.run(m, ...a), [method, args]);
const read = (page) => page.evaluate(() => window.EXPERIMENT.read());
const settled = (page) => call(page, "settle");
async function clickEdge(page, label) {
  const point = await page.locator(`[data-label="${label}"] path`).evaluate((path) => {
    const p = path.getPointAtLength(path.getTotalLength() / 2),
      svg = path.ownerSVGElement.createSVGPoint();
    svg.x = p.x;
    svg.y = p.y;
    const result = svg.matrixTransform(path.getScreenCTM());
    return { x: result.x, y: result.y };
  });
  await page.mouse.click(point.x, point.y);
}
function receipt(state, labels) {
  assert.deepEqual(state.lastHit.facts.map((f) => f.id).sort(), labels.sort());
  for (const fact of state.lastHit.facts) {
    const original = state.graph.edges.find((e) => e.edge.value.id === fact.id);
    assert.deepEqual(fact, original.edge.value);
  }
}
function clean(state) {
  assert.equal(state.disposed, true);
  assert.equal(state.pending, 0);
  assert.equal(state.subscribers, 0);
  assert.equal(state.transportListeners, 0);
  assert(state.workers.length > 0);
  for (const w of state.workers) {
    assert.equal(w.layoutPosts, 1);
    assert.equal(w.terminated, 1);
  }
}
try {
  for (let repeat = 1; repeat <= 3; repeat++)
    for (const route of ["react", "sprotty"]) {
      const page = await browser.newPage({ viewport: report.environment.viewport });
      await page.addInitScript(() => {
        const add = window.addEventListener.bind(window),
          remove = window.removeEventListener.bind(window);
        const live = new WeakSet();
        window.resizeObservation = { added: 0, removed: 0, live: 0 };
        window.addEventListener = (kind, fn, options) => {
          if (kind === "resize" && fn && !live.has(fn)) {
            live.add(fn);
            window.resizeObservation.added++;
            window.resizeObservation.live++;
          }
          return add(kind, fn, options);
        };
        window.removeEventListener = (kind, fn, options) => {
          if (kind === "resize" && fn && live.has(fn)) {
            live.delete(fn);
            window.resizeObservation.removed++;
            window.resizeObservation.live--;
          }
          return remove(kind, fn, options);
        };
      });
      const row = { route, repeat, cases: [], errors: [], consoleErrors: [], interactions: [] };
      report.runs.push(row);
      page.on("pageerror", (e) => row.errors.push(String(e)));
      page.on("console", (msg) => {
        if (msg.type() === "error") row.consoleErrors.push(msg.text());
      });
      try {
        const start = performance.now();
        await page.goto(`http://127.0.0.1:${server.address().port}/${route}.html`);
        await page.waitForFunction(() => window.EXPERIMENT?.ready, {}, { timeout: 10000 });
        row.navigationMs = performance.now() - start;
        row.openMs = await page.evaluate(() => window.EXPERIMENT.openMs);
        let state = await read(page);
        row.initial = state;
        row.initialDOM = await page.locator("#canvas *").count();
        assert.equal(state.layout.status, "success");
        assert.equal(state.graph.nodes.length, 5);
        assert.equal(state.graph.edges.length, 5);
        assert.equal(await page.locator("#canvas [data-hit]").count(), 10);
        assert.equal(await page.locator("#canvas [data-port]").count(), 20);
        const facts = JSON.stringify(state.graph),
          projection = JSON.stringify(state.layout.result);
        // Distinct parallel edge hits must preserve facts and endpoint bit ranges.
        for (const label of ["xy-low", "xy-high"]) {
          await clickEdge(page, label);
          await settled(page);
          state = await read(page);
          receipt(state, [label]);
          assert.deepEqual(state.selection.items, state.lastHit.items);
        }
        assert.equal(JSON.stringify(state.graph), facts);
        assert.equal(JSON.stringify(state.layout.result), projection);
        row.cases.push("ports / parallel facts / exact hit bits / immutable facts and geometry");
        await page.screenshot({ path: resolve(output, `${route}-${repeat}-open.png`) });
        const selectionStart = performance.now();
        await page.getByRole("button", { name: "Select x externally", exact: true }).click();
        await settled(page);
        row.interactions.push({
          operation: "external-selection-click-through-paint",
          ms: performance.now() - selectionStart,
        });
        assert.equal((await read(page)).selection.origin, "external");
        assert.equal(await page.locator('[data-label="x"]').getAttribute("data-selected"), "true");
        await page.locator('[data-label="y"]').click();
        await settled(page);
        const y = (await read(page)).selection;
        assert.equal(y.origin, "graph");
        assert.equal(y.items[0].ref, "signal-y");
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await settled(page);
        assert.equal((await read(page)).selection.items[0].ref, "signal-x");
        await page.getByRole("button", { name: "Forward", exact: true }).click();
        await settled(page);
        assert.deepEqual((await read(page)).selection, y);
        await page.locator('[data-label="z"]').focus();
        await page.keyboard.press("Enter");
        await settled(page);
        assert.equal((await read(page)).selection.items[0].ref, "signal-z");
        row.cases.push("external highlight / click back / sole navigation history / focused Enter");
        const foldStart = performance.now();
        await call(page, "fold", "bus");
        row.interactions.push({
          operation: "fold-bus-through-paint",
          ms: performance.now() - foldStart,
        });
        assert.equal(await page.locator("#canvas [data-hit]").count(), 9);
        await clickEdge(page, "bus ×2");
        await settled(page);
        state = await read(page);
        receipt(state, ["xy-low", "xy-high"]);
        assert.equal(state.lastHit.memberIds.length, 2);
        await call(page, "fold", "hierarchy");
        assert.equal(await page.locator("#canvas [data-hit]").count(), 7);
        await page.locator('[data-label="stage · 2 nodes / 1 edge"]').click();
        await settled(page);
        state = await read(page);
        assert.equal(state.lastHit.memberIds.length, 3);
        receipt(state, ["yz"]);
        assert.deepEqual(
          state.selection.items.map((i) => i.ref),
          ["signal-y", "signal-z"],
        );
        await page.screenshot({ path: resolve(output, `${route}-${repeat}-fold.png`) });
        await call(page, "fold", "hierarchy");
        await call(page, "fold", "bus");
        assert.equal(await page.locator("#canvas [data-hit]").count(), 10);
        state = await read(page);
        assert.equal(JSON.stringify(state.graph), facts);
        assert.equal(JSON.stringify(state.layout.result), projection);
        row.cases.push(
          "reversible display hierarchy/bus aggregation with all original members (no boundary rerouting)",
        );
        const replacement = await call(page, "replace");
        assert.equal(replacement.status, "success");
        state = await read(page);
        assert.deepEqual(state.graph.nodes.map((n) => n.node.value.id).sort(), [
          "b",
          "t",
          "x",
          "z",
        ]);
        await call(page, "withdrawLate");
        state = await read(page);
        assert.deepEqual(state.graph.nodes.map((n) => n.node.value.id).sort(), ["b", "t", "x"]);
        assert.deepEqual(state.graph.edges.map((e) => e.edge.value.id).sort(), ["bt", "xb"]);
        assert.equal(state.commands.find((c) => c.name === "source:late").code, "cancelled");
        await call(page, "reset");
        row.cases.push(
          "replace / withdraw A / shared B and trace survive / old loader cannot resurrect",
        );
        const race = await call(page, "supersede");
        assert.equal(race.oldResult.code, "stale_graph");
        assert.equal(race.newResult.status, "success");
        assert.equal(race.state.layout.result.graphRevision, race.state.graph.revision);
        const failure = await call(page, "relayout", "crash");
        assert.equal(failure.code, "worker_failure");
        state = await read(page);
        assert.equal(state.layout.status, "failed");
        assert.equal(state.display.interactive, false);
        const previous = state.selection;
        // Public hit bridge must also reject a programmatic stale hit (pointer blocking alone is insufficient).
        await call(page, "pick", state.display.nodes[0].id);
        assert.deepEqual((await read(page)).selection, previous);
        assert.equal(await page.locator("#canvas").getAttribute("data-interactive"), "false");
        const recovered = await call(page, "retry");
        assert.equal(recovered.status, "success");
        row.cases.push(
          "native stalled L1 invalidated by revision / real L2 / failed Worker / stale hit denied / fresh retry",
        );
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.EXPERIMENT.remount());
          state = await read(page);
          assert.equal(state.layout.status, "success");
        }
        const closed = await page.evaluate(() => window.EXPERIMENT.close());
        assert.equal(closed.pending.code, "disposed");
        clean(closed.state);
        state = await read(page);
        for (const cycle of state.cycles) clean(cycle);
        const count = state.notifications;
        await settled(page);
        assert.equal((await read(page)).notifications, count);
        assert.equal(await page.locator("#canvas [data-hit]").count(), 0);
        assert.deepEqual(state.errors, []);
        assert.deepEqual(row.errors, []);
        assert.deepEqual(row.consoleErrors, []);
        row.final = state;
        row.resizeObservation = await page.evaluate(() => window.resizeObservation);
        row.cases.push(
          "three unmount/remount cycles / pending dispose settles / shared models and Workers closed / no later model publication",
        );
        row.functionalPassed = true;
        // Exercise the upstream global listener after close. Record the actual gap; never
        // suppress the errors, patch vendor code, or declare whole-view cleanup successful.
        await page.evaluate(() => window.dispatchEvent(new Event("resize")));
        await settled(page);
        row.afterCloseErrors = [...row.errors];
        row.lifecyclePassed = row.resizeObservation.live === 0 && row.afterCloseErrors.length === 0;
        row.passed = row.functionalPassed && row.lifecyclePassed;
      } catch (e) {
        row.failure = String(e.stack ?? e);
        await page
          .screenshot({ path: resolve(output, `${route}-${repeat}-failure.png`) })
          .catch(() => {});
        throw e;
      } finally {
        await page.close();
        await writeFile(resolve(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
      }
    }
  console.log(
    JSON.stringify(
      report.runs.map((r) => ({
        route: r.route,
        repeat: r.repeat,
        functionalPassed: r.functionalPassed,
        lifecyclePassed: r.lifecyclePassed,
        resize: r.resizeObservation,
        cases: r.cases.length,
        navigationMs: r.navigationMs,
        openMs: r.openMs,
      })),
      null,
      2,
    ),
  );
  if (report.runs.some((r) => !r.passed)) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(resolve(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
}
