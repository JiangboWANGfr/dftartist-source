import assert from "node:assert/strict";
import test from "node:test";
import { context, page } from "../candidate-page/context.mjs";

test("A M7 candidate actions: lazy current-prefix membership is reused and replaced, single-page path stays direct", async (t) => {
  const c = await context(); t.after(() => c.close());
  const originals = Array.from({ length: 128 }, (_, n) => page(n, `cursor-${n}`));
  const owned = new WeakSet(originals), additions = [];
  const add = Set.prototype.add;
  Set.prototype.add = function (value) {
    if (owned.has(value)) additions.push({ set: this, value });
    return add.call(this, value);
  };
  t.after(() => { Set.prototype.add = add; });
  await c.answer(() => c.model.locate(c.document, 0), originals[0]);
  const first = c.model.createCandidateAction(originals[0], 0);
  c.model.confirmCandidate(first, c.selection); assert.equal(additions.length, 0);
  for (const value of originals.slice(1)) await c.answer(() => c.model.loadMore(), value);
  assert.equal(additions.length, 0, "unused multi-page prefix must not allocate its identity index");
  for (let repeat = 0; repeat < 20; repeat++) {
    for (const p of originals) {
      const action = c.model.createCandidateAction(p, 0);
      c.model.confirmCandidate(action, c.selection);
    }
  }
  assert.equal(additions.length, originals.length);
  assert.equal(new Set(additions.map(x => x.set)).size, 1);
  const prefix = c.model.state.candidates.state.pages;
  const pending = c.model.loadMore(), cancelled = assert.rejects(pending, e => e.code === "cancelled");
  await c.model.cancelCandidates(); await cancelled;
  assert.equal(c.model.state.candidates.state.pages, prefix);
  const retry = c.model.loadMore(); const extra = page(128, "extra"); owned.add(extra);
  c.calls.at(-1).resolve(extra); await retry;
  assert.equal(additions.length, originals.length);
  c.model.confirmCandidate(first, c.selection);
  assert.equal(additions.length, 128 + 129);
  assert.equal(new Set(additions.map(x => x.set)).size, 2);
  await c.model.clear();
  await c.model.load("A-document", "definition");
  const replacementDocument = c.model.state.document.data;
  await c.answer(() => c.model.locate(replacementDocument, 0), originals[0]);
  assert.throws(() => c.model.confirmCandidate(first, c.selection), e => e.code === "stale_action");
  c.model.createCandidateAction(originals[0], 0); assert.equal(additions.length, 257);
  await c.answer(() => c.model.loadMore(), originals[1]);
  c.model.createCandidateAction(originals[0], 0); assert.equal(additions.length, 259);
  assert.equal(new Set(additions.map(x => x.set)).size, 3);
  // Counting constructor additions proves work reuse, not exact live heap/GC.
});
