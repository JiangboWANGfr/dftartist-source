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
const temp = await mkdtemp(path.join(tmpdir(), "hier-a-diagnostic-unit-"));
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

function logged(t) {
  const rows = [],
    original = console.error;
  console.error = (...args) => rows.push(args);
  t.after(() => {
    console.error = original;
  });
  return rows;
}
function retained(rows, raw, cause) {
  assert(
    rows.some((args) =>
      args.some(
        (error) =>
          error instanceof AggregateError && error.errors[0] === raw && error.errors[1] === cause,
      ),
    ),
  );
}
function legacy(error, seen = new Set()) {
  if (error && typeof error === "object" && "message" in error) {
    const message = `${"code" in error ? String(error.code) + ": " : ""}${String(error.message)}`;
    if (seen.has(error)) return message;
    seen.add(error);
    const causes = error instanceof AggregateError ? [...error.errors] : [];
    if ("cause" in error && error.cause !== undefined) causes.push(error.cause);
    return [message, ...causes.map((x) => legacy(x, seen))].join("\n");
  }
  return String(error);
}
function unreadable() {
  const failure = new Error("A message inspection failure"),
    raw = { cause: new Error("A retained readable leaf") };
  Object.defineProperty(raw, "message", {
    get() {
      throw failure;
    },
  });
  return { raw, failure };
}

