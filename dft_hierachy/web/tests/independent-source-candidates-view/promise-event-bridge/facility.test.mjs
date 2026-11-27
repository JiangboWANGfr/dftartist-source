import test from "node:test";
import assert from "node:assert/strict";
import { cases, shape, wireCursor } from "./cases.mjs";
import { observeReturn } from "./tap.mjs";
test("B48 Transport cursor is SDK-normalized: first page empty, continuation exact original", () => {
  assert.equal(wireCursor("reloadCandidates", "original next 中文"), "");
  assert.equal(
    wireCursor("loadMore", "original next 中文"),
    "original next 中文",
  );
  assert.throws(() => wireCursor("unknown", "x"));
});
test("B48 seven known consumer shapes, pending only, no UI inventory addition", () => {
  assert.equal(cases.length, 7);
  assert.equal(new Set(cases.map((c) => c.id)).size, 7);
  assert.deepEqual(
    cases.map((c) => c.command),
    [
      "loadMore",
      "reloadCandidates",
      "loadMore",
      "reloadCandidates",
      "loadMore",
      "loadMore",
      "loadMore",
    ],
  );
  assert.deepEqual(
    shape({ newReactions: 1, dual: 0, single: 0, empty: 1 }),
    [1, 0, 0, 1],
  );
});
test("B48 original receiver, args, return identity and no then/constructor access", () => {
  let calls = 0,
    touched = 0;
  const value = {
      get then() {
        touched++;
        throw Error("observer accessed then");
      },
      get constructor() {
        touched++;
        throw Error("observer accessed constructor");
      },
    },
    a = {},
    b = {};
  const proto = {
      command(...args) {
        calls++;
        assert.equal(this, target);
        assert.deepEqual(args, [a, b]);
        return value;
      },
    },
    target = Object.create(proto);
  const t = observeReturn(target, "command", (r) => {
    assert.equal(calls, 1);
    assert.equal(r.receiver, target);
    assert.equal(r.value, value);
  });
  assert.equal(target.command(a, b), value);
  assert.equal(calls, 1);
  assert.equal(touched, 0);
  t.restore();
  assert(!Object.hasOwn(target, "command"));
  assert.equal(target.command, proto.command);
});
test("B48 arbitrary original synchronous throw is not transformed or checkpointed", () => {
  const error = Object.freeze({ raw: 1 });
  let checkpoints = 0;
  const target = {
      command() {
        throw error;
      },
    },
    desc = Object.getOwnPropertyDescriptor(target, "command");
  const t = observeReturn(target, "command", () => checkpoints++);
  assert.throws(
    () => target.command(),
    (e) => e === error,
  );
  assert.equal(checkpoints, 0);
  assert.equal(t.records[0].error, error);
  t.restore();
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "command"), desc);
});
test("B48 borrowed receiver stays borrowed and each invocation is exactly once", () => {
  const other = {},
    seen = [];
  const target = {
      command(...args) {
        seen.push([this, args]);
        return other;
      },
    },
    t = observeReturn(target, "command", () => {});
  assert.equal(target.command.call(other, 3), other);
  assert.equal(seen.length, 1);
  assert.equal(t.records[0].receiver, other);
  assert.deepEqual(seen[0], [other, [3]]);
  t.restore();
});
test("B48 restore failure is observable, not silently discarded", () => {
  const target = Object.create({ command() {} }),
    t = observeReturn(target, "command", () => {});
  Object.defineProperty(target, "command", { configurable: false });
  assert.throws(() => t.restore());
});
