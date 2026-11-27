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
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-selection-staging-unit-"));
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
  const requests = [];
  const send = transport.send.bind(transport);
  transport.send = (request) => {
    requests.push(request);
    send(request);
  };
  const client = new HierClient(transport);
  await client.ready;
  const reports = [],
    reportWaiters = [],
    panels = new DesignPanels(client, (error) => {
      reports.push(error);
      for (const resolve of reportWaiters.splice(0)) resolve();
    });
  const waitForReport = () =>
    reports.length ? Promise.resolve() : new Promise((resolve) => reportWaiters.push(resolve));
  t.after(async () => {
    panels.dispose();
    client.dispose();
    transport.close();
    await transport.exited;
  });
  const snapshotId = client.snapshot.snapshotId;
  const root = (await client.roots()).result[0];
  const port = (await client.ports(root.ref)).result.find((p) => p.name === "y");
  assert(port);

  return { client, panels, reports, snapshotId, root, port, requests, waitForReport };
}

function waitFor(model, check) {
  if (check()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = model.subscribe(() => {
      if (check()) {
        off();
        resolve();
      }
    });
  });
}
function select(c, items, origin = "external") {
  c.panels.selection.select({ snapshotId: c.snapshotId, origin, items });
}
async function prepare(c, name) {
  select(c, [
    name === "instances"
      ? { def: c.root.def }
      : name === "connections"
        ? { ref: c.port.ref, side: "inside" }
        : { ref: c.root.ref },
  ]);
  await waitFor(c.panels[name], () => c.panels[name].state.status === "success");
  await waitFor(c.panels.navigation, () => c.panels.navigation.state.document.status === "success");
  assert.deepEqual(c.reports, []);
}
for (const name of ["properties", "connections", "instances"]) {
  test(
    `selection clear from ${name} publication removes old data without reentrant mutation`,
    { timeout: 30_000 },
    async (t) => {
      const c = await setup(t),
        p = c.panels,
        model = p[name];
      await prepare(c, name);
      let changed = false;
      const off = model.subscribe(() => {
        if (!changed && model.state.status === "pending") {
          changed = true;
          select(c, []);
        }
      });
      const pending = model.reload();
      await assert.rejects(pending, (error) => error.code === "cancelled");
      off();
      await c.client.roots();
      assert(changed);
      assert.equal(p.selection.current.items.length, 0);
      for (const dependent of [p.properties, p.connections, p.instances])
        assert.equal(dependent.state.status, "idle");
      assert.equal(p.navigation.state.document.status, "idle");
      assert.equal(p.navigation.state.candidates, null);
      assert.deepEqual(c.reports, []);
    },
  );
  test(
    `selection redirect from ${name} publication only loads the new context`,
    { timeout: 30_000 },
    async (t) => {
      const c = await setup(t),
        p = c.panels,
        model = p[name];
      await prepare(c, name);
      const items = name === "properties" ? [{ def: c.root.def }] : [{ ref: c.root.ref }];
      let changed = false;
      const off = model.subscribe(() => {
        if (!changed && model.state.status === "pending") {
          changed = true;
          select(c, items);
        }
      });
      await assert.rejects(model.reload(), (error) => error.code === "cancelled");
      off();
      const current = name === "properties" ? p.instances : p.properties;
      await waitFor(current, () => current.state.status === "success");
      await waitFor(p.navigation, () => p.navigation.state.document.status === "success");
      assert.deepEqual(p.selection.current.items, items);
      assert.equal(p.connections.state.status, "idle");
      assert.equal(
        name === "properties" ? p.properties.state.status : p.instances.state.status,
        "idle",
      );
      assert.equal(p.navigation.state.document.target.ref, items[0].def ?? items[0].ref);
      assert.deepEqual(c.reports, []);
    },
  );
}

test(
  "same-stack selection changes retain history but issue dependent queries only for the final selection",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    c.requests.length = 0;
    select(c, [{ ref: c.port.ref }]);
    select(c, [{ def: c.root.def }]);
    select(c, [{ ref: c.root.ref }]);
    select(c, []);
    await Promise.resolve();
    await c.client.roots();
    assert(p.selection.canGoBack);
    assert.equal(p.selection.current.items.length, 0);
    assert.deepEqual(
      c.requests.filter((x) =>
        ["obj.get", "obj.source", "source.read", "def.instances"].includes(x.method),
      ),
      [],
    );
    c.requests.length = 0;
    select(c, [{ ref: c.port.ref }]);
    select(c, [{ def: c.root.def }]);
    select(c, [{ ref: c.root.ref }]);
    await waitFor(p.properties, () => p.properties.state.status === "success");
    await waitFor(p.navigation, () => p.navigation.state.document.status === "success");
    const lookedUp = c.requests.filter((x) => x.method === "obj.get").map((x) => x.params.ref);
    assert(
      lookedUp.length > 0 && lookedUp.every((ref) => ref === c.root.ref),
      "host and tree may both validate the final object; no obsolete object is queried",
    );
    assert.deepEqual(c.reports, []);
  },
);

