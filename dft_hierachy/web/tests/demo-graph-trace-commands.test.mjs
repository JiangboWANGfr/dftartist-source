import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const web = fileURLToPath(new URL("../", import.meta.url));
const root = process.env.HIER_A_DEMO_DELIVERY ?? web;
const app = process.env.HIER_A_DEMO_DELIVERY ? path.join(root, "app") : path.join(web, "apps/demo");
const clientRoot = path.join(root, "node_modules/@hier/client");
const manifest = JSON.parse(await readFile(path.join(clientRoot, "package.json"), "utf8"));
const { createProcessTransport } = await import(
  pathToFileURL(path.join(clientRoot, manifest.exports["./node"].import))
);
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-trace-commands-unit-"));
let DesignPanels, HierClient;
try {
  const result = await build({
    stdin: {
      contents:
        'export {DesignPanels} from "./design-panels.js"; export {HierClient} from "@hier/client";',
      resolveDir: path.join(app, "src"),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const file = path.join(temp, "panels.mjs");
  await writeFile(file, result.outputFiles[0].text);
  ({ DesignPanels, HierClient } = await import(pathToFileURL(file)));
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
  const reports = [],
    panels = new DesignPanels(client, (error) => reports.push(error));
  t.after(async () => {
    panels.dispose();
    client.dispose();
    transport.close();
    await transport.exited;
  });
  const root = (await client.roots()).result[0];
  const port = (await client.ports(root.ref)).result.find((p) => p.name === "y");
  assert(port);
  const request = {
    start: { slice: { ref: port.ref, bits: { lsb: 1, width: 2 } }, side: "inside" },
    direction: "back",
    policy: "combinational",
    budget: { maxNodes: 100, maxEdges: 200, maxDepth: 20, maxMillis: 1000 },
  };
  return { panels, client, reports, request, sent, root, port };
}
const turn = () => new Promise(setImmediate);

test("consecutive host traces return the original commands, retain exact inputs and only report the latest", async (t) => {
  const { panels: p, reports, request, sent } = await setup(t);
  const originalLoad = p.designGraph.load.bind(p.designGraph),
    commands = [];
  p.designGraph.load = (input) => {
    const command = originalLoad(input);
    commands.push(command);
    return command;
  };
  const old = p.loadTrace(request),
    latest = p.loadTrace({ ...request, direction: "forward" });
  assert.equal(old, commands[0]);
  assert.equal(latest, commands[1]);
  assert.deepEqual(
    (await Promise.allSettled([old, latest])).map((x) => x.status),
    ["rejected", "fulfilled"],
  );
  assert.equal(p.designGraph.trace.state.status, "success");
  assert.deepEqual(reports, []);
  const frames = sent.filter((x) => x.method === "trace.cone");
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0].params, request);
  assert.deepEqual(frames[1].params, { ...request, direction: "forward" });
  assert(sent.some((x) => x.method === "cancel" && x.params.target === frames[0].id));
});

for (const action of ["cancel", "clear", "collapse"]) {
  test(`host trace ${action} consumes the withdrawn waiter and preserves other sources and retained content`, async (t) => {
    const { panels: p, reports, request, root } = await setup(t);
    const g = p.designGraph;
    await g.showExample({ ref: root.ref });
    const example = g.example.state;
    await p.loadTrace(request);
    const content = g.trace.state.content;
    const old = p.loadTrace(request);
    const ending =
      action === "cancel"
        ? p.cancelTrace()
        : action === "clear"
          ? p.clearTrace()
          : g.cancelPending();
    await assert.rejects(old, { code: "cancelled" });
    await ending;
    assert.equal(g.trace.state.status, action === "clear" ? "idle" : "cancelled");
    assert.equal(g.trace.state.content, action === "clear" ? null : content);
    assert.equal(g.example.state, example);
    assert.deepEqual(reports, []);
    await p.loadTrace(request);
    assert.equal(g.trace.state.status, "success");
    assert.deepEqual(reports, []);
  });
}

test("unrelated graph sources cannot revoke the current Core failure or clear its history on retry", async (t) => {
  const { panels: p, reports, request, root } = await setup(t);
  const bad = { ...request, start: { slice: request.start.slice } };
  const task = p.loadTrace(bad);
  const pending = p.designGraph.trace.state;
  await p.designGraph.showExample({ ref: root.ref });
  await p.designGraph.example.clear();
  assert.equal(p.designGraph.trace.state, pending);
  let original;
  await assert.rejects(task, (error) => {
    original = error;
    return error.code === "bad_request";
  });
  assert.equal(p.designGraph.trace.state.status, "failed");
  assert.equal(reports.length, 1);
  assert.equal(reports[0], original);
  assert.equal(original.message, "invalid side for this object");
  await p.loadTrace(request);
  assert.equal(p.designGraph.trace.state.status, "success");
  assert.equal(reports.length, 1);
});

test("external trace mutations withdraw host eligibility without adopting the external caller's error", async (t) => {
  const { panels: p, reports, request } = await setup(t);
  for (const action of ["cancel", "clear", "refresh"]) {
    const old = p.loadTrace(request);
    const next =
      action === "refresh"
        ? p.designGraph.load({ ...request, start: { slice: request.start.slice } })
        : p.designGraph.trace[action]();
    await assert.rejects(old, { code: "cancelled" });
    if (action === "refresh") await assert.rejects(next, { code: "bad_request" });
    else await next;
    assert.deepEqual(reports, [], action);
  }
  await assert.rejects(p.loadTrace({ ...request, start: { slice: request.start.slice } }), {
    code: "bad_request",
  });
  assert.equal(reports.length, 1, "new host failure reports normally");
});

test("trace entry and listener errors preserve identity and current command cancellation cleanup failures", async (t) => {
  const { panels: p, reports, request } = await setup(t);
  await assert.rejects(p.loadTrace(undefined));
  assert.equal(reports.length, 1);
  const marker = new Error("A trace notification listener failed");
  const old = p.loadTrace(request);
  const off = p.designGraph.graph.subscribe(() => {
    throw marker;
  });
  let original;
  await assert.rejects(p.cancelTrace(), (error) => {
    original = error;
    return error instanceof AggregateError && error.errors.includes(marker);
  });
  await assert.rejects(old, { code: "cancelled" });
  off();
  assert.equal(p.designGraph.trace.state.status, "cancelled");
  assert.equal(reports.length, 2);
  assert.equal(reports[1], original);
  await p.loadTrace(request);
  assert.equal(reports.length, 2);
});

test("reentrant trace rejection remains explicit and does not weaken the public graph guard", async (t) => {
  const { panels: p, reports, request } = await setup(t);
  let nested;
  const off = p.designGraph.graph.subscribe(() => {
    if (!nested && p.designGraph.trace.state.status === "pending") nested = p.loadTrace(request);
  });
  await p.loadTrace(request);
  await assert.rejects(nested, { code: "reentrant_change" });
  off();
  assert.equal(p.designGraph.trace.state.status, "success");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].code, "reentrant_change");
  await p.loadTrace(request);
  assert.equal(reports.length, 1);
});

