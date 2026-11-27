import assert from "node:assert/strict";
import test from "node:test";
import { describeFailure } from "./resource-cleanup.mjs";

function poisonous(kind, hooks) {
  if (kind === "bigint") return 1n;
  if (kind === "cycle") {
    const value = {};
    value.self = value;
    return value;
  }
  return {
    toJSON() {
      hooks.calls++;
      throw new Error("B C80 forbidden toJSON");
    },
    toString() {
      hooks.calls++;
      throw new Error("B C80 forbidden toString");
    },
  };
}
for (const container of ["getter", "proxy"])
  for (const field of ["message", "stack"])
    for (const kind of ["bigint", "cycle", "toJSON"])
      test(`C80 ${container} ${field} string then ${kind}: once and serializable`, () => {
        const hooks = { calls: 0 };
        const bad = poisonous(kind, hooks);
        const reads = { message: 0, stack: 0 };
        const read = (key) => {
          reads[key]++;
          if (key !== field) return undefined;
          return reads[key] === 1 ? "B original " + key : bad;
        };
        const error =
          container === "proxy"
            ? new Proxy({}, { get: (_, key) => read(key) })
            : Object.defineProperties(
                {},
                {
                  message: { get: () => read("message") },
                  stack: { get: () => read("stack") },
                },
              );
        const report = describeFailure(error);
        const text = JSON.stringify({ error: report });
        assert.equal(JSON.parse(text).error[field], "B original " + field);
        assert.deepEqual(reads, { message: 1, stack: 1 });
        assert.equal(hooks.calls, 0);
      });
test("C80 stable Error retains diagnostic strings", () => {
  const error = new Error("B original Error");
  const report = describeFailure(error);
  assert.equal(report.message, error.message);
  assert.equal(report.stack, error.stack);
  assert.equal(typeof JSON.stringify(report), "string");
});
for (const field of ["message", "stack"])
  test(`C80 throwing ${field} getter does not lose other diagnostic`, () => {
    const reads = { message: 0, stack: 0 };
    const error = new Proxy(
      {},
      {
        get(_, key) {
          reads[key]++;
          if (key === field) throw undefined;
          return "B other field";
        },
      },
    );
    const report = describeFailure(error);
    assert.equal(typeof JSON.stringify(report), "string");
    assert.equal(
      report[field === "message" ? "stack" : "message"],
      "B other field",
    );
    assert.deepEqual(reads, { message: 1, stack: 1 });
  });
for (const field of ["message", "stack"])
  for (const kind of ["bigint", "cycle", "toJSON"])
    test(`C80 initial nonstring ${field} ${kind} is not retained`, () => {
      const hooks = { calls: 0 };
      const bad = poisonous(kind, hooks);
      let reads = 0;
      const error = Object.defineProperty({}, field, {
        get() {
          reads++;
          return bad;
        },
      });
      const report = describeFailure(error);
      assert.equal(typeof JSON.stringify(report), "string");
      assert.equal(reads, 1);
      assert.equal(hooks.calls, 0);
      assert.equal(report.message, "non-Error rejection");
      assert.equal(report.stack, undefined);
    });
for (const value of [undefined, null, 0, false, ""])
  test(`C80 harmless ${typeof value}/${String(value)} diagnostic remains JSON-safe`, () => {
    const report = describeFailure(value);
    assert.equal(report.type, typeof value);
    assert.equal(typeof JSON.stringify(report), "string");
  });
