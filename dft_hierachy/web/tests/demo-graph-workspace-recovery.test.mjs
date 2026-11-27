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
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-workspace-unit-"));
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

function phase(lifecycle, expected) {
  if (lifecycle.getSnapshot().phase === expected) return Promise.resolve();
  return new Promise((resolve) => {
    const off = lifecycle.subscribe(() => {
      if (lifecycle.getSnapshot().phase === expected) {
        off();
        resolve();
      }
    });
  });
}
function released(owner) {
  assert(owner.panels.selection.disposed);
  assert(owner.panels.designGraph.graph.disposed);
  assert(owner.panels.designGraph.layout.disposed);
}
const failure = () => new Error("A original workspace render failure");

test("workspace failure withdraws every borrower, waits for main cleanup and permits explicit reopen", async (t) => {
  const { lifecycle, bridge, calls, transports } = await setup(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active,
    close = deferred();
  bridge.closeDesign = async (id) => {
    calls.push("close:" + id);
    return close.promise;
  };
  const check = old.inputs.check();
  lifecycle.workspaceFailed(old.id, failure());
  assert.equal(lifecycle.getSnapshot().active, undefined);
  assert.equal(lifecycle.getSnapshot().compilation, undefined);
  assert.equal(lifecycle.getSnapshot().phase, "closing");
  released(old);
  await check;
  await transports[0].exited;
  const count = calls.length;
  await lifecycle.open(source);
  assert.equal(calls.length, count);
  const done = phase(lifecycle, "failed");
  close.resolve(ok(null));
  await done;
  assert.match(
    lifecycle.getSnapshot().message,
    /工作区显示失败：A original workspace render failure/,
  );
  bridge.closeDesign = async (id) => {
    calls.push("close:" + id);
    return ok(null);
  };
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  assert.notEqual(lifecycle.getSnapshot().active.id, old.id);
});

for (const choose of [false, true]) {
  test(`workspace failure while picker is pending serializes cleanup; replacement=${choose}`, async (t) => {
    const { lifecycle, bridge, calls, transports } = await setup(t);
    await lifecycle.open(source);
    const old = lifecycle.getSnapshot().active,
      pick = deferred(),
      close = deferred();
    let selecting = true;
    bridge.pickDesign = async () => {
      try {
        return await pick.promise;
      } finally {
        selecting = false;
      }
    };
    const entered = deferred();
    bridge.closeDesign = async (id) => {
      assert.equal(selecting, false, "no concurrent close during native picker");
      calls.push("close:" + id);
      entered.resolve();
      return close.promise;
    };
    const opening = lifecycle.open(source);
    lifecycle.workspaceFailed(old.id, failure());
    released(old);
    await transports[0].exited;
    assert.equal(lifecycle.getSnapshot().phase, "picking");
    assert.equal(lifecycle.getSnapshot().active, undefined);
    assert.deepEqual(
      calls.filter((x) => x.startsWith("close:")),
      [],
    );
    pick.resolve(ok(choose ? { token: "A-original-choice", label: "design.sv" } : null));
    await entered.promise;
    assert.equal(lifecycle.getSnapshot().phase, "closing");
    assert.deepEqual(
      calls.filter((x) => x.startsWith("open:")),
      ["open:1"],
    );
    close.resolve(ok(null));
    await opening;
    const state = lifecycle.getSnapshot();
    assert.equal(state.phase, choose ? "ready" : "failed");
    assert.match(
      choose ? state.operationMessage : state.message,
      /A original workspace render failure/,
    );
    assert.deepEqual(
      calls.filter((x) => x.startsWith("close:")),
      ["close:1"],
    );
    assert.deepEqual(
      calls.filter((x) => x.startsWith("open:")),
      choose ? ["open:1", "open:2"] : ["open:1"],
    );
  });
}

test("local and remote cleanup causes survive the original render error and block this replacement", async (t) => {
  const { lifecycle, bridge, calls, transports } = await setup(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active,
    dispose = old.panels.dispose.bind(old.panels),
    pick = deferred();
  old.panels.dispose = () => {
    dispose();
    throw new AggregateError([new Error("A Worker cleanup leaf")], "A local cleanup");
  };
  bridge.closeDesign = async (id) => {
    calls.push("close:" + id);
    throw new Error("A main cleanup");
  };
  bridge.pickDesign = () => pick.promise;
  const opening = lifecycle.open(source);
  lifecycle.workspaceFailed(old.id, failure());
  pick.resolve(ok({ token: "A-original-choice", label: "design.sv" }));
  await opening;
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  for (const cause of [
    "A original workspace render failure",
    "A local cleanup",
    "A Worker cleanup leaf",
    "A main cleanup",
  ])
    assert(lifecycle.getSnapshot().message.includes(cause));
  released(old);
  await transports[0].exited;
  assert.deepEqual(
    calls.filter((x) => x.startsWith("open:")),
    ["open:1"],
  );
  bridge.pickDesign = async () => ok({ token: "A-original-choice", label: "design.sv" });
  bridge.closeDesign = async () => ok(null);
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
});

test("stale workspace callbacks cannot withdraw the next session or the final document snapshot", async (t) => {
  const { lifecycle, calls, transports } = await setup(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active;
  await lifecycle.open(source);
  const current = lifecycle.getSnapshot(),
    count = calls.length;
  lifecycle.workspaceFailed(old.id, failure());
  assert.equal(lifecycle.getSnapshot(), current);
  assert.equal(calls.length, count);
  assert.equal(current.active.panels.selection.disposed, false);
  await transports[0].exited;
  lifecycle.releaseDocument();
  const final = lifecycle.getSnapshot();
  lifecycle.workspaceFailed(current.active.id, failure());
  assert.equal(lifecycle.getSnapshot(), final);
  assert.equal(calls.length, count);
});

test("workspace failure in ready publication is drained once by that opening turn without root loading", async (t) => {
  const { lifecycle, calls, transports, sent } = await setup(t);
  let old;
  lifecycle.subscribe(() => {
    const active = lifecycle.getSnapshot().active;
    if (active && !old) {
      old = active;
      lifecycle.workspaceFailed(old.id, failure());
    }
  });
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  released(old);
  assert.deepEqual(
    calls.filter((x) => x.startsWith("close:")),
    ["close:1"],
  );
  assert.equal(sent.filter((x) => x.method === "inst.roots").length, 0);
  await transports[0].exited;
});

test("an unformattable thrown value still cleans up and retains both original diagnostic identities", async (t) => {
  const { lifecycle, transports } = await setup(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active;
  const formatting = new Error("A diagnostic getter failure"),
    thrown = Object.create(null);
  Object.defineProperty(thrown, "message", {
    get() {
      throw formatting;
    },
  });
  const logged = [],
    original = console.error;
  console.error = (...args) => logged.push(args);
  t.after(() => {
    console.error = original;
  });
  const done = phase(lifecycle, "failed");
  lifecycle.workspaceFailed(old.id, thrown);
  await done;
  assert.match(lifecycle.getSnapshot().message, /无法读取原始显示错误/);
  released(old);
  assert(
    logged.some((args) =>
      args.some(
        (error) =>
          error instanceof AggregateError &&
          error.errors[0] === thrown &&
          error.errors[1] === formatting,
      ),
    ),
  );
  await transports[0].exited;
});

test("a diagnostic getter that releases the document cannot revive cleanup or issue a remote operation", async (t) => {
  const { lifecycle, calls, transports } = await setup(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active,
    count = calls.length;
  const thrown = {
    get message() {
      lifecycle.releaseDocument();
      return "A released in diagnostic";
    },
  };
  lifecycle.workspaceFailed(old.id, thrown);
  assert.equal(lifecycle.getSnapshot().active, undefined);
  released(old);
  assert.equal(calls.length, count);
  await transports[0].exited;
});
