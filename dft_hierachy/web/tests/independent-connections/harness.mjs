// B: reuse the accepted SDK/Transport/rollback scope, never a substitute model.
import assert from "node:assert/strict";
import * as old from "../independent-properties/harness.mjs";
export const {
  product,
  vm,
  HierClient,
  HierError,
  complete,
  tick,
  deep,
  invoke,
  success,
  failure,
  snapshotProbe,
  opaque,
  closeWith,
  releaseAll,
} = old;
export const target = (ref = "B-conn-signal", extra = {}) => ({
  slice: { ref },
  reach: "local",
  ...extra,
});
export const object = (ref = "B-conn-signal", kind = "signal") => ({
  ref,
  kind,
  name: "总线.尾",
  inst: "B-owner",
  pathText: "\\top .\\总线.尾 ",
  B_extra: { text: "原文" },
});
export const partial = (code = "indexing") => ({
  status: "partial",
  reasons: [{ code, B_extra: "保留" }],
});
export const endpoints = () => [
  {
    kind: "process",
    queried: { lsb: 1, width: 2 },
    ref: "B-process",
    inst: "B-owner",
    bits: { lsb: 5, width: 2 },
    at: { ref: "B-signal-at", bits: { lsb: 5, width: 2 } },
    via: [
      {
        kind: "boundary",
        from: { ref: "B-boundary-from", bits: { lsb: 1, width: 2 } },
        via: "B-boundary-port",
        map: [{ from: 0, to: 0, width: 2 }],
        next: [],
      },
    ],
    source: {
      file: "B-file",
      path: "/B/原文.sv",
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 2, line: 1, column: 3 },
      contentHash: "0123456789abcdef".repeat(4),
    },
    B_extra: { order: 1 },
  },
  {
    kind: "const",
    queried: { lsb: 3, width: 4 },
    value: "4'b10xz",
    via: [],
    B_extra: { order: 2 },
  },
  {
    kind: "blackbox_pin",
    queried: { lsb: 0, width: 0 },
    ref: "B-pin",
    inst: "B-blackbox",
    bits: { lsb: 0, width: 0 },
    via: [],
  },
  {
    kind: "unresolved",
    queried: { lsb: 0, width: 0 },
    reason: "interface_port",
    via: [],
  },
  { kind: "unconnected", queried: { lsb: 0, width: 1 }, via: [] },
];
export function capability() {
  assert.equal(
    typeof vm.ObjectConnectionsModel,
    "function",
    "missing production ObjectConnectionsModel",
  );
  assert.equal(
    typeof vm.ObjectConnectionsError,
    "function",
    "missing production ObjectConnectionsError",
  );
}
export async function context({ withModel = true, ...options } = {}) {
  const c = await old.context({ ...options, withModel: false });
  try {
    for (const method of ["object", "drivers", "loads"]) {
      const desc = Object.getOwnPropertyDescriptor(c.client, method),
        original = c.client[method];
      Object.defineProperty(c.client, method, {
        configurable: true,
        writable: true,
        value: function (...args) {
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
        desc
          ? Object.defineProperty(c.client, method, desc)
          : Reflect.deleteProperty(c.client, method),
      );
    }
    c.newModel = () => {
      capability();
      const m = new vm.ObjectConnectionsModel(c.client);
      c.models.push(m);
      return m;
    };
    if (withModel) {
      c.m = c.newModel();
      c.m.subscribe(() => c.events.push(c.m.state));
    }
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
export async function using(fn, options) {
  const c = await context(options);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
export async function begin(c, t = target()) {
  const o = invoke(c, "load", t),
    s = c.m.state;
  assert.equal(s.status, "pending");
  assert.deepEqual(s.target, t);
  assert.equal("data" in s, false);
  deep(s);
  const q = await c.wire.next("obj.get", (q) => q.params.ref === t.slice.ref);
  assert.equal(c.calls.at(-1).method, "object");
  return { o, q, target: s.target };
}
export async function second(c, x, value = object(x.target.slice.ref)) {
  c.wire.ok(x.q, value);
  const d = await c.wire.next("conn.drivers"),
    l = await c.wire.next("conn.loads");
  const calls = c.calls.slice(-3);
  assert.deepEqual(
    calls.map((x) => x.method),
    ["object", "drivers", "loads"],
  );
  assert.deepEqual(calls[1].args[0], x.target);
  assert.deepEqual(calls[2].args[0], x.target);
  assert.ok(calls[0].args[1] instanceof AbortSignal);
  assert.equal(calls[1].args[1], calls[0].args[1]);
  assert.equal(calls[2].args[1], calls[0].args[1]);
  return { ...x, d, l };
}
export async function finish(
  c,
  x,
  {
    order = "drivers",
    drivers = endpoints(),
    loads = [],
    dc = complete,
    lc = complete,
  } = {},
) {
  x = x.d ? x : await second(c, x);
  const state = c.m.state;
  c.wire.ok(
    order === "drivers" ? x.d : x.l,
    order === "drivers" ? drivers : loads,
    order === "drivers" ? dc : lc,
  );
  await tick();
  assert.equal(c.m.state, state, "one connection reply is not publishable");
  c.wire.ok(
    order === "drivers" ? x.l : x.d,
    order === "drivers" ? loads : drivers,
    order === "drivers" ? lc : dc,
  );
  await success(x.o);
  assert.equal(c.m.state.status, "success");
  assert.equal(c.m.state.target, x.target);
  deep(c.m.state);
  const calls = c.calls.slice(-3),
    data = c.m.state.data;
  for (const method of ["object", "drivers", "loads"])
    assert.equal(
      data[method],
      calls.find((x) => x.method === method).reply,
      "original Reply identity",
    );
  assert.deepEqual(data.drivers.result, drivers);
  assert.deepEqual(data.loads.result, loads);
  assert.deepEqual(data.drivers.completeness, dc);
  assert.deepEqual(data.loads.completeness, lc);
  return x;
}
export const modelError = (error, code) => {
  assert.ok(error instanceof vm.ObjectConnectionsError);
  assert.equal(error.code, code);
  return error;
};
