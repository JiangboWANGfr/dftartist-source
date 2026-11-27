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
for (const action of ["cancel", "dispose"])
  test(`input ${action} before the initial checkpoint revokes the SDK entry`, async (t) => {
    const { inputs, calls, sent } = await setup(t);
    const work = inputs.check();
    inputs[action]();
    await work;
    assert.equal(calls.length, 0);
    assert.equal(sent.filter((x) => x.method === "design.checkInputs").length, 0);
    assert.equal(inputs.getSnapshot().phase, "cancelled");
  });
test("only the final check in a same-stack cancel and retry enters the SDK", async (t) => {
  const { inputs, calls, sent } = await setup(t);
  const first = inputs.check();
  inputs.cancel();
  const next = inputs.check();
  assert.notEqual(first, next);
  for (let n = 0; n < 20; n++) assert.equal(inputs.check(), next);
  await Promise.all([first, next]);
  assert.equal(calls.length, 1);
  assert.equal(sent.filter((x) => x.method === "design.checkInputs").length, 1);
  assert.equal(inputs.getSnapshot().phase, "success");
});
test("a nested cancellation stops delivery of the superseded pending snapshot", async (t) => {
  const { inputs, calls } = await setup(t);
  const observations = [];
  inputs.subscribe(() => {
    if (inputs.getSnapshot().phase === "pending") inputs.cancel();
  });
  inputs.subscribe(() => observations.push(inputs.getSnapshot()));
  await inputs.check();
  assert.equal(calls.length, 0);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].phase, "cancelled");
});
test("a pending listener exception is diagnostic and cannot escape the command or block valid listeners", async (t) => {
  const { inputs } = await setup(t),
    rows = diagnostics(t),
    marker = new Error("A pending subscriber failure"),
    observed = [];
  inputs.subscribe(() => {
    if (inputs.getSnapshot().phase === "pending") throw marker;
  });
  inputs.subscribe(() => observed.push(inputs.getSnapshot().phase));
  let completion;
  assert.doesNotThrow(() => {
    completion = inputs.check();
  });
  await completion;
  assert.equal(inputs.getSnapshot().phase, "success");
  assert.deepEqual(observed, ["pending", "success"]);
  assert(rows.some((args) => args.includes(marker)));
});
test("success publication errors do not turn a real Core observation into a query failure", async (t) => {
  const { inputs } = await setup(t),
    rows = diagnostics(t),
    marker = new Error("A success subscriber failure"),
    observed = [];
  inputs.subscribe(() => {
    if (inputs.getSnapshot().phase === "success") throw marker;
  });
  inputs.subscribe(() => observed.push(inputs.getSnapshot()));
  await inputs.check();
  const state = inputs.getSnapshot();
  assert.equal(state.phase, "success");
  assert.deepEqual(state.result, { changed: [], complete: true });
  assert.equal(observed.at(-1), state);
  assert(rows.some((args) => args.includes(marker)));
});
test("a terminal subscriber starting a new check cannot redeliver the old terminal notification over its pending snapshot", async (t) => {
  const { inputs, calls } = await setup(t),
    observed = [];
  let next;
  inputs.subscribe(() => {
    if (inputs.getSnapshot().phase === "success" && !next) next = inputs.check();
  });
  inputs.subscribe(() => observed.push(inputs.getSnapshot().phase));
  await inputs.check();
  assert(next);
  await next;
  assert.equal(calls.length, 2);
  assert.deepEqual(observed, ["pending", "pending", "success"]);
});
test("an SDK entry rejection retains its exact identity and prior observation despite a failed-state subscriber", async (t) => {
  const { inputs, client } = await setup(t);
  await inputs.check();
  const result = inputs.getSnapshot().result,
    entry = new Error("A SDK entry rejected"),
    listener = new Error("A failed subscriber");
  const rows = diagnostics(t);
  client.checkInputs = () => {
    throw entry;
  };
  inputs.subscribe(() => {
    if (inputs.getSnapshot().phase === "failed") throw listener;
  });
  await inputs.check();
  assert.equal(inputs.getSnapshot().phase, "failed");
  assert.equal(inputs.getSnapshot().error, entry);
  assert.equal(inputs.getSnapshot().result, result);
  assert(rows.some((args) => args.includes(listener)));
});
