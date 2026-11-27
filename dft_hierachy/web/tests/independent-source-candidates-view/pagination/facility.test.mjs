import test from "node:test";
import assert from "node:assert/strict";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
import { context, equal } from "./public-model.mjs";
import { observePublicCalls } from "./public-calls.mjs";
import { cases } from "./cases.mjs";
test("B33 inventory: eight independent C95 inputs, nonempty expected/basis", () => {
  assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map((c) => c.id)).size, 8);
  for (const c of cases) assert.ok(c.input && c.expected && c.basis);
});
test("transparent public observer preserves receiver, each original argument and raw return, exactly one call", () => {
  const receiver = {},
    a = {},
    b = Symbol("arg"),
    ret = {},
    calls = [];
  receiver.go = function (...args) {
    calls.push({ receiver: this, args });
    return ret;
  };
  const old = Object.getOwnPropertyDescriptor(receiver, "go"),
    tap = observePublicCalls(receiver, ["go"]);
  try {
    assert.equal(receiver.go(a, b), ret);
    assert.equal(calls.length, 1);
    assert.equal(tap.records.length, 1);
    const r = tap.records[0];
    assert.equal(r.receiver, receiver);
    assert.equal(r.args[0], a);
    assert.equal(r.args[1], b);
    assert.equal(r.value, ret);
    assert.equal(r.status, "returned");
  } finally {
    tap.dispose();
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(receiver, "go"), old);
});
test("observer never reads returned Promise.then or adds consumption; native await remains legal", async () => {
  let probes = 0;
  const p = Promise.resolve(7);
  Object.defineProperty(p, "then", {
    configurable: true,
    get() {
      probes++;
      throw Error("forbidden observer consumption");
    },
  });
  const target = {
      go() {
        return p;
      },
    },
    tap = observePublicCalls(target, ["go"]);
  try {
    assert.equal(target.go(), p);
    assert.equal(tap.records[0].value, p);
    assert.equal(probes, 0);
    assert.equal(await p, 7);
    assert.equal(probes, 0);
  } finally {
    tap.dispose();
  }
});
test("observer rethrows arbitrary original value without enumerating or converting it", () => {
  let probes = 0;
  const boom = () => {
    probes++;
    throw Error("forbidden throw inspection");
  };
  const raw = new Proxy(Object.create(null), {
      get: boom,
      getPrototypeOf: boom,
      ownKeys: boom,
    }),
    target = {
      go() {
        throw raw;
      },
    },
    tap = observePublicCalls(target, ["go"]);
  try {
    assert.throws(
      () => target.go(),
      (e) => e === raw,
    );
    assert.equal(tap.records[0].error, raw);
    assert.equal(tap.records[0].status, "thrown");
    assert.equal(probes, 0);
  } finally {
    tap.dispose();
  }
});
test("inherited method ownership is restored and dispose is idempotent", () => {
  const original = function () {
      return this;
    },
    proto = { go: original },
    target = Object.create(proto),
    tap = observePublicCalls(target, ["go"]);
  assert.equal(target.go(), target);
  assert.equal(Object.hasOwn(target, "go"), true);
  tap.dispose();
  tap.dispose();
  assert.equal(Object.hasOwn(target, "go"), false);
  assert.equal(target.go, original);
});
test("partial installation failure restores already observed methods", () => {
  const target = {
      go() {
        return 1;
      },
    },
    original = Object.getOwnPropertyDescriptor(target, "go");
  assert.throws(() => observePublicCalls(target, ["go", "missing"]), TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "go"), original);
});
test("observer release failure is reported while other method descriptors still restore", () => {
  const target = {
      a() {
        return 1;
      },
      b() {
        return 2;
      },
    },
    originalB = Object.getOwnPropertyDescriptor(target, "b"),
    tap = observePublicCalls(target, ["a", "b"]);
  Object.defineProperty(target, "a", { configurable: false });
  assert.throws(
    () => tap.dispose(),
    (e) => e instanceof AggregateError && e.errors.length === 1,
  );
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "b"), originalB);
});
test("wrong receiver exception is the original method exception, not observer translation", () => {
  const raw = {},
    target = {
      go() {
        if (this !== target) throw raw;
        return 1;
      },
    },
    tap = observePublicCalls(target, ["go"]);
  try {
    assert.throws(
      () => Reflect.apply(target.go, {}, []),
      (e) => e === raw,
    );
    assert.equal(tap.records[0].error, raw);
    assert.equal(target.go(), 1);
  } finally {
    tap.dispose();
  }
});
test("synchronous owner side effect still returns the original unobserved Promise", async () => {
  let live = true;
  const p = Promise.resolve("after owner unmount"),
    target = {
      go() {
        live = false;
        return p;
      },
    },
    tap = observePublicCalls(target, ["go"]);
  try {
    const out = target.go();
    assert.equal(live, false);
    assert.equal(out, p);
    assert.equal(tap.records[0].value, p);
    assert.equal(await out, "after owner unmount");
  } finally {
    tap.dispose();
  }
});
test("raw return identity check rejects a separately derived Promise (facility negative, not UI consumption)", async () => {
  const p = Promise.resolve(1),
    derived = p.then((v) => v),
    target = {
      go() {
        return p;
      },
    },
    tap = observePublicCalls(target, ["go"]);
  try {
    target.go();
    assert.throws(
      () => assert.equal(tap.records[0].value, derived),
      assert.AssertionError,
    );
    assert.equal(await derived, 1);
  } finally {
    tap.dispose();
  }
});
test("real public SDK/Navigation/Selection actions keep original page/index/action and no confirmation queries", async () => {
  const P = process.env.HIER_B_PRODUCT_ROOT;
  assert.ok(P);
  const sdk = await import(publicEntry(P, "@hier/client")),
    vm = await import(publicEntry(P, "@hier/viewmodel")),
    c = await context({ ...sdk, ...vm });
  let tap;
  try {
    const page = await c.head("complete", false),
      state = c.n.state,
      count = c.queries().length;
    tap = observePublicCalls(c.n, [
      "createCandidateAction",
      "confirmCandidate",
    ]);
    const a = c.n.createCandidateAction(page, 0);
    c.n.confirmCandidate(a, c.s);
    const [issued, confirmed] = tap.records;
    assert.equal(issued.args[0], page);
    assert.equal(issued.args[1], 0);
    assert.equal(issued.value, a);
    assert.equal(issued.receiver, c.n);
    assert.equal(confirmed.args[0], a);
    assert.equal(confirmed.args[1], c.s);
    assert.equal(confirmed.receiver, c.n);
    assert.equal(confirmed.value, undefined);
    assert.deepEqual(c.s.current.items, [{ ref: page.result.items[0].ref }]);
    assert.equal(c.s.current.origin, "source");
    equal(c.n.state, state, "observer preserves current Nav state");
    equal(c.queries().length, count, "confirmation no extra request");
  } finally {
    tap?.dispose();
    assert.deepEqual(await c.close(), []);
  }
});
