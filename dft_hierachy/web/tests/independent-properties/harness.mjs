// Agent B: real SDK + unchanged B public Transport; no replacement model or scheduler.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? ".");
const uri = (p) => pathToFileURL(path.join(product, p)).href;
export const clientModule = await import(
  uri("web/packages/client/dist/index.js")
);
export const vm = await import(uri("web/packages/viewmodel/dist/index.js"));
export const { HierClient, HierError } = clientModule;
const fixture = path.join(product, "web/tests/independent-tree/harness.mjs");
const sha = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
assert.equal(
  sha(fixture),
  sha(new URL("../independent-tree/harness.mjs", import.meta.url)),
  "original B public wire fixture",
);
const old = await import(pathToFileURL(fixture).href);
export const complete = { status: "complete", reasons: [] };
// Observe the error from THIS constructor's getter call, not a different SDK read.
export function snapshotProbe(client) {
  const own = Object.getOwnPropertyDescriptor(client, "snapshot");
  let holder = client,
    descriptor = own;
  while (!descriptor && (holder = Object.getPrototypeOf(holder)))
    descriptor = Object.getOwnPropertyDescriptor(holder, "snapshot");
  assert.equal(typeof descriptor?.get, "function");
  const errors = [];
  Object.defineProperty(client, "snapshot", {
    configurable: true,
    enumerable: own?.enumerable ?? false,
    get() {
      try {
        return Reflect.apply(descriptor.get, this, []);
      } catch (error) {
        errors.push(error);
        throw error;
      }
    },
  });
  return {
    errors,
    restore() {
      if (own) Object.defineProperty(client, "snapshot", own);
      else Reflect.deleteProperty(client, "snapshot");
    },
  };
}
export const activeContexts = new Set();
export async function releaseAll() {
  const errors = [];
  for (const c of [...activeContexts])
    try {
      await c.close();
    } catch (e) {
      errors.push(e);
    }
  if (errors.length) throw new AggregateError(errors, "B context cleanup");
}
export const info = (ref = "B-ip-A", width = 4) => ({
  ...old.info(ref, "node.尾", ["top", "node.尾"]),
  B_extension: { width },
});
export function ports(width = 4) {
  const p = {
    ref: "B-ip-port",
    name: "same",
    direction: "in",
    kind: "port",
    internal: { kind: "unresolved", reason: "unknown_pin_width" },
    type: "logic",
    width,
    signed: false,
    dims: [{ left: width - 1, right: 0, packed: true }],
    members: [],
    B_extension: { kept: [1, "原文"] },
  };
  return [
    p,
    { ...p, ref: "B-ip-port-2", direction: "out" },
    {
      ref: "B-ip-interface",
      name: "bus",
      direction: "unknown",
      kind: "interface",
      internal: { kind: "unresolved", reason: "interface_port" },
      interfaceDef: "B_bus",
      modport: "slave",
    },
    {
      ...p,
      ref: "B-ip-multi",
      kind: "multi",
      name: "bundle",
      width: 0,
      dims: [],
      internal: { kind: "unresolved", reason: "complex_port" },
    },
  ];
}
export const params = () => [
  {
    name: "W",
    value: "32'sd4",
    type: "int",
    isType: false,
    isLocal: false,
    isPort: true,
    isOverridden: true,
  },
  {
    name: "L",
    value: "64'hffff_ffff_ffff_ffff",
    type: "logic[63:0]",
    isType: false,
    isLocal: true,
    isPort: false,
    isOverridden: false,
  },
  {
    name: "T",
    value: "logic [3:0]",
    isType: true,
    isLocal: false,
    isPort: true,
    isOverridden: false,
    B_extension: "type-no-type-field",
  },
];
export const tick = () => new Promise((resolve) => setImmediate(resolve));
export function deep(value) {
  const seen = new Set(),
    todo = [value];
  while (todo.length) {
    const v = todo.pop();
    if (v === null || !["object", "function"].includes(typeof v) || seen.has(v))
      continue;
    seen.add(v);
    assert.equal(Object.isFrozen(v), true);
    for (const key of Object.keys(v)) todo.push(v[key]);
  }
}
export function observe(p) {
  const o = { promise: p, done: false, count: 0 };
  o.settled = p.then(
    (value) => {
      o.done = true;
      o.count++;
      return { ok: true, value };
    },
    (error) => {
      o.done = true;
      o.count++;
      return { ok: false, error };
    },
  );
  return o;
}
export function invoke(c, name, ...args) {
  let p;
  assert.doesNotThrow(() => {
    p = c.m[name](...args);
  }, name + " must reject asynchronously");
  assert.ok(
    p && typeof p.then === "function" && typeof p.catch === "function",
    name + " Promise required",
  );
  const o = observe(p);
  c.commands.push(o);
  return o;
}
export async function success(o) {
  const r = await o.settled;
  assert.equal(r.ok, true);
  assert.equal(r.value, undefined);
  assert.equal(o.count, 1);
}
export async function failure(o, code, origin) {
  const r = await o.settled;
  assert.equal(r.ok, false);
  if (code) assert.equal(r.error.code, code);
  if (origin) assert.equal(r.error.origin, origin);
  assert.equal(o.count, 1);
  return r.error;
}
export function capability() {
  assert.equal(
    typeof vm.InstancePropertiesModel,
    "function",
    "missing production InstancePropertiesModel",
  );
  assert.equal(
    typeof vm.InstancePropertiesError,
    "function",
    "missing production InstancePropertiesError",
  );
}
export async function context({
  withModel = true,
  ready = true,
  cacheEntries = 0,
  id = "B-properties-snapshot",
} = {}) {
  const wire = new old.ControlledTransport(),
    client = new HierClient(wire, { cacheEntries });
  client.ready.catch(() => {});
  const c = {
    wire,
    client,
    models: [],
    commands: [],
    calls: [],
    restores: [],
    events: [],
    indexRegistrations: 0,
  };
  for (const method of ["instance", "ports", "params", "onIndexReady"]) {
    const descriptor = Object.getOwnPropertyDescriptor(client, method),
      original = client[method];
    Object.defineProperty(client, method, {
      configurable: true,
      writable: true,
      value: function (...args) {
        if (method === "onIndexReady") {
          c.indexRegistrations++;
          return Reflect.apply(original, this, args);
        }
        const call = { method, args };
        c.calls.push(call);
        const p = Reflect.apply(original, this, args);
        call.promise = p;
        p.then(
          (reply) => {
            call.reply = reply;
          },
          (error) => {
            call.error = error;
          },
        );
        return p;
      },
    });
    c.restores.push(() =>
      descriptor
        ? Object.defineProperty(client, method, descriptor)
        : Reflect.deleteProperty(client, method),
    );
  }
  c.snap = old.snapshot([info()], id);
  if (ready) {
    wire.emit({
      event: "hello",
      protocol: 2,
      snapshot: c.snap,
      capabilities: ["cancel", "progress"],
    });
    await client.ready;
  }
  c.newModel = () => {
    capability();
    const m = new vm.InstancePropertiesModel(client);
    c.models.push(m);
    return m;
  };
  let closing;
  c.close = () =>
    (closing ??= (async () => {
      const errors = [];
      for (const m of c.models)
        try {
          m.dispose();
        } catch (e) {
          errors.push(e);
        }
      for (const restore of c.restores)
        try {
          restore();
        } catch (e) {
          errors.push(e);
        }
      try {
        client.dispose();
      } catch (e) {
        errors.push(e);
      }
      for (const waiter of wire.waits) waiter.resolve(undefined);
      wire.waits = [];
      let timer;
      try {
        await Promise.race([
          Promise.all(c.commands.map((o) => o.settled)),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("B cleanup unsettled commands watchdog")),
              3000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
        activeContexts.delete(c);
      }
      assert.equal(wire.messages.size, 0);
      assert.equal(wire.closes.size, 0);
      assert.equal(wire.closed, true);
      activeContexts.delete(c);
      if (errors.length) throw new AggregateError(errors, "B cleanup failures");
    })());
  activeContexts.add(c);
  if (withModel) {
    try {
      c.m = c.newModel();
      c.m.subscribe(() => c.events.push(c.m.state));
    } catch (error) {
      await c.close();
      throw error;
    }
  }
  return c;
}
export async function using(fn, options) {
  const c = await context(options);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
export const local = (error, code) => {
  assert.ok(error instanceof vm.InstancePropertiesError);
  assert.equal(error.code, code);
};
export async function begin(c, target = "B-ip-A") {
  const o = invoke(c, "load", target);
  assert.deepEqual(c.m.state, { status: "pending", target });
  const q = await c.wire.next("inst.get", (q) => q.params.inst === target);
  return { o, q, target };
}
export async function second(c, task, instance = info(task.target)) {
  c.wire.ok(task.q, instance);
  const p = await c.wire.next(
      "inst.ports",
      (q) => q.params.inst === task.target,
    ),
    n = await c.wire.next("inst.params", (q) => q.params.inst === task.target);
  return { ...task, p, n };
}
export async function finish(
  c,
  task,
  { order = "ports", portValues = ports(), paramValues = params() } = {},
) {
  const x = task.p ? task : await second(c, task);
  const before = c.m.state;
  if (order === "ports") c.wire.ok(x.p, portValues);
  else c.wire.ok(x.n, paramValues);
  await tick();
  assert.equal(c.m.state, before, "one reply cannot publish partial data");
  if (order === "ports") c.wire.ok(x.n, paramValues);
  else c.wire.ok(x.p, portValues);
  await success(x.o);
  assert.equal(c.m.state.status, "success");
  return x;
}
export function closeWith(c, error) {
  c.wire.closed = true;
  for (const token of [...c.wire.closes])
    if (c.wire.closes.has(token)) token.handler(error);
}
export function opaque(kind, counts = { probes: 0 }) {
  if (kind === "undefined") return undefined;
  if (kind === "null") return null;
  if (kind === "zero") return 0;
  if (kind === "false") return false;
  if (kind === "empty") return "";
  if (kind === "object") return Object.freeze({ B: "listener marker" });
  const trap = () => {
    counts.probes++;
    throw Error("B unknown value must not be inspected");
  };
  return new Proxy(Object.create(null), {
    get: trap,
    ownKeys: trap,
    getOwnPropertyDescriptor: trap,
    getPrototypeOf: trap,
  });
}