test(
  "explicit source intent wins over queued selection defaults and model notification callbacks",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    c.requests.length = 0;
    select(c, [{ ref: c.root.ref }]);
    p.sourceKind("instantiation");
    p.sourceKind("definition");
    await waitFor(p.navigation, () => p.navigation.state.document.status === "success");
    assert.equal(p.navigation.state.document.target.kind, "definition");
    assert(
      c.requests
        .filter((x) => x.method === "obj.source")
        .every((x) => x.params.kind === "definition"),
    );
    let redirected = false;
    const off = p.navigation.subscribe(() => {
      if (!redirected && p.navigation.state.document.status === "pending") {
        redirected = true;
        p.sourceKind("definition");
      }
    });
    p.sourceKind("instantiation");
    await waitFor(
      p.navigation,
      () => redirected && p.navigation.state.document.status === "success",
    );
    off();
    assert.equal(p.navigation.state.document.target.kind, "definition");
    assert.deepEqual(c.reports, []);
  },
);

test(
  "source reload and cancel inside navigation publication preserve the latest command and current errors",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    await prepare(c, "properties");
    let cancelled = false;
    const off = p.navigation.subscribe(() => {
      if (!cancelled && p.navigation.state.document.status === "pending") {
        cancelled = true;
        p.cancelSource();
      }
    });
    p.reloadSource();
    await waitFor(p.navigation, () => p.navigation.state.document.status === "cancelled");
    off();
    assert.deepEqual(c.reports, []);
    p.reloadSource();
    await waitFor(p.navigation, () => p.navigation.state.document.status === "success");
    p.sourceKind("instantiation");
    await waitFor(p.navigation, () => p.navigation.state.document.status === "failed");
    await c.waitForReport();
    assert.equal(c.reports.length, 1);
    assert.equal(c.reports[0].code, p.navigation.state.document.error.code);
    assert.notEqual(c.reports[0].code, "reentrant_change");
    p.sourceKind("definition");
    await waitFor(p.navigation, () => p.navigation.state.document.status === "success");
    assert.equal(c.reports.length, 1, "a successful explicit retry preserves historical reports");
  },
);

test(
  "real source-origin confirmation retains the document, candidate chain and action through deferred dependent loads",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    await prepare(c, "properties");
    const document = p.navigation.state.document.data;
    const offset = document.content.result.text.indexOf("assign y = mid") + "assign y = ".length;
    assert(offset > 0);
    await p.navigation.locate(document, offset);
    const refresh = p.navigation.state.refresh?.completion;
    if (refresh) await refresh;
    const original = p.navigation.state.document.data,
      binding = p.navigation.state.candidates;
    const page = binding.state.pages.find((page) =>
      page.result.items.some((item) => item.refKind === "object" && item.ref !== c.root.ref),
    );
    assert(page);
    const action = p.navigation.createCandidateAction(
      page,
      page.result.items.findIndex((item) => item.refKind === "object" && item.ref !== c.root.ref),
    );
    p.navigation.confirmCandidate(action, p.selection);
    await c.client.roots();
    await waitFor(p.properties, () => p.properties.state.status === "success");
    assert.equal(p.selection.current.origin, "source");
    assert.equal(p.navigation.state.document.data, original);
    assert.equal(p.navigation.state.candidates, binding);
    p.navigation.confirmCandidate(action, p.selection);
    assert.equal(p.navigation.state.document.data, original);
    assert.deepEqual(c.reports, []);
  },
);

test(
  "dispose before queued selection and source commands revokes every dependent action without closing the borrowed client",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    c.requests.length = 0;
    select(c, [{ ref: c.root.ref }]);
    p.sourceKind("definition");
    p.reloadSource();
    p.dispose();
    await Promise.resolve();
    assert.deepEqual(c.requests, []);
    await c.client.roots();
    assert(p.selection.disposed && p.navigation.disposed);
    assert.deepEqual(c.reports, []);
  },
);

test(
  "dispose during dependent clear stops the rest of that selection update",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    await prepare(c, "properties");
    c.requests.length = 0;
    const off = p.properties.subscribe(() => {
      if (p.properties.state.status === "idle") p.dispose();
    });
    select(c, [{ def: c.root.def }]);
    await Promise.resolve();
    off();
    await c.client.roots();
    assert(p.selection.disposed);
    assert.deepEqual(
      c.requests.filter((x) => ["obj.get", "obj.source", "def.instances"].includes(x.method)),
      [],
    );
    assert.deepEqual(c.reports, []);
  },
);

test(
  "multiple selection from a model notification clears dependent panels without choosing an arbitrary object",
  { timeout: 30_000 },
  async (t) => {
    const c = await setup(t),
      p = c.panels;
    await prepare(c, "properties");
    const items = [{ ref: c.root.ref }, { ref: c.port.ref }];
    let changed = false;
    const off = p.properties.subscribe(() => {
      if (!changed && p.properties.state.status === "pending") {
        changed = true;
        select(c, items);
      }
    });
    c.requests.length = 0;
    await assert.rejects(p.properties.reload(), (error) => error.code === "cancelled");
    off();
    await c.client.roots();
    assert.deepEqual(p.selection.current.items, items);
    for (const model of [p.properties, p.connections, p.instances])
      assert.equal(model.state.status, "idle");
    assert.equal(p.navigation.state.document.status, "idle");
    assert.deepEqual(
      c.requests.filter((x) => x.method === "obj.get" || x.method === "obj.source"),
      [],
    );
    assert.deepEqual(c.reports, []);
  },
);
