import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-collapse-unit-"));
let DesignGraph, HierClient, createFoldedGraphProjection, diagnostic;
try {
  const result = await build({
    stdin: {
      contents:
        `export {DesignGraph} from ${JSON.stringify(path.join(app, "src/design-graph.ts"))};\n` +
        `export {diagnostic} from ${JSON.stringify(path.join(app, "src/design-diagnostic.ts"))};\n` +
        'export {HierClient} from "@hier/client"; export {createFoldedGraphProjection} from "@hier/viewmodel";',
      resolveDir: app,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const file = path.join(temp, "graph.mjs");
  await writeFile(file, result.outputFiles[0].text);
  ({ DesignGraph, HierClient, createFoldedGraphProjection, diagnostic } = await import(
    pathToFileURL(file)
  ));
} finally {
  await rm(temp, { recursive: true });
}
const complete = { status: "complete", reasons: [] };
const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  frontend: { name: "slang", version: "A-fixture" },
  snapshotId: "a",
  inputHash: "0".repeat(64),
  inputHashComplete: true,
  bodySharing: "fast",
  tops: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "ready",
  openedAt: "2026-01-01T00:00:00.000Z",
  topCandidates: [],
};
class Transport {
  sent = [];
  onMessage(handler) {
    this.message = handler;
    return () => {
      this.message = undefined;
    };
  }
  onClose() {
    return () => {};
  }
  send(frame) {
    this.sent.push(frame);
  }
  close() {
    this.closed = true;
  }
  deliver(frame) {
    this.message?.(frame);
  }
}
async function until(check) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await new Promise(queueMicrotask);
  }
  assert.fail("graph cancellation checkpoint was not reached");
}
async function setup(t) {
  const transport = new Transport(),
    client = new HierClient(transport);
  transport.deliver({
    event: "hello",
    protocol: 2,
    snapshot,
    capabilities: ["cancel", "progress"],
  });
  await client.ready;
  const owned = new DesignGraph(client),
    workers = [];
  const previousWorker = globalThis.Worker,
    previousWindow = globalThis.window;
  globalThis.window = { location: { href: "file:///a-unit/index.html" } };
  globalThis.Worker = class {
    listeners = new Map();
    terminations = 0;
    throwCleanup = false;
    constructor() {
      workers.push(this);
    }
    addEventListener(kind, listener) {
      this.listeners.set(kind, listener);
    }
    removeEventListener(kind) {
      this.listeners.delete(kind);
    }
    postMessage() {} // Physical Worker only: actual ELK API remains pending.
    terminate() {
      this.terminations++;
      if (this.throwCleanup) throw new Error("A native cleanup leaf");
    }
  };
  t.after(() => {
    try {
      owned.dispose();
      client.dispose();
    } finally {
      if (previousWorker === undefined) delete globalThis.Worker;
      else globalThis.Worker = previousWorker;
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
  await owned.showExample({ ref: "i:0" });
  return { transport, client, owned, workers };
}
async function pending(t) {
  const state = await setup(t),
    { owned, transport } = state;
  const trace = owned.load({
    start: { slice: { ref: "o:0", bits: { lsb: 0, width: 1 } }, side: "inside" },
    direction: "back",
    policy: "combinational",
    budget: { maxNodes: 100, maxEdges: 200, maxDepth: 20, maxMillis: 1000 },
  });
  void trace.catch(() => {});
  await until(() => transport.sent.some((r) => r.method === "trace.cone"));
  const layout = owned.layout.layout(
    createFoldedGraphProjection(owned.graph, { groups: [], collapsed: [] }),
  );
  void layout.catch(() => {});
  assert.equal(owned.layout.state.status, "pending");
  return { ...state, trace, layout };
}

test("explicit graph cancellation reaps its Worker, cancels the actual SDK subscriber, and ignores late frames", async (t) => {
  const { owned, transport, workers, trace, layout } = await pending(t);
  const nodes = owned.graph.state.nodes,
    request = transport.sent.find((r) => r.method === "trace.cone");
  await owned.cancelPending();
  await assert.rejects(trace, { code: "cancelled" });
  await assert.rejects(layout, { code: "cancelled" });
  assert.equal(workers[0].terminations, 1);
  assert.equal(workers[0].listeners.size, 0);
  assert.equal(owned.trace.state.status, "cancelled");
  assert.equal(owned.graph.state.nodes, nodes);
  assert(transport.sent.some((r) => r.method === "cancel" && r.params.target === request.id));
  assert(!transport.closed && !owned.graph.disposed && !owned.layout.disposed);
  const graph = owned.graph.state,
    geometry = owned.layout.state;
  transport.deliver({
    id: request.id,
    ok: true,
    result: { nodes: [], edges: [], frontier: [], hasConservative: false },
    completeness: complete,
  });
  await new Promise(queueMicrotask);
  assert.equal(owned.graph.state, graph);
  assert.equal(owned.layout.state, geometry);
  await owned.cancelPending();
  assert.equal(workers[0].terminations, 1);
});

test("all pending resources are cancelled and their nested cleanup causes remain diagnostic", async (t) => {
  const { owned, workers, trace, layout } = await pending(t);
  workers[0].throwCleanup = true;
  const off = owned.graph.subscribe(() => {
    throw new Error("A trace notification leaf");
  });
  let failure;
  try {
    await owned.cancelPending();
  } catch (error) {
    failure = error;
  } finally {
    off();
  }
  assert(failure instanceof AggregateError);
  assert.equal(failure.errors.length, 2);
  const text = diagnostic(failure);
  assert.match(text, /A native cleanup leaf/);
  assert.match(text, /A trace notification leaf/);
  assert.equal(workers[0].terminations, 1);
  assert.equal(owned.trace.state.status, "cancelled");
  await assert.rejects(trace, { code: "cancelled" });
  await assert.rejects(layout);
  await owned.cancelPending();
  assert.equal(workers[0].terminations, 1);
});

test("a synchronous cancellation exception does not skip the other resource", async (t) => {
  const { owned, trace, layout } = await pending(t);
  const cancel = owned.layout.cancel.bind(owned.layout);
  owned.layout.cancel = () => {
    throw new Error("A synchronous cancellation failure");
  };
  try {
    await assert.rejects(owned.cancelPending(), (error) =>
      /A synchronous cancellation failure/.test(diagnostic(error)),
    );
    assert.equal(owned.trace.state.status, "cancelled");
    await assert.rejects(trace, { code: "cancelled" });
    await assert.rejects(layout);
  } finally {
    owned.layout.cancel = cancel;
  }
});

test("a completed graph and its borrowed SDK survive repeated collapse and can accept another explicit operation", async (t) => {
  const { owned, transport } = await setup(t);
  const graph = owned.graph.state,
    layout = owned.layout.state;
  await owned.cancelPending();
  await owned.cancelPending();
  assert.equal(owned.graph.state, graph);
  assert.equal(owned.layout.state, layout);
  assert.equal(transport.sent.length, 0);
  assert(!transport.closed);
  await owned.showExample({ ref: "i:1" });
  assert.notEqual(owned.graph.state, graph);
  owned.dispose();
  await owned.cancelPending();
});

test("host diagnostics preserve standard and cloned cause chains, aggregate leaves, and cyclic errors", () => {
  const leaf = new Error("native Worker leaf"),
    parent = new Error("layout cleanup", { cause: leaf });
  const aggregate = new AggregateError(
    [
      parent,
      {
        code: "host_failure",
        message: "host exit",
        cause: { code: "transport_closed", message: "Core exit" },
      },
    ],
    "close failed",
  );
  const text = diagnostic(aggregate);
  for (const message of [
    "close failed",
    "layout cleanup",
    "native Worker leaf",
    "host_failure: host exit",
    "transport_closed: Core exit",
  ])
    assert(text.includes(message));
  parent.cause = aggregate;
  assert(diagnostic(aggregate).length < 400);
  assert.equal(diagnostic(undefined), "undefined");
  assert.equal(diagnostic("plain failure"), "plain failure");
});
