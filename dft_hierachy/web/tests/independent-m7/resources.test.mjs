// Independent DESIGN 5.6.5 expectations. No private resource watcher imports.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(root, "explicit fixed product required");
const { createProcessTransport } = await import(
  pathToFileURL(path.join(root, "web/packages/client/dist/node/index.js"))
);
const fixture = fileURLToPath(new URL("./producer.mjs", import.meta.url));
const guard = { timeout: 10000 };
const frame = (id) => ({
  id,
  method: "inst.children",
  snapshot: "B-M7",
  params: { inst: "b", hold: true },
});
const cancel = (target) => ({ method: "cancel", params: { target } });
function setup(t, limits, mode = "normal", timers = true) {
  if (timers) t.mock.timers.enable({ apis: ["setTimeout"] });
  const transport = createProcessTransport({
    command: process.execPath,
    args: [fixture, mode],
    shutdownGraceMillis: 0,
    ...(limits === undefined ? {} : { resourceLimits: limits }),
  });
  transport.exited.catch(() => {});
  const all = [],
    waiters = [];
  transport.onMessage((value) => {
    all.push(value);
    for (const w of [...waiters])
      if (w.p(value)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.r(value);
      }
  });
  const next = (p) => {
    const value = all.find(p);
    return value
      ? Promise.resolve(value)
      : new Promise((r) => waiters.push({ p, r }));
  };
  const closed = new Promise((resolve) => transport.onClose(resolve));
  t.after(async () => {
    transport.close();
    await transport.exited.catch(() => {});
  });
  return { transport, next, closed, all };
}
function resourceError(error, reason, key, value) {
  assert.equal(error.code, "transport_closed");
  assert.equal(error.origin, "transport");
  assert.equal(error.data.reason, reason);
  if (key) assert.equal(error.data[key], value);
  if (reason === "open_timeout" || reason === "cancel_timeout") {
    assert.ok(Number.isFinite(error.data.observedMillis));
    assert.ok(error.data.observedMillis >= 0);
  }
}
test("B-M7 R01 invalid limits fail before spawn", guard, async (t) => {
  for (const [field, bad] of [
    ["openTimeoutMillis", [0, -1, 1.1, Infinity, NaN, 2147483648, "1", null]],
    ["cancelTimeoutMillis", [0, -1, 1.1, Infinity, NaN, 2147483648, "1", null]],
    [
      "maxRssBytes",
      [0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1", null],
    ],
  ])
    for (const value of bad) {
      let result, error;
      try {
        result = createProcessTransport({
          command: process.execPath,
          args: [fixture, "no-hello"],
          resourceLimits: { [field]: value },
        });
      } catch (e) {
        error = e;
      }
      if (result) {
        result.close();
        await result.exited.catch(() => {});
      }
      assert.ok(
        error,
        field + " must reject " + String(value) + " before spawn",
      );
    }
});
for (const limits of [undefined, {}])
  test(
    "B-M7 R02 no limits remain unlimited " + JSON.stringify(limits),
    guard,
    async (t) => {
      const s = setup(t, limits, "no-hello");
      await s.next((x) => x.event === "b-started");
      t.mock.timers.tick(30001);
      let closed = false;
      s.closed.then(() => {
        closed = true;
      });
      await new Promise(setImmediate);
      assert.equal(closed, false);
      s.transport.close();
      await s.transport.exited;
    },
  );
test("B-M7 R03 missing hello expires and reaps", guard, async (t) => {
  const s = setup(t, { openTimeoutMillis: 10 }, "no-hello");
  await s.next((x) => x.event === "b-started");
  t.mock.timers.tick(10);
  resourceError(await s.closed, "open_timeout", "limitMillis", 10);
  assert.equal((await s.transport.exited).signal, "SIGKILL");
});
test("B-M7 R04 valid hello disarms opening deadline", guard, async (t) => {
  const s = setup(t, { openTimeoutMillis: 10 });
  await s.next((x) => x.event === "hello");
  t.mock.timers.tick(11);
  s.transport.send({ ...frame(7), params: {} });
  assert.equal((await s.next((x) => x.id === 7)).ok, true);
});
for (const variant of ["plain", "repeat", "event"])
  test(
    "B-M7 R05/R06/R07 cancellation deadline " + variant,
    guard,
    async (t) => {
      const s = setup(t, { cancelTimeoutMillis: 10 });
      await s.next((x) => x.event === "hello");
      s.transport.send(frame(8));
      await s.next((x) => x.event === "b-held");
      s.transport.send(cancel(8));
      await s.next((x) => x.event === "b-cancel-seen");
      if (variant === "repeat") {
        t.mock.timers.tick(9);
        s.transport.send(cancel(8));
        t.mock.timers.tick(1);
      } else t.mock.timers.tick(10);
      resourceError(await s.closed, "cancel_timeout", "requestId", 8);
      assert.equal((await s.transport.exited).signal, "SIGKILL");
      assert.throws(
        () => s.transport.send(frame(9)),
        (error) => {
          resourceError(error, "cancel_timeout", "requestId", 8);
          return true;
        },
      );
    },
  );
test(
  "B-M7 R08 unknown and completed target do not start deadlines",
  guard,
  async (t) => {
    const s = setup(t, { cancelTimeoutMillis: 10 });
    await s.next((x) => x.event === "hello");
    s.transport.send({ ...frame(3), params: {} });
    await s.next((x) => x.id === 3 && x.ok);
    s.transport.send(cancel(3));
    s.transport.send(cancel(999));
    t.mock.timers.tick(11);
    s.transport.send({ ...frame(4), params: {} });
    assert.equal((await s.next((x) => x.id === 4)).ok, true);
  },
);
test(
  "B-M7 R09 legal terminal reply stops cancellation deadline",
  guard,
  async (t) => {
    const s = setup(t, { cancelTimeoutMillis: 10 }, "terminal-cancel");
    await s.next((x) => x.event === "hello");
    s.transport.send(frame(5));
    await s.next((x) => x.event === "b-held");
    s.transport.send(cancel(5));
    assert.equal(
      (await s.next((x) => x.id === 5 && x.ok === false)).error.code,
      "cancelled",
    );
    t.mock.timers.tick(11);
    s.transport.send({ ...frame(6), params: {} });
    assert.equal((await s.next((x) => x.id === 6)).ok, true);
  },
);
test("B-M7 R10 resource object copied at call", guard, async (t) => {
  const limits = { openTimeoutMillis: 10 };
  const s = setup(t, limits, "no-hello");
  limits.openTimeoutMillis = 1000;
  await s.next((x) => x.event === "b-started");
  t.mock.timers.tick(10);
  resourceError(await s.closed, "open_timeout", "limitMillis", 10);
  await s.transport.exited;
});
test(
  "B-M7 R11 actual RSS exceeded closes and removes owned PID",
  guard,
  async (t) => {
    const s = setup(t, { maxRssBytes: 1 }, "normal", false);
    const error = await s.closed;
    resourceError(error, "memory_limit", "limitBytes", 1);
    assert.ok(error.data.observedBytes > 1);
    assert.equal((await s.transport.exited).signal, "SIGKILL");
    // A 1-byte RSS limit may kill before the fixture executes its first JS line.
    const started = s.all.find((x) => x.event === "b-started");
    if (started)
      assert.throws(() => process.kill(started.pid, 0), { code: "ESRCH" });
  },
);
