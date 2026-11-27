import test from "node:test";
import assert from "node:assert/strict";
import { classify, quiet, mirror, observe } from "./global-channels.mjs";
const permits = (value, n = 1) =>
  Array.from({ length: n }, (_, index) => ({ value, index }));
test("C98 no events is a zero-error positive control, not Q1 proof", () => {
  const r = classify([], [], []);
  quiet(r);
  mirror(r, []);
});
test("C98 exact actual boundary object can classify React development reports", () => {
  const error = new AggregateError([{}, Symbol()], "original boundary");
  const r = classify([error, error], [], permits(error, 2));
  quiet(r);
  mirror(
    r,
    Array.from({ length: 2 }, () => ({
      name: error.name,
      message: error.message,
    })),
  );
  assert.equal(r.boundaryEvents.length, 2);
});
test("C98 native global throw is rejected", () => {
  assert.throws(() => quiet(classify([new Error("leak")], [], [])));
});
test("C98 pinned pageerror empty-message formatting retains exact native boundary identity", () => {
  const e = new AggregateError([]),
    r = classify([e], [], permits(e));
  mirror(r, [{ name: "", message: "AggregateError" }]);
  assert.throws(() =>
    mirror(classify([new AggregateError([])], [], permits(e)), [
      { name: "", message: "AggregateError" },
    ]),
  );
});
test("C98 same name/message AggregateError is not original boundary identity", () => {
  const original = new AggregateError([], "same");
  assert.throws(() =>
    quiet(classify([new AggregateError([], "same")], [], permits(original))),
  );
});
test("C98 caught original E is not permission to accept wrapper aggregate", () => {
  const e = new AggregateError([], "E");
  assert.throws(() =>
    quiet(classify([new AggregateError([e])], [], permits(e))),
  );
});
test("C98 native rejection is rejected with original Promise left untouched", () => {
  const p = {},
    reason = new Error("rejection");
  const raw = [{ promise: p, reason }];
  assert.throws(() => quiet(classify([], raw, [])));
  assert.equal(raw[0].promise, p);
  assert.equal(raw[0].reason, reason);
});
test("C98 pageerror without matching native boundary event is rejected", () => {
  assert.throws(() =>
    mirror(classify([], [], []), [{ name: "Error", message: "rogue" }]),
  );
});
test("C98 missing expected boundary pageerror is rejected", () => {
  const e = new Error("expected");
  assert.throws(() => mirror(classify([e], [], permits(e)), []));
});
test("C98 altered name or message pageerror is rejected", () => {
  const e = new Error("expected"),
    r = classify([e], [], permits(e));
  for (const p of [
    { name: "AggregateError", message: e.message },
    { name: e.name, message: "other" },
  ])
    assert.throws(() => mirror(r, [p]));
});
test("C98 records original native values; no preventDefault and listeners released", () => {
  const handlers = new Map(),
    host = {
      addEventListener(type, f) {
        assert(!handlers.has(type));
        handlers.set(type, f);
      },
      removeEventListener(type, f) {
        assert.equal(handlers.get(type), f);
        handlers.delete(type);
      },
    },
    o = observe(host),
    e = new AggregateError([], "raw"),
    promise = {};
  const preventDefault = () => assert.fail("must not suppress native events");
  handlers.get("error")({ error: e, preventDefault });
  handlers.get("unhandledrejection")({ reason: e, promise, preventDefault });
  assert.equal(o.errors[0], e);
  assert.equal(o.rejections[0].reason, e);
  assert.equal(o.rejections[0].promise, promise);
  assert.throws(() => o.assertQuiet());
  o.dispose();
  o.dispose();
  assert.equal(handlers.size, 0);
});

test("C98 later SAME original wrapper after actual boundary snapshot is rejected", () => {
  const handlers = new Map(),
    o = observe({
      addEventListener(t, f) {
        handlers.set(t, f);
      },
      removeEventListener(t) {
        handlers.delete(t);
      },
    }),
    e = new AggregateError([]);
  handlers.get("error")({ error: e });
  o.captureBoundary(e);
  o.allowBoundary(e);
  o.assertQuiet();
  handlers.get("error")({ error: e });
  assert.equal(o.result().boundaryEvents.length, 1);
  assert.equal(o.result().globalErrors.length, 1);
  assert.throws(() => o.assertQuiet());
  o.dispose();
});
test("C98 identity without actual boundary snapshot never grants a permit", () => {
  const o = observe({ addEventListener() {}, removeEventListener() {} });
  assert.throws(() => o.allowBoundary(new AggregateError([])));
  o.dispose();
});