test("selection and disposal revoke old trace reports without closing the borrowed SDK", async (t) => {
  const { panels: p, reports, request, client, root } = await setup(t);
  const old = p.loadTrace({ ...request, start: { slice: request.start.slice } });
  p.selection.select({
    snapshotId: client.snapshot.snapshotId,
    origin: "external",
    items: [{ ref: root.ref }],
  });
  await assert.rejects(old);
  const task = p.loadTrace(request);
  p.dispose();
  await assert.rejects(task, { code: "disposed" });
  await assert.rejects(p.loadTrace(request), { code: "disposed" });
  await assert.rejects(p.cancelTrace(), { code: "disposed" });
  await assert.rejects(p.clearTrace(), { code: "disposed" });
  await turn();
  assert.deepEqual(reports, []);
  assert((await client.roots()).result.length > 0);
});

test("direct source replacement success revokes a withdrawn trace waiter using its source revision", async (t) => {
  const { panels: p, reports, request } = await setup(t);
  const g = p.designGraph;
  await p.loadTrace(request);
  const { nodes, edges } = g.graph.state,
    content = g.trace.state.content;
  const fragment = {
    snapshotId: g.graph.snapshotId,
    nodes: nodes.map((member) => member.node),
    edges: edges.map((member) => member.edge),
    completeness: content.completeness,
    frontier: content.frontier,
    hasConservative: content.hasConservative,
  };
  const old = p.loadTrace(request),
    pendingRevision = g.trace.state.revision;
  await g.trace.replace(fragment);
  await assert.rejects(old, { code: "cancelled" });
  assert.equal(g.trace.state.status, "success");
  assert(g.trace.state.revision > pendingRevision);
  assert.deepEqual(reports, []);
});
