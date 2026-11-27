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
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-publication-unit-"));
let DesignLifecycle;
try {
  const result = await build({
    stdin: {
      contents: 'export {DesignLifecycle} from "./design-lifecycle.js";',
      resolveDir: path.join(app, "src"),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const file = path.join(temp, "panels.mjs");
  await writeFile(file, result.outputFiles[0].text);
  ({ DesignLifecycle } = await import(pathToFileURL(file)));
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

for (const phase of ["picking", "opening", "connecting"]) {
  test(`release from ${phase} publication revokes the next external operation and every later snapshot`, async (t) => {
    const { lifecycle, calls } = await setup(t);
    let released;
    lifecycle.subscribe(() => {
      if (!released && lifecycle.getSnapshot().phase === phase) {
        lifecycle.releaseDocument();
        released = lifecycle.getSnapshot();
      }
    });
    await lifecycle.open(source);
    assert(released);
    console.log(
      JSON.stringify({ phase, calls, snapshotChanged: lifecycle.getSnapshot() !== released }),
    );
    assert.equal(lifecycle.getSnapshot(), released);
    assert.deepEqual(
      calls,
      phase === "picking" ? [] : phase === "opening" ? ["pick"] : ["pick", "open:1"],
    );
    assert.equal(lifecycle.getSnapshot().active, undefined);
    await lifecycle.open(source);
    await lifecycle.close(false);
    lifecycle.dismissOperationMessage();
    assert.equal(lifecycle.getSnapshot(), released);
  });
}

test("release from ready withdraws all published models and stops old root loading and report callbacks", async (t) => {
  const { lifecycle, transports, sent } = await setup(t);
  let owner, released;
  lifecycle.subscribe(() => {
    if (!owner && lifecycle.getSnapshot().phase === "ready") {
      owner = lifecycle.getSnapshot().active;
      owner.panels.onCommandError({ error: new Error("A prior history") });
      lifecycle.releaseDocument();
      released = lifecycle.getSnapshot();
    }
  });
  await lifecycle.open(source);
  assert(owner);
  assert.equal(lifecycle.getSnapshot(), released);
  assert.equal(released.active, undefined);
  assert.equal(released.operationMessage, undefined);
  assert.equal(released.compilation, undefined);
  assert(owner.panels.selection.disposed && owner.panels.designGraph.graph.disposed);
  assert.equal(sent.filter((x) => x.method === "inst.roots").length, 0);
  let notified = 0;
  const off = lifecycle.subscribe(() => notified++);
  lifecycle.dismissOperationMessage();
  owner.panels.onCommandError({ error: new Error("A late report") });
  off();
  assert.equal(notified, 0);
  assert.equal(lifecycle.getSnapshot(), released);
  await transports[0].exited;
});

test("release during replacement detach cannot acquire another session after revoking the old models", async (t) => {
  const { lifecycle, calls, transports } = await setup(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active;
  let released;
  lifecycle.subscribe(() => {
    if (!released && lifecycle.getSnapshot().active === undefined) {
      lifecycle.releaseDocument();
      released = lifecycle.getSnapshot();
    }
  });
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot(), released);
  assert.deepEqual(
    calls.filter((x) => x.startsWith("open:")),
    ["open:1"],
  );
  assert(old.panels.selection.disposed);
  await transports[0].exited;
});

test("close publication release retains one required known-session cleanup and cannot publish a late terminal state", async (t) => {
  const { lifecycle, calls, transports } = await setup(t);
  await lifecycle.open(source);
  let released;
  lifecycle.subscribe(() => {
    if (!released && lifecycle.getSnapshot().phase === "closing") {
      lifecycle.releaseDocument();
      released = lifecycle.getSnapshot();
    }
  });
  await lifecycle.close(false);
  assert.equal(lifecycle.getSnapshot(), released);
  assert.deepEqual(
    calls.filter((x) => x.startsWith("close:")),
    ["close:1"],
  );
  await transports[0].exited;
});

test("disconnect detach release cannot recreate lost-session state or publish recovery over the final document", async (t) => {
  const { lifecycle, transports } = await setup(t);
  await lifecycle.open(source);
  let released;
  lifecycle.subscribe(() => {
    if (!released && lifecycle.getSnapshot().active === undefined) {
      lifecycle.releaseDocument();
      released = lifecycle.getSnapshot();
    }
  });
  transports[0].close();
  await transports[0].exited;
  assert(released);
  assert.equal(lifecycle.getSnapshot(), released);
  assert.equal(released.active, undefined);
});

test("an already sent open still closes its late known id after release without connecting", async (t) => {
  const { lifecycle, bridge, calls } = await setup(t);
  const entered = deferred(),
    late = deferred();
  bridge.openDesign = () => {
    calls.push("open-pending");
    entered.resolve();
    return late.promise;
  };
  const pending = lifecycle.open(source);
  await entered.promise;
  lifecycle.releaseDocument();
  const released = lifecycle.getSnapshot();
  late.resolve(ok({ sessionId: "late-known", label: "late.sv" }));
  await pending;
  assert.deepEqual(calls, ["pick", "open-pending", "close:late-known"]);
  assert.equal(lifecycle.getSnapshot(), released);
});

test("a required close rejection after publication release remains diagnostic without reopening or changing final state", async (t) => {
  const { lifecycle, bridge, calls } = await setup(t);
  await lifecycle.open(source);
  const errors = [],
    original = console.error,
    marker = new Error("A late known-session close rejection");
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = original;
  });
  bridge.closeDesign = async (id) => {
    calls.push("close:" + id);
    throw marker;
  };
  let released;
  lifecycle.subscribe(() => {
    if (!released && lifecycle.getSnapshot().phase === "closing") {
      lifecycle.releaseDocument();
      released = lifecycle.getSnapshot();
    }
  });
  await lifecycle.close(false);
  assert.equal(lifecycle.getSnapshot(), released);
  assert.equal(calls.filter((x) => x === "close:1").length, 1);
  assert(
    errors.some((args) => args.includes(marker)),
    "retain original late cleanup rejection",
  );
});

for (const terminal of ["idle", "failed"]) {
  test(`close ${terminal} publication cannot overwrite a new explicit open's phase message`, async (t) => {
    const { lifecycle, bridge } = await setup(t);
    await lifecycle.open(source);
    if (terminal === "failed")
      bridge.closeDesign = async () => {
        throw new Error("A original close failure");
      };
    const gate = deferred();
    bridge.pickDesign = () => gate.promise;
    let next;
    lifecycle.subscribe(() => {
      if (!next && lifecycle.getSnapshot().phase === terminal) next = lifecycle.open(source);
    });
    await lifecycle.close(false);
    assert(next);
    assert.equal(lifecycle.getSnapshot().phase, "picking");
    assert.equal(lifecycle.getSnapshot().message, "选择中");
    gate.resolve(ok(null));
    await next;
    assert.equal(lifecycle.getSnapshot().phase, "cancelled");
    assert.equal(lifecycle.getSnapshot().message, "已取消选择");
  });
}

test("disconnect cleanup errors formed after reentrant release preserve their original diagnostic", async (t) => {
  const { lifecycle, transports } = await setup(t);
  await lifecycle.open(source);
  const owner = lifecycle.getSnapshot().active,
    release = owner.panels.dispose.bind(owner.panels);
  const marker = new Error("A detached resource cleanup failure"),
    errors = [],
    original = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = original;
  });
  owner.panels.dispose = () => {
    release();
    throw marker;
  };
  let released;
  lifecycle.subscribe(() => {
    if (!released && lifecycle.getSnapshot().active === undefined) {
      lifecycle.releaseDocument();
      released = lifecycle.getSnapshot();
    }
  });
  transports[0].close();
  await transports[0].exited;
  assert.equal(lifecycle.getSnapshot(), released);
  assert(errors.some((args) => args.includes(marker)));
  assert(owner.panels.selection.disposed && owner.panels.designGraph.graph.disposed);
});
