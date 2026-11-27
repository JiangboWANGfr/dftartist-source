// Tests of B facilities + existing public capabilities, never new-method acceptance.
import assert from "node:assert/strict";
import test from "node:test";
import { cases } from "./cases.mjs";
import "./boundaries.mjs";
import { negatives } from "./types.mjs";
import { N, boot, ready, hit, using, republish, poison } from "./harness.mjs";
await boot(false);
test("B inventory has explicit inputs/expected/basis and unique IDs, no new runtime case invoked", () => {
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  assert.ok(cases.length >= 100);
  assert.equal(new Set(negatives.map((c) => c[0])).size, negatives.length);
  for (const c of cases) {
    assert.notEqual(c.input, undefined);
    assert.ok(c.expected && c.basis);
    assert.equal(typeof c.run, "function");
  }
  const h = poison();
  assert.throws(() => h.value.any);
  assert.equal(h.counts.probes, 1);
});
test("actual public SDK sequential identical source.resolve is NOT cached, even byte-identical payload", () =>
  using(async (c) => {
    const { d, page } = await ready(c);
    const t = await N.candidateStart(c, d, 0, "reloadCandidates");
    await N.candidateFinish(c, t, { items: [hit()] });
    const next = c.m.state.candidates.state.pages[0];
    assert.notEqual(next, page);
    assert.deepEqual(next, page);
    assert.equal(
      c.wire.queries.filter((q) => q.method === "source.resolve").length,
      2,
    );
  }));
test("actual SDK concurrent identical resolves coalesce and share frozen Reply across two nav models", () =>
  using(async (c) => {
    const saved = c.m,
      d1 = await N.document(c),
      other = c.make();
    c.m = other;
    const d2 = await N.document(c);
    c.m = saved;
    const t = await N.candidateStart(c, d1);
    c.m = other;
    const o = N.call(c, "locate", d2, 0);
    c.m = saved;
    await N.candidateFinish(c, t, { items: [hit()] });
    await N.ok(o);
    const page = c.m.state.candidates.state.pages[0];
    assert.equal(other.state.candidates.state.pages[0], page);
    N.H.deep(page);
    assert.equal(
      c.wire.queries.filter((q) => q.method === "source.resolve").length,
      1,
    );
  }));
test("B public-method adapter re-publishes same Reply to a new actual nav chain and restores borrowed client; NOT real cache", () =>
  using(async (c) => {
    const { page } = await ready(c),
      original = c.client.resolveSource,
      n = c.wire.sent.length;
    await republish(c, page, async (count) => {
      await N.ok(N.call(c, "reloadCandidates"));
      assert.equal(count(), 1);
      assert.equal(c.m.state.candidates.state.pages[0], page);
    });
    assert.equal(c.client.resolveSource, original);
    assert.equal(c.wire.sent.length, n);
    await N.sdkAlive(c);
  }));
test("original real Selection base can operate real subclass without overridden dispatch, and mapping is not confirmation", () =>
  using(async (c) => {
    let calls = 0;
    const Base = N.H.vm.SelectionModel;
    class Derived extends Base {
      select() {
        calls++;
        throw Error("B override");
      }
    }
    const s = new Derived({ snapshotId: c.m.snapshotId });
    c.models.push(s);
    Reflect.apply(Base.prototype.select, s, [
      {
        items: [{ def: "B exact" }],
        origin: "source",
        snapshotId: c.m.snapshotId,
      },
    ]);
    assert.equal(calls, 0);
    assert.deepEqual(s.current.items, [{ def: "B exact" }]);
    s.back();
    assert.deepEqual(s.current.items, []);
  }));
test("B forwarding keeps explicitly undefined index, and B addressed fixtures differ from legacy unmarked hits", async () => {
  const { issue } = await import("./harness.mjs");
  let args;
  const forward = {
    m: {
      state: { candidates: { state: { pages: ["page"] } } },
      createCandidateAction(...a) {
        args = a;
        return a;
      },
    },
  };
  issue(forward, "page", undefined);
  assert.deepEqual(args, ["page", undefined]);
  issue(forward, "page");
  assert.deepEqual(args, ["page", 0]);
  assert.equal(hit().refKind, "object");
  assert.equal(hit("definition").refKind, "definition");
  assert.equal(Object.hasOwn(N.hit(), "refKind"), false);
});
