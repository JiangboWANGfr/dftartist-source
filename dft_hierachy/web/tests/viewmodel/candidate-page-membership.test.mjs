import assert from "node:assert/strict";
import test from "node:test";
import { context, page, vm, freeze, snapshotId } from "../candidate-page/context.mjs";

const code = (value) => (error) => error.code === value;
function poison() {
  let reads = 0;
  return { value: new Proxy({}, { get() { reads++; throw Error("foreign access"); }, has() { reads++; throw Error("foreign access"); } }), reads: () => reads };
}

test("A M7 candidate page identity: all original slots, foreign values and error order", async (t) => {
  const c = await context(); t.after(() => c.close());
  const originals = Array.from({ length: 7 }, (_, n) => page(n, `cursor-${n}`));
  await c.answer(() => c.model.locate(c.document, 0), originals[0]);
  for (const value of originals.slice(1)) await c.answer(() => c.model.loadMore(), value);
  const state = c.model.state, calls = c.calls.length;
  for (const [i, value] of originals.entries()) {
    for (let j = 0; j < value.result.items.length; j++) {
      const action = c.model.createCandidateAction(value, j);
      assert.ok(Object.isFrozen(action)); assert.equal(action.page, value); assert.equal(action.itemIndex, j);
      c.model.confirmCandidate(action, c.selection);
      const hit = originals[i].result.items[j];
      assert.deepEqual(c.selection.current.items, [hit.refKind === "definition" ? { def: hit.ref } : { ref: hit.ref }]);
    }
  }
  const foreign = poison();
  for (const value of [foreign.value, null, undefined, 3, { ...originals[0] }])
    assert.throws(() => c.model.createCandidateAction(value, foreign.value), code("invalid_page"));
  for (const value of [foreign.value, -1, 2, 0.5, NaN, "0"])
    assert.throws(() => c.model.createCandidateAction(originals[0], value), code("invalid_index"));
  assert.throws(() => c.model.confirmCandidate(foreign.value, foreign.value), code("invalid_action"));
  assert.equal(foreign.reads(), 0); assert.equal(c.model.state, state); assert.equal(c.calls.length, calls);
});

test("A M7 candidate pages: pending, failure, cancellation and retry retain same-chain action provenance", async (t) => {
  const c = await context(); t.after(() => c.close());
  const first = page(0, "a");
  await c.answer(() => c.model.locate(c.document, 0), first);
  const action = c.model.createCandidateAction(first, 0);
  let operation = c.model.loadMore();
  assert.throws(() => c.model.confirmCandidate(action, c.selection), code("not_ready"));
  const failed = assert.rejects(operation, code("inconsistent_reply")); c.calls.at(-1).resolve(page(1, "a")); await failed;
  assert.throws(() => c.model.confirmCandidate(action, c.selection), code("not_ready"));
  operation = c.model.loadMore(); const old = c.calls.at(-1); const cancelled = assert.rejects(operation, code("cancelled"));
  await c.model.cancelCandidates(); await cancelled; assert.ok(old.signal.aborted);
  assert.throws(() => c.model.confirmCandidate(action, c.selection), code("not_ready"));
  const retry = c.model.loadMore(); old.resolve(page(9, "late")); c.calls.at(-1).resolve(page(1, "b")); await retry;
  c.model.confirmCandidate(action, c.selection); assert.deepEqual(c.selection.current.items, [{ ref: first.result.items[0].ref }]);
  assert.equal(c.model.state.candidates.state.pages[0], first);
  assert.equal(c.model.state.candidates.state.pages.length, 2);
});

test("A M7 candidate pages: same Reply in a replacement chain cannot revive old actions", async (t) => {
  const c = await context(); t.after(() => c.close());
  const first = page(0, "a");
  await c.answer(() => c.model.locate(c.document, 0), first);
  await c.answer(() => c.model.loadMore(), page(1, "b"));
  const old = c.model.createCandidateAction(first, 0);
  const reload = c.model.reloadCandidates();
  assert.throws(() => c.model.confirmCandidate(old, c.selection), code("stale_action"));
  c.calls.at(-1).resolve(first); await reload;
  assert.equal(c.model.state.candidates.state.pages[0], first);
  assert.throws(() => c.model.confirmCandidate(old, c.selection), code("stale_action"));
  c.model.confirmCandidate(c.model.createCandidateAction(first, -0), c.selection);
  const current = c.model.createCandidateAction(first, 0);
  await c.model.clear(); assert.throws(() => c.model.confirmCandidate(current, c.selection), code("stale_action"));
  assert.throws(() => c.model.createCandidateAction(first, 0), code("not_ready"));
  c.model.dispose(); assert.throws(() => c.model.confirmCandidate(current, c.selection), code("disposed"));
  assert.equal(first.result.items.length, 2);
});

test("A M7 candidate pages: cross-model action ownership, partial addresses, no-op and listener failure", async (t) => {
  const a = await context(), b = await context(); t.after(() => { a.close(); b.close(); });
  const first = page(0, "a"), last = page(1, "b", { partial: true });
  for (const c of [a, b]) {
    await c.answer(() => c.model.locate(c.document, 0), first);
    await c.answer(() => c.model.loadMore(), last);
  }
  const action = a.model.createCandidateAction(last, 1);
  assert.throws(() => b.model.confirmCandidate(action, b.selection), code("invalid_action"));
  const sentinel = {}, off = a.selection.subscribe(() => { throw sentinel; });
  assert.throws(() => a.model.confirmCandidate(action, a.selection), e => e instanceof AggregateError && e.errors[0] === sentinel);
  off(); const selected = a.selection.current; a.model.confirmCandidate(action, a.selection); assert.equal(a.selection.current, selected);
  assert.deepEqual(selected.items, [{ def: last.result.items[1].ref }]);
  assert.equal(a.model.state.candidates.state.pages[1], last);
  const missing = freeze({ ...page(2), result: { items: [{ ref: "old-schema7", kind: "statement", span: first.result.items[0].span }] } });
  await a.answer(() => a.model.reloadCandidates(), missing);
  assert.throws(() => a.model.confirmCandidate(a.model.createCandidateAction(missing, 0), {}), code("address_unavailable"));
  assert.equal(a.selection.current, selected);
});

test("A M7 candidate pages: notification rejection and selection disposal preserve committed state", async (t) => {
  const c = await context(); t.after(() => c.close()); const replies = [page(0, "a"), page(1, "b")];
  await c.answer(() => c.model.locate(c.document, 0), replies[0]);
  const denied = [], sentinel = {};
  const off = c.model.subscribe(() => {
    assert.throws(() => c.model.createCandidateAction(replies[0], 0), code("reentrant_change"));
    denied.push(assert.rejects(c.model.clear(), code("reentrant_change")));
    if (c.model.state.candidates.state.status === "success") throw sentinel;
  });
  const operation = assert.rejects(c.model.loadMore(), e => e instanceof AggregateError && e.errors.includes(sentinel));
  c.calls.at(-1).resolve(replies[1]); await operation; await Promise.all(denied); off();
  assert.equal(c.model.state.candidates.state.status, "success");
  const action = c.model.createCandidateAction(replies[1], 0);
  const selection = new vm.SelectionModel({ snapshotId });
  const dispose = selection.subscribe(() => c.model.dispose());
  c.model.confirmCandidate(action, selection); dispose();
  assert.equal(c.model.disposed, true); assert.deepEqual(selection.current.items, [{ ref: replies[1].result.items[0].ref }]);
  selection.dispose(); assert.equal(c.ready.size, 0);
});
