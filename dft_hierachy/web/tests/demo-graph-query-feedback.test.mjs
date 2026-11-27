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
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-query-feedback-unit-"));
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
  const snapshotId = client.snapshot.snapshotId;
  const root = (await client.roots()).result[0];
  const port = (await client.ports(root.ref)).result.find((p) => p.name === "y");
  assert(port);
  const channels = [
    {
      name: "search",
      model: panels.search,
      submit: (text) => panels.searchText(text),
      first: "obsolete",
      last: "demo_graph_top",
    },
    {
      name: "path",
      model: panels.resolution,
      submit: (text) => panels.resolvePath(text),
      first: "[",
      last: "demo_graph_top",
    },
    {
      name: "connections",
      model: panels.connections,
      submit: (side) =>
        panels.loadConnections({
          slice: { ref: port.ref, bits: { lsb: 0, width: 1 } },
          reach: "local",
          ...(side ? { side } : {}),
        }),
      first: "",
      last: "inside",
    },
  ];
  return { client, panels, reports, snapshotId, root, port, channels };
}

test("host submissions supersede old reports independently for search, path and exact connection slices", async (t) => {
  const { channels, reports, panels } = await setup(t);
  const selection = panels.selection.current;
  for (const channel of channels) {
    const first = channel.submit(channel.first),
      current = channel.submit(channel.last);
    const results = await Promise.allSettled([first, current]);
    assert.deepEqual(
      results.map((x) => x.status),
      ["rejected", "fulfilled"],
      channel.name,
    );
    assert.equal(channel.model.state.status, "success", channel.name);
    assert.deepEqual(reports, [], channel.name);
  }
  assert.deepEqual(panels.connections.state.target.slice.bits, { lsb: 0, width: 1 });
  assert.equal(panels.connections.state.target.side, "inside");
  assert.equal(panels.selection.current, selection);
});

test("cancel and clear revoke only the old host report and preserve model terminal states", async (t) => {
  const { channels, reports } = await setup(t);
  for (const channel of channels) {
    for (const action of ["cancel", "clear"]) {
      await channel.model.clear();
      const pending = channel.submit(channel.first);
      const ending = channel.model[action]();
      await assert.rejects(pending, (error) => error.code === "cancelled");
      await ending;
      assert.equal(channel.model.state.status, action === "cancel" ? "cancelled" : "idle");
      assert.deepEqual(reports, [], channel.name + "/" + action);
    }
  }
});

test("external same-query reload revokes host eligibility without adopting that caller's failure", async (t) => {
  const { panels, reports, snapshotId } = await setup(t);
  const pending = panels.resolvePath("[");
  const target = panels.resolution.state.query;
  const external = panels.resolution.reload();
  await assert.rejects(pending, (error) => error.code === "cancelled");
  await assert.rejects(external, (error) => error.code === "bad_request");
  assert.equal(panels.resolution.state.query, target, "same raw query identity was reused");
  assert.equal(panels.resolution.state.status, "failed");
  assert.deepEqual(reports, []);
  const next = panels.resolvePath("[");
  await assert.rejects(next, (error) => error.code === "bad_request");
  assert.equal(reports.length, 1, "new explicit host failure reports normally");
  await panels.resolution.load({ snapshotId, text: "demo_graph_top" });
  assert.equal(reports.length, 1, "success does not clear existing history");
});

test("joined, entry-rejected and listener-failed current commands keep their original errors", async (t) => {
  const { panels, reports } = await setup(t);
  const first = panels.resolvePath("["),
    joined = panels.resolvePath("[");
  assert.equal(first, joined, "original model pending promise is returned");
  await assert.rejects(first);
  await assert.rejects(joined);
  assert.equal(reports.length, 1, "only the latest joined host waiter reports");
  const state = panels.resolution.state;
  await assert.rejects(panels.resolvePath(undefined), (error) => error.code === "invalid_argument");
  assert.equal(panels.resolution.state, state);
  assert.equal(reports.length, 2, "entry rejection is not silently dropped");
  const marker = new Error("A current query listener failed");
  const off = panels.resolution.subscribe(() => {
    throw marker;
  });
  let original;
  await assert.rejects(panels.resolvePath("demo_graph_top"), (error) => {
    original = error;
    return error instanceof AggregateError && error.errors.includes(marker);
  });
  off();
  assert.equal(reports.at(-1), original, "original aggregate and causes retained");
  assert.equal(panels.resolution.state.status, "success");
});

test("different model, selection and disposal ownership remain independent", async (t) => {
  const { panels, reports, snapshotId, root } = await setup(t);
  const path = panels.resolvePath("["),
    search = panels.searchText("obsolete");
  await panels.search.cancel();
  await assert.rejects(search);
  await assert.rejects(path);
  assert.equal(reports.length, 1);
  assert.match(reports[0].message, /hierarchy path syntax/);
  reports.length = 0;
  const old = panels.resolvePath("[");
  panels.selection.select({ snapshotId, origin: "tree", items: [{ ref: root.ref }] });
  await assert.rejects(old);
  assert.deepEqual(reports, [], "selection generation still revokes old reports");
  const pending = panels.searchText("obsolete");
  panels.dispose();
  await assert.rejects(pending);
  await assert.rejects(panels.resolvePath("["), (error) => error.code === "disposed");
  assert.deepEqual(reports, [], "released report entry cannot publish");
});

test("a reentrant host submission preserves the original model rejection and later explicit retry", async (t) => {
  const { panels, reports } = await setup(t);
  let nested;
  const off = panels.search.subscribe(() => {
    if (panels.search.state.status === "pending") nested = panels.searchText("nested");
  });
  await panels.searchText("demo_graph_top");
  await assert.rejects(nested, (error) => error.code === "reentrant_change");
  off();
  assert.equal(panels.search.state.status, "success");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].code, "reentrant_change");
  await panels.searchText("explicit retry");
  assert.equal(panels.search.state.status, "success");
  assert.equal(reports.length, 1);
});

test("selection changes during dependent publication cannot admit an obsolete automatic connection query", async (t) => {
  const { client, panels, snapshotId, port } = await setup(t);
  let changed = false;
  let published;
  const publication = new Promise((resolve) => {
    published = resolve;
  });
  const off = panels.properties.subscribe(() => {
    if (!changed && panels.properties.state.status === "pending") {
      changed = true;
      panels.selection.select({ snapshotId, origin: "external", items: [] });
      published();
    }
  });
  panels.selection.select({ snapshotId, origin: "external", items: [{ ref: port.ref }] });
  await publication;
  assert(changed, "real obj.get reached the dependent model publication");
  await client.roots();
  off();
  assert.equal(panels.selection.current.items.length, 0);
  assert.equal(panels.connections.state.status, "idle");
  assert.equal(panels.connections.state.target, null);
});
