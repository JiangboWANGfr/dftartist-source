import test from "node:test";
import assert from "node:assert/strict";
import { q1Cases } from "./q1.mjs";
import { coreCases } from "./core.mjs";
import { questions } from "../questions.mjs";
import {
  fixture,
  point,
} from "../../independent-source-ref-kind/core-fixture.mjs";
test("B31 six clarified inputs correspond one-to-one to original unresolved questions; not product execution", () => {
  assert.equal(q1Cases.length, 6);
  assert.equal(coreCases.length, 8);
  assert.deepEqual(
    q1Cases.map((c) => [c.input.source, c.input.method]),
    questions.map((q) => [q.source, q.method]),
  );
  for (const c of [...q1Cases, ...coreCases]) {
    assert.ok(c.id && c.input && c.expected && c.basis);
    assert.equal(typeof c.run, "function");
  }
  assert.equal(new Set([...q1Cases, ...coreCases].map((c) => c.id)).size, 14);
});
test("B fixture literal coordinates have unique byte marker, CRLF/non-ASCII retained; no inferred candidate refs", () => {
  for (const macro of [false, true]) {
    const f = fixture(macro);
    assert.ok(f.leaf.includes("😀") && f.leaf.includes("\r\n"));
    const p = point(f.leaf, f.assign);
    assert.equal(
      p.offset,
      Buffer.byteLength(f.leaf.slice(0, f.leaf.indexOf(f.assign))),
    );
    assert.ok(p.line > 1 && p.col > 0);
  }
});
import { N } from "../harness.mjs";
import { scoped, ResourceFailure } from "./resource-scope.mjs";
await N.boot(false);
for (const source of ["source", "readSource", "resolveSource"])
  test("B prior public stack premise: " + source, () =>
    N.using(async (c) => {
      const d = source === "resolveSource" ? await N.document(c) : undefined;
      const own = Object.getOwnPropertyDescriptor(c.client, source),
        original = c.client[source];
      let returned = false,
        count = 0;
      c.client[source] = function (...args) {
        count++;
        assert.equal(returned, source === "readSource");
        return Reflect.apply(original, this, args);
      };
      try {
        if (source === "resolveSource") {
          const p = N.candidateStart(c, d);
          returned = true;
          await N.candidateFinish(c, await p, { items: [] });
        } else {
          const p = N.documentStart(c);
          returned = true;
          await N.documentFinish(c, await p);
        }
        assert.equal(count, 1);
      } finally {
        if (own) Object.defineProperty(c.client, source, own);
        else delete c.client[source];
      }
    }),
  );
test("B scope preserves primary and cleanup failures and still releases later stages", async () => {
  const primary = { B: "first" },
    cleanup = { B: "release" },
    seen = [],
    receipts = [];
  await assert.rejects(
    scoped(
      () => {
        throw primary;
      },
      [
        [
          "one",
          () => {
            seen.push(1);
            throw cleanup;
          },
        ],
        ["two", () => seen.push(2)],
      ],
      receipts,
    ),
    (e) =>
      e instanceof ResourceFailure &&
      e.primary === primary &&
      e.cleanup[0].error === cleanup,
  );
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(
    receipts.map((r) => r.pass),
    [false, true],
  );
});
test("B scope injected deadline releases a hanging body without sleeps or claiming product cancellation", async () => {
  let reject,
    closed = 0;
  const deadline = new Promise((_, r) => {
      reject = r;
    }),
    primary = { B: "deadline" };
  const p = scoped(
    () => new Promise(() => {}),
    [["release", () => closed++]],
    [],
    deadline,
  );
  reject(primary);
  await assert.rejects(
    p,
    (e) => e instanceof ResourceFailure && e.primary === primary,
  );
  assert.equal(closed, 1);
});
