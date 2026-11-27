import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const web = fileURLToPath(new URL("../", import.meta.url)),
  root = process.env.HIER_A_DEMO_DELIVERY ?? web;
const app = process.env.HIER_A_DEMO_DELIVERY ? path.join(root, "app") : path.join(web, "apps/demo");
const clientRoot = path.join(root, "node_modules/@hier/client"),
  manifest = JSON.parse(await readFile(path.join(clientRoot, "package.json"), "utf8"));
const { HierClient } = await import(
  pathToFileURL(path.join(clientRoot, manifest.exports["."].import))
);
const { createProcessTransport } = await import(
  pathToFileURL(path.join(clientRoot, manifest.exports["./node"].import))
);
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-input-lifetime-"));
let DesignInputs;
try {
  const result = await build({
    entryPoints: [path.join(app, "src/design-inputs.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const f = path.join(temp, "inputs.mjs");
  await writeFile(f, result.outputFiles[0].text);
  ({ DesignInputs } = await import(pathToFileURL(f)));
} finally {
  await rm(temp, { recursive: true });
}
async function setup(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const transport = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url))],
  });
  const sent = [],
    send = transport.send.bind(transport);
  transport.send = (frame) => {
    sent.push(frame);
    send(frame);
  };
  const client = new HierClient(transport);
  await client.ready;
  const inputs = new DesignInputs(client),
    calls = [];
  const original = client.checkInputs.bind(client);
  client.checkInputs = (...args) => {
    calls.push(args);
    return original(...args);
  };
  t.after(async () => {
    inputs.dispose();
    client.dispose();
    await transport.exited;
  });
  return { transport, client, inputs, calls, sent, original };
}
function diagnostics(t) {
  const rows = [],
    original = console.error;
  console.error = (...args) => rows.push(args);
  t.after(() => {
    console.error = original;
  });
  return rows;
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
for (const starter of ["abort", "cancelled-subscriber"]) {
  test(`input cancellation preserves the newer check started by ${starter}`, async (t) => {
    const { inputs, client, original, sent } = await setup(t);
    await inputs.check();
    const retained = inputs.getSnapshot().result;
    const arrived = deferred(), release = deferred(), observed = [];
    let next, joined, first = true;
    inputs.subscribe(() => {
      const state = inputs.getSnapshot(); observed.push(state.phase);
      if (starter === "cancelled-subscriber" && state.phase === "cancelled") next = inputs.check();
    });
    client.checkInputs = async (signal) => {
      if (!first) return original(signal);
      first = false;
      signal.addEventListener("abort", () => {
        if (starter === "abort") next = inputs.check();
        else joined = inputs.check();
      }, { once: true });
      const reply = await original(signal);
      arrived.resolve(); await release.promise; return reply;
    };
    const old = inputs.check(); await arrived.promise;
    inputs.cancel();
    assert(next, "cancellation permits a newer explicit check");
    assert.equal(inputs.getSnapshot().phase, "pending", "old cancel cannot overwrite replacement pending");
    assert.equal(inputs.getSnapshot().result, retained);
    assert.deepEqual(observed.slice(-2), ["cancelled", "pending"]);
    if (starter === "cancelled-subscriber") assert.equal(joined, next);
    release.resolve(); await Promise.all([old, next]);
    assert.equal(inputs.getSnapshot().phase, "success");
    assert.equal(sent.filter(x => x.method === "design.checkInputs").length, 3);
  });
}
test("input failure freezes one diagnostic observation while retaining the original error and Core result", async (t) => {
  const { inputs, client } = await setup(t);
  await inputs.check(); const retained = inputs.getSnapshot().result;
  let reads = 0;
  const failure = new Error();
  Object.defineProperty(failure, "message", { get() { reads++; return "A stable input error"; } });
  client.checkInputs = () => { throw failure; };
  await inputs.check();
  const state = inputs.getSnapshot();
  assert.equal(state.phase, "failed");
  assert(state.error === failure);
  assert.equal(state.result, retained);
  assert.equal(reads, 1, "diagnostic read once before publishing failure");
  for (let n = 0; n < 20; n++) assert.equal(inputs.getSnapshot().message, "A stable input error");
  assert.equal(reads, 1);
  inputs.cancel();
  assert.equal(inputs.getSnapshot(), state, "cancel without pending leaves original failure available");
});
for (const intent of ["replace", "dispose"]) {
  test(`input diagnostic ${intent} revokes old failure publication`, async (t) => {
    const { inputs, client, original } = await setup(t);
    await inputs.check(); const retained = inputs.getSnapshot().result, observed = [];
    let replacement, first = true;
    const failure = new Error();
    Object.defineProperty(failure, "message", { get() {
      if (intent === "replace") { inputs.cancel(); replacement = inputs.check(); }
      else inputs.dispose();
      return "A obsolete input diagnostic";
    } });
    inputs.subscribe(() => observed.push(inputs.getSnapshot()));
    client.checkInputs = (...args) => {
      if (first) { first = false; throw failure; }
      return original(...args);
    };
    await inputs.check();
    if (intent === "replace") {
      assert(replacement, "formatting executes before publishing, allowing the newer intent");
      await replacement;
      assert.equal(inputs.getSnapshot().phase, "success");
    } else {
      assert.equal(inputs.getSnapshot().phase, "cancelled");
      assert.equal(inputs.getSnapshot().result, retained);
    }
    assert(!observed.some(state => state.phase === "failed"));
    assert.equal(inputs.getSnapshot().message, undefined);
  });
}
test("unreadable input diagnostics retain readable nested causes and inspection identities", async (t) => {
  const { inputs, client } = await setup(t), rows = diagnostics(t);
  await inputs.check(); const retained = inputs.getSnapshot().result;
  const leaf = new Error(), inspection = new Error("A input getter inspection");
  Object.defineProperty(leaf, "message", { get() { throw inspection; } });
  leaf.cause = new Error("A readable input cause");
  const failure = new AggregateError([leaf], "A input wrapper");
  client.checkInputs = () => { throw failure; };
  await inputs.check();
  const state = inputs.getSnapshot();
  assert.equal(state.phase, "failed"); assert(state.error === failure);
  assert.equal(state.result, retained);
  assert.match(state.message, /A input wrapper/);
  assert.match(state.message, /无法读取原始显示错误/);
  assert.match(state.message, /A readable input cause/);
  assert(rows.some(args => args.some(value => value instanceof AggregateError && value.errors.includes(leaf) && value.errors.includes(inspection))));
});
