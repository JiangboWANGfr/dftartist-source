import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY,
  root = consumer ?? web;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const clientRoot = path.join(root, "node_modules/@hier/client");
const manifest = JSON.parse(await readFile(path.join(clientRoot, "package.json"), "utf8"));
const { createProcessTransport } = await import(
  pathToFileURL(path.join(clientRoot, manifest.exports["./node"].import))
);
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-notice-unit-"));
let DesignLifecycle;
try {
  const result = await build({
    entryPoints: [path.join(app, "src/design-lifecycle.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const file = path.join(temp, "lifecycle.mjs");
  await writeFile(file, result.outputFiles[0].text);
  ({ DesignLifecycle } = await import(pathToFileURL(file)));
} finally {
  await rm(temp, { recursive: true });
}
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));
const ok = (value) => ({ ok: true, value });
async function setup(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const sessions = new Map();
  let next = 0,
    connecting;
  // Controlled demo control calls, actual SDK/NDJSON/Core and production lifecycle/panels.
  const bridge = {
    version: 1,
    pickDesign: async () => ok({ token: "A-choice", label: "design.sv" }),
    openDesign: async () => {
      const id = String(++next),
        transport = createProcessTransport({
          command: process.env.HIER_BIN,
          args: ["serve", design],
        });
      sessions.set(id, transport);
      connecting = transport;
      return ok({ sessionId: id, label: "design.sv" });
    },
    closeDesign: async (id) => {
      const transport = sessions.get(id);
      transport.close();
      await transport.exited;
      return ok(null);
    },
  };
  const lifecycle = new DesignLifecycle(
    bridge,
    {},
    (change) => change(),
    async () => connecting,
  );
  t.after(async () => {
    lifecycle.releaseDocument();
    for (const transport of sessions.values()) transport.close();
    await Promise.all([...sessions.values()].map((transport) => transport.exited));
  });
  await lifecycle.open({ kind: "source" });
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  return lifecycle;
}

test("component retry reports share the lifecycle notice while dismissal preserves actual Core failure and models", async (t) => {
  const lifecycle = await setup(t),
    active = lifecycle.getSnapshot().active,
    panels = active.panels;
  const { snapshotId } = active.client.snapshot;
  await assert.rejects(panels.resolution.load({ snapshotId, text: "[" }));
  const failed = panels.resolution.state,
    selection = panels.selection.current;
  assert.equal(failed.status, "failed");
  assert.match(failed.error.message, /hierarchy path syntax/);
  let failure;
  try {
    await panels.resolution.reload();
  } catch (error) {
    failure = error;
  }
  panels.onCommandError({ error: failure });
  assert.match(
    lifecycle.getSnapshot().operationMessage,
    /bad_request: invalid hierarchy path syntax/,
  );
  const modelFailure = panels.resolution.state;
  lifecycle.dismissOperationMessage();
  assert.equal(lifecycle.getSnapshot().operationMessage, undefined);
  assert.equal(panels.resolution.state, modelFailure);
  assert.equal(panels.selection.current, selection);
  assert.equal(lifecycle.getSnapshot().active, active);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  await panels.search.load({ snapshotId, text: "demo_graph_top" });
  panels.onCommandError({
    error: new Error("A component failure", { cause: new Error("A original cause") }),
  });
  await panels.search.reload();
  assert.match(lifecycle.getSnapshot().operationMessage, /A component failure\nA original cause/);
});

test("replacement and document release revoke the old component report without affecting the next workspace", async (t) => {
  const lifecycle = await setup(t),
    old = lifecycle.getSnapshot().active,
    callback = old.panels.onCommandError;
  assert.equal(callback, old.panels.onCommandError);
  await lifecycle.open({ kind: "source" });
  const next = lifecycle.getSnapshot().active;
  assert.notEqual(next, old);
  assert.notEqual(next.panels.onCommandError, callback);
  assert(old.panels.selection.disposed);
  const ready = lifecycle.getSnapshot();
  callback({ error: new Error("A released workspace failure") });
  assert.equal(lifecycle.getSnapshot(), ready);
  next.panels.onCommandError({ error: { code: "A-current", message: "current component" } });
  assert.equal(lifecycle.getSnapshot().operationMessage, "A-current: current component");
  lifecycle.releaseDocument();
  const released = lifecycle.getSnapshot();
  next.panels.onCommandError({ error: new Error("A released document failure") });
  assert.equal(lifecycle.getSnapshot(), released);
});

test("unifying component reports preserves the existing selection generation guard for asynchronous host commands", async (t) => {
  const lifecycle = await setup(t),
    active = lifecycle.getSnapshot().active,
    panels = active.panels;
  let reject;
  const old = new Promise((_resolve, no) => {
    reject = no;
  });
  panels.consume(old);
  const roots = await active.client.roots();
  panels.selection.select({
    snapshotId: active.client.snapshot.snapshotId,
    origin: "tree",
    items: [{ ref: roots.result[0].ref }],
  });
  reject(new Error("A superseded host command"));
  await Promise.resolve();
  assert.equal(lifecycle.getSnapshot().operationMessage, undefined);
  panels.onCommandError({ error: new Error("A current component command") });
  assert.equal(lifecycle.getSnapshot().operationMessage, "A current component command");
});
