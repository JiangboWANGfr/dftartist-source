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
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-feedback-publication-unit-"));
let DesignLifecycle, diagnostic;
try {
  const result = await build({
    stdin: {
      contents: 'export {DesignLifecycle, diagnostic} from "./design-lifecycle.js";',
      resolveDir: path.join(app, "src"),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const file = path.join(temp, "panels.mjs");
  await writeFile(file, result.outputFiles[0].text);
  ({ DesignLifecycle, diagnostic } = await import(pathToFileURL(file)));
} finally {
  await rm(temp, { recursive: true });
}

const ok = (value) => ({ ok: true, value });
const source = { kind: "source" };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(t) {
  assert(process.env.HIER_BIN, "explicit actual Core executable");
  const calls = [],
    transports = [],
    sent = [];
  let serial = 0;
  const bridge = {
    version: 1,
    pickDesign: async () => {
      calls.push("pick");
      return ok({ token: "A-original-choice", label: "design.sv" });
    },
    openDesign: async () => {
      const id = String(++serial);
      calls.push("open:" + id);
      return ok({ sessionId: id, label: "design.sv" });
    },
    closeDesign: async (id) => {
      calls.push("close:" + id);
      return ok(null);
    },
  };
  const lifecycle = new DesignLifecycle(
    bridge,
    {},
    (change) => change(),
    async () => {
      calls.push("connect");
      const transport = createProcessTransport({
        command: process.env.HIER_BIN,
        args: ["serve", fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url))],
      });
      const send = transport.send.bind(transport);
      transport.send = (frame) => {
        sent.push(frame);
        send(frame);
      };
      transports.push(transport);
      return transport;
    },
  );
  t.after(async () => {
    lifecycle.releaseDocument();
    for (const transport of transports) {
      transport.close();
      await transport.exited;
    }
  });
  return { lifecycle, bridge, calls, transports, sent };
}

const tick = () => new Promise(setImmediate);
async function scene(t) {
  const s = await setup(t);
  await s.lifecycle.open(source);
  const p = s.lifecycle.getSnapshot().active.panels,
    client = p.client;
  const root = (await client.roots()).result[0],
    port = (await client.ports(root.ref)).result.find((x) => x.name === "y");
  const request = {
    start: { slice: { ref: port.ref, bits: { lsb: 0, width: 1 } }, side: "inside" },
    direction: "back",
    policy: "combinational",
    budget: { maxNodes: 100, maxEdges: 200, maxDepth: 20, maxMillis: 1000 },
  };
  const channels = {
    search: { model: p.search, sdk: "search", submit: () => p.searchText(root.name) },
    path: { model: p.resolution, sdk: "resolvePath", submit: () => p.resolvePath(root.name) },
    connections: {
      model: p.connections,
      sdk: "drivers",
      submit: () =>
        p.loadConnections({
          slice: { ref: port.ref, bits: { lsb: 0, width: 1 } },
          side: "inside",
          reach: "local",
        }),
    },
    trace: { model: p.designGraph.trace, sdk: "cone", submit: () => p.loadTrace(request) },
  };
  let cause;
  try {
    await client.object("invalid-reference");
  } catch (error) {
    cause = error;
  }
  assert.equal(cause.code, "bad_request");
  return { ...s, p, client, root, channels, cause };
}
function inject(client, channel, cause, action) {
  const original = client[channel.sdk].bind(client),
    failure = new Error("A obsolete feedback", { cause });
  let first = true,
    acted = false;
  Object.defineProperty(failure, "message", {
    get() {
      if (!acted) {
        acted = true;
        action();
      }
      return "A obsolete feedback";
    },
  });
  client[channel.sdk] = async (...args) => {
    const reply = await original(...args);
    if (first) {
      first = false;
      throw failure;
    }
    return reply;
  };
  return failure;
}
for (const name of ["search", "path", "connections", "trace"])
  for (const action of ["clear", "replace"])
    test(`actual Core ${name} feedback rechecks eligibility after a diagnostic ${action}`, async (t) => {
      const { lifecycle, p, client, channels, cause } = await scene(t),
        channel = channels[name];
      let newer;
      inject(client, channel, cause, () => {
        newer = action === "clear" ? channel.model.clear() : channel.submit();
      });
      let rejection;
      await assert.rejects(channel.submit(), (error) => {
        rejection = error;
        return true;
      });
      await newer;
      await tick();
      assert.equal(channel.model.state.status, action === "clear" ? "idle" : "success");
      assert.equal(
        lifecycle.getSnapshot().operationMessage,
        undefined,
        "obsolete command must not publish after formatting revokes its waiter",
      );
      assert(rejection);
      assert.equal(lifecycle.getSnapshot().active.panels, p);
    });
test("a newer component report wins over the old query whose diagnostic invoked it", async (t) => {
  const { lifecycle, p, client, channels, cause } = await scene(t),
    channel = channels.path;
  inject(client, channel, cause, () =>
    p.onCommandError({ error: new Error("A newer component feedback") }),
  );
  await assert.rejects(channel.submit());
  assert.equal(lifecycle.getSnapshot().operationMessage, "A newer component feedback");
});
test("a stable component report callback preserves nested newer feedback", async (t) => {
  const { lifecycle, p } = await scene(t),
    handler = p.onCommandError,
    old = new Error();
  let entered = false;
  Object.defineProperty(old, "message", {
    get() {
      if (!entered) {
        entered = true;
        handler({ error: new Error("A nested direct component") });
      }
      return "A obsolete direct component";
    },
  });
  handler({ error: old });
  assert.equal(p.onCommandError, handler);
  assert.equal(lifecycle.getSnapshot().operationMessage, "A nested direct component");
});
test("unrelated model success during formatting does not revoke a current error or erase history", async (t) => {
  const { lifecycle, p, client, channels, cause } = await scene(t);
  let unrelated;
  inject(client, channels.path, cause, () => {
    unrelated = p.searchText("demo_graph_top");
  });
  let original;
  await assert.rejects(channels.path.submit(), (error) => {
    original = error;
    return true;
  });
  await unrelated;
  const text = lifecycle.getSnapshot().operationMessage;
  assert.match(text, /A obsolete feedback/);
  assert.match(text, /bad_request/);
  assert.equal(channels.path.model.state.error.code, original.code);
  assert.equal(channels.path.model.state.error.message, original.message);
  await p.searchText("demo");
  assert.equal(lifecycle.getSnapshot().operationMessage, text);
});
test("selection replacement and document release during diagnostics cannot publish the old component report", async (t) => {
  const { lifecycle, p, root } = await scene(t);
  const first = new Error();
  Object.defineProperty(first, "message", {
    get() {
      p.selection.select({
        snapshotId: p.selection.snapshotId,
        items: [{ ref: root.ref }],
        origin: "external",
      });
      return "A released selection feedback";
    },
  });
  p.onCommandError({ error: first });
  await tick();
  assert.equal(lifecycle.getSnapshot().operationMessage, undefined);
  const final = new Error();
  Object.defineProperty(final, "message", {
    get() {
      lifecycle.releaseDocument();
      return "A released document feedback";
    },
  });
  p.onCommandError({ error: final });
  assert.equal(lifecycle.getSnapshot().operationMessage, undefined);
  assert.equal(lifecycle.getSnapshot().active, undefined);
});