test("ordinary Error, DTO, aggregate, alias and cycle diagnostics preserve the complete legacy text", () => {
  for (let n = 0; n < 40; n++) {
    const leaf = new Error("leaf " + n),
      dto = { code: "host_failure", message: "cloned " + n, cause: leaf };
    const graph = new AggregateError(
      [dto, new Error("parent", { cause: leaf }), leaf, null, undefined, Symbol("x")],
      "outer " + n,
      { cause: { message: "extra" } },
    );
    if (n % 2) leaf.cause = graph;
    assert.equal(diagnostic(graph), legacy(graph));
  }
});
test("a twenty-thousand-level cause chain remains fully readable without recursive stack growth", () => {
  let root = new Error("A deep final leaf");
  for (let n = 0; n < 20_000; n++) root = new Error("A level " + n, { cause: root });
  const text = diagnostic(root);
  assert.equal(text.split("\n").length, 20_001);
  assert(text.endsWith("A deep final leaf"));
  assert(text.startsWith("A level 19999\n"));
});
test("a wide aggregate preserves every ordered leaf and the final cause without argument spreading limits", () => {
  const leaves = Array.from({ length: 20_000 }, (_, n) => new Error("leaf " + n)),
    root = new AggregateError(leaves, "root", { cause: new Error("after all leaves") });
  const lines = diagnostic(root).split("\n");
  assert.equal(lines.length, 20_002);
  assert.equal(lines[1], "leaf 0");
  assert.equal(lines[20_000], "leaf 19999");
  assert.equal(lines.at(-1), "after all leaves");
});
test("an unreadable message preserves the readable cause and both original inspection identities", (t) => {
  const rows = logged(t),
    { raw, failure } = unreadable();
  const text = diagnostic(raw);
  assert.match(text, /无法读取原始显示错误/);
  assert.match(text, /A retained readable leaf/);
  retained(rows, raw, failure);
});
test("an unreadable code or cause does not erase the available message and other aggregate leaves", (t) => {
  const rows = logged(t),
    codeFailure = new Error("A code getter failure"),
    causeFailure = new Error("A cause getter failure");
  const root = new AggregateError([new Error("A available aggregate leaf")], "A available message");
  Object.defineProperty(root, "code", {
    get() {
      throw codeFailure;
    },
  });
  Object.defineProperty(root, "cause", {
    get() {
      throw causeFailure;
    },
  });
  const text = diagnostic(root);
  assert.match(text, /A available message/);
  assert.match(text, /A available aggregate leaf/);
  assert.match(text, /详细原因已记录/);
  retained(rows, root, codeFailure);
  retained(rows, root, causeFailure);
});
test("revoked proxies and hostile string conversion remain diagnostic values instead of secondary exceptions", (t) => {
  const rows = logged(t),
    conversion = new Error("A conversion failed"),
    raw = {
      [Symbol.toPrimitive]() {
        throw conversion;
      },
    },
    revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [raw, revoked.proxy, Object.create(null)])
    assert.match(diagnostic(value), /无法读取原始显示错误/);
  retained(rows, raw, conversion);
  assert.equal(diagnostic(Symbol("plain")), "Symbol(plain)");
});
test("an unreadable aggregate errors list still displays its normal message and explicit cause", (t) => {
  const rows = logged(t),
    failure = new Error("A aggregate list failed"),
    raw = new AggregateError([], "A list root", { cause: new Error("A last cause") });
  Object.defineProperty(raw, "errors", {
    get() {
      throw failure;
    },
  });
  const text = diagnostic(raw);
  assert.match(text, /A list root/);
  assert.match(text, /A last cause/);
  assert.match(text, /详细原因已记录/);
  retained(rows, raw, failure);
});
test("diagnostic fields are read once so a stateful cause getter cannot silently substitute another leaf", () => {
  const count = { code: 0, message: 0, cause: 0, errors: 0 },
    root = new AggregateError([], "unused");
  Object.defineProperties(root, {
    code: {
      get() {
        count.code++;
        return "host_failure";
      },
    },
    message: {
      get() {
        count.message++;
        return "A read once";
      },
    },
    cause: {
      get() {
        count.cause++;
        return new Error(count.cause === 1 ? "A first cause" : "A substituted cause");
      },
    },
    errors: {
      get() {
        count.errors++;
        return [new Error("A aggregate leaf")];
      },
    },
  });
  assert.equal(diagnostic(root), "host_failure: A read once\nA aggregate leaf\nA first cause");
  assert.deepEqual(count, { code: 1, message: 1, cause: 1, errors: 1 });
});
test("real Core cleanup with an unreadable disposal error settles failed and allows one explicit fresh open", async (t) => {
  const { lifecycle, calls, transports } = await setup(t);
  logged(t);
  await lifecycle.open(source);
  const old = lifecycle.getSnapshot().active,
    dispose = old.panels.dispose.bind(old.panels),
    { raw } = unreadable();
  old.panels.dispose = () => {
    dispose();
    throw raw;
  };
  await assert.doesNotReject(lifecycle.close(false));
  await transports[0].exited;
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.match(lifecycle.getSnapshot().message, /A retained readable leaf/);
  assert(old.panels.selection.disposed);
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  assert.notEqual(lifecycle.getSnapshot().active.id, old.id);
  assert.deepEqual(
    calls.filter((x) => x.startsWith("close:")),
    ["close:1"],
  );
  await lifecycle.close(false);
  await transports[1].exited;
  assert.equal(lifecycle.getSnapshot().phase, "idle");
});
test("a report message getter that closes its workspace cannot publish an obsolete operation notice afterward", async (t) => {
  const { lifecycle, transports } = await setup(t);
  await lifecycle.open(source);
  const owner = lifecycle.getSnapshot().active;
  let closing;
  owner.panels.onCommandError({
    error: {
      get message() {
        closing = lifecycle.close(false);
        return "A obsolete report";
      },
    },
  });
  await closing;
  await transports[0].exited;
  assert.equal(lifecycle.getSnapshot().phase, "idle");
  assert.equal(lifecycle.getSnapshot().operationMessage, undefined);
});
test("a native picker entry rejection with unreadable fields keeps the old workspace readable and retryable", async (t) => {
  const { lifecycle, bridge, transports } = await setup(t);
  logged(t);
  await lifecycle.open(source);
  const owner = lifecycle.getSnapshot().active,
    { raw } = unreadable();
  bridge.pickDesign = async () => {
    throw raw;
  };
  await assert.doesNotReject(lifecycle.open(source));
  assert.equal(lifecycle.getSnapshot().phase, "failed");
  assert.equal(lifecycle.getSnapshot().active, owner);
  assert.equal(owner.panels.selection.disposed, false);
  assert.match(lifecycle.getSnapshot().message, /A retained readable leaf/);
  await lifecycle.close(false);
  await transports[0].exited;
  assert.equal(lifecycle.getSnapshot().phase, "idle");
});
test("a cleanup diagnostic getter starting a new picker cannot overwrite that newer operation phase", async (t) => {
  const { lifecycle, bridge, transports } = await setup(t);
  await lifecycle.open(source);
  const owner = lifecycle.getSnapshot().active,
    dispose = owner.panels.dispose.bind(owner.panels),
    pick = bridge.pickDesign,
    gate = deferred();
  let retry;
  bridge.pickDesign = () => gate.promise;
  owner.panels.dispose = () => {
    dispose();
    throw {
      get message() {
        retry = lifecycle.open(source);
        return "A obsolete close diagnostic";
      },
    };
  };
  await lifecycle.close(false);
  await transports[0].exited;
  assert(retry);
  assert.equal(lifecycle.getSnapshot().phase, "picking");
  assert.equal(lifecycle.getSnapshot().message, "选择中");
  gate.resolve(ok(null));
  await retry;
  assert.equal(lifecycle.getSnapshot().phase, "cancelled");
  bridge.pickDesign = pick;
  await lifecycle.open(source);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
});
test("a partial aggregate iterator failure retains the already-readable leaves and explicit cause", (t) => {
  const rows = logged(t),
    marker = new Error("A iterator failure"),
    root = new AggregateError([], "A partial list", { cause: new Error("A explicit final cause") });
  Object.defineProperty(root, "errors", {
    value: {
      *[Symbol.iterator]() {
        yield new Error("A yielded leaf");
        throw marker;
      },
    },
  });
  const text = diagnostic(root);
  assert.match(text, /A yielded leaf/);
  assert.match(text, /A explicit final cause/);
  assert.match(text, /详细原因已记录/);
  retained(rows, root, marker);
});
