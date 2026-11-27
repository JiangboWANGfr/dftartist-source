// A32 contract evidence for C-95/Q2. Real L6 + SDK, controlled Transport.
// No candidate component, button implementation, B oracle or strong-Promise claim.
import assert from "node:assert/strict";
import test from "node:test";
import * as N from "../../tests/independent-source-navigation/harness.mjs";

await N.boot();
const partial = {
  status: "partial",
  reasons: [{ code: "indexing", at: "A/c95", detail: "index still building" }],
};

async function prepare(c, completeness, next) {
  const document = await N.document(c);
  await N.candidateFinish(c, await N.candidateStart(c, document), {
    items: [N.hit()],
    completeness,
    next,
  });
  return document;
}
async function unchangedLoadMore(c) {
  const before = N.snapshot(c);
  await N.ok(N.call(c, "loadMore"));
  N.unchanged(c, before);
}
for (const next of [undefined, "A-partial-next"])
  test(`C-95 partial next=${String(next)}: no continuation, explicit reload recovers`, async () => {
    await N.using(async (c) => {
      const document = await prepare(c, partial, next);
      const page = c.m.state.candidates.state.pages[0];
      assert.deepEqual(page.completeness, partial);
      assert.equal(page.result.next, next);
      await unchangedLoadMore(c);
      assert.equal(c.m.state.candidates.state.pages[0], page);
      const restart = await N.candidateStart(
        c,
        document,
        0,
        "reloadCandidates",
      );
      assert.equal(restart.q.params.cursor, "");
      assert.equal(c.m.state.candidates.state.pages.length, 0);
      await N.candidateFinish(c, restart, { items: [N.hit(1)] });
      assert.equal(c.m.state.candidates.state.pages.length, 1);
      assert.equal(
        c.m.state.candidates.state.pages[0].completeness.status,
        "complete",
      );
      assert.notEqual(c.m.state.candidates.state.pages[0], page);
      // An existing reader retains the original partial metadata after reload.
      assert.deepEqual(page.completeness, partial);
      assert.equal(page.result.next, next);
    });
  });

test("C-95 complete+next requests one page; partial tail+next stops the chain", async () => {
  await N.using(async (c) => {
    const document = await prepare(c, N.complete, "A-complete-next");
    const first = c.m.state.candidates.state.pages[0];
    const requests = c.wire.queries.length;
    const more = await N.candidateStart(c, document, 0, "loadMore");
    assert.equal(more.q.params.cursor, "A-complete-next");
    assert.equal(c.wire.queries.length, requests + 1);
    await N.candidateFinish(c, more, {
      items: [N.hit(1)],
      next: "A-tail-next",
      completeness: partial,
    });
    const pages = c.m.state.candidates.state.pages;
    assert.equal(pages.length, 2);
    assert.equal(pages[0], first);
    assert.equal(pages[0].completeness.status, "complete");
    assert.deepEqual(pages[1].completeness, partial);
    assert.equal(pages[1].result.next, "A-tail-next");
    await unchangedLoadMore(c);
    assert.equal(c.wire.queries.length, requests + 1);
  });
});

test("C-95 complete without next is exhausted", async () => {
  await N.using(async (c) => {
    await prepare(c, N.complete);
    await unchangedLoadMore(c);
  });
});

test("B32-Q2 schema7 accepts known codes and unknown object fields, rejects unknown enum", () => {
  const validate = N.C.protocol.validateDefinition;
  assert.equal(validate("Completeness", partial), true);
  assert.equal(
    validate("Completeness", {
      status: "partial",
      reasons: [{ code: "unsupported", detail: "known", futureField: "kept" }],
    }),
    true,
  );
  assert.equal(
    validate("Completeness", {
      status: "partial",
      reasons: [{ code: "A_future_reason", detail: "not schema7" }],
    }),
    false,
  );
});
