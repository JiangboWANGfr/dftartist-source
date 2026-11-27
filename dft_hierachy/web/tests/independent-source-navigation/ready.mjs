import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  H,
  C,
  using,
  call,
  ok,
  bad,
  invariant,
  document,
  documentStart,
  documentFinish,
  candidateStart,
  candidateFinish,
  ready,
  noAuto,
  autoStart,
  autoFinish,
  partialBound,
  refreshed,
  turn,
  snapshot,
  unchanged,
  hit,
  partial,
  complete,
} from "./harness.mjs";
for (const state of ["idle", "document", "paused", "disposed"])
  add(
    "ready-inactive-" + state,
    "ready",
    state,
    "no query/refresh/history replay when unbound, paused or disposed",
    () =>
      using(async (c) => {
        if (state === "document") await document(c);
        if (state === "paused") {
          await partialBound(c);
          await ok(call(c, "cancelCandidates"));
        }
        if (state === "disposed") c.m.dispose();
        ready(c);
        await noAuto(c);
        assert.equal(c.m.state.refresh, null);
      }),
  );
add(
  "ready-history-not-replayed",
  "ready",
  "ready before first binding, then partial",
  "new click does not inherit earlier ready event",
  () =>
    using(async (c) => {
      ready(c);
      await noAuto(c);
      const d = await document(c);
      await candidateFinish(c, await candidateStart(c, d), {
        completeness: partial,
      });
      await noAuto(c);
      assert.equal(c.m.state.refresh, null);
    }),
);
for (const next of [undefined, "B-next"])
  add(
    "ready-complete-" + String(next),
    "ready",
    { complete: true, next: next ?? null },
    "complete prefix not automatically refreshed or paginated",
    () =>
      using(async (c) => {
        const d = await document(c);
        await candidateFinish(c, await candidateStart(c, d), { next });
        const s = c.m.state;
        ready(c);
        await noAuto(c);
        assert.equal(c.m.state, s);
      }),
  );
for (const outcome of [
  "partial",
  "complete",
  "complete-next",
  "failed",
  "cancelled",
])
  for (const count of [1, 3])
    add(
      "ready-before-reply-" + outcome + "-" + count,
      "ready",
      { outcome, readyCount: count },
      "record pending events; only later partial success reloads once from first page; no failure retry/preload",
      () =>
        using(async (c) => {
          const d = await document(c),
            t = await candidateStart(c, d);
          for (let i = 0; i < count; i++) ready(c);
          if (outcome === "failed" || outcome === "cancelled") {
            c.wire.fail(t.q, outcome === "failed" ? "not_found" : "cancelled");
            const e = await bad(t.o);
            assert.equal(
              e,
              c.calls.findLast((x) => x.method === "resolveSource").error,
            );
            await noAuto(c);
            assert.equal(c.m.state.refresh, null);
            return;
          }
          c.wire.ok(
            t.q,
            C.page([hit()], outcome === "complete-next" ? "B-next" : undefined),
            outcome === "partial" ? partial : complete,
          );
          await ok(t.o);
          if (outcome === "partial") {
            const a = await autoStart(c);
            assert.equal(a.doc, d);
            await autoFinish(c, a, partial);
            const n = c.wire.queries.length;
            await noAuto(c, n);
            assert.equal(c.m.state.refresh, a.r);
          } else {
            await noAuto(c);
            assert.equal(c.m.state.refresh, null);
          }
        }),
    );
for (const count of [1, 4])
  add(
    "ready-after-partial-" + count,
    "ready",
    { readyCount: count },
    "coalesce queued events, preserve metadata until actual first-page reload; repeat partial does not loop",
    () =>
      using(async (c) => {
        const d = await partialBound(c),
          s = c.m.state,
          metadata = s.candidates.state.pages[0].completeness;
        for (let i = 0; i < count; i++) ready(c);
        assert.equal(c.m.state, s);
        assert.equal(
          c.m.state.candidates.state.pages[0].completeness,
          metadata,
        );
        const a = await autoStart(c);
        assert.equal(a.doc, d);
        await autoFinish(c, a, partial);
        await noAuto(c);
        assert.equal(c.m.state.refresh, a.r);
      }),
  );
for (const count of [1, 3])
  add(
    "new-ready-during-auto-" + count,
    "ready",
    { newEvents: count },
    "new ready after actual auto query permits one further reload; old handle settles and is replaced",
    () =>
      using(async (c) => {
        await partialBound(c);
        ready(c);
        const a = await autoStart(c);
        for (let i = 0; i < count; i++) ready(c);
        c.wire.ok(a.q, C.page([hit()]), partial);
        await ok(a.o);
        const b = await autoStart(c);
        assert.notEqual(a.r, b.r);
        assert.equal(a.r.document, b.r.document);
        await autoFinish(c, b, partial);
        await noAuto(c);
        assert.equal(c.m.state.refresh, b.r);
      }),
  );
for (const action of [
  "cancelCandidates",
  "clear",
  "dispose",
  "point",
  "reloadDocument",
  "reloadCandidates",
])
  add(
    "queued-invalidated-" + action,
    "ready-revocation",
    action,
    "queued old intent discarded; no old refresh handle/SDK resurrection",
    () =>
      using(async (c) => {
        const d = await partialBound(c);
        ready(c);
        let dt, ct, o;
        if (action === "dispose") c.m.dispose();
        else if (action === "point") ct = await candidateStart(c, d, 1);
        else if (action === "reloadDocument")
          dt = await documentStart(c, "reloadDocument");
        else if (action === "reloadCandidates")
          ct = await candidateStart(c, d, 0, "reloadCandidates");
        else o = call(c, action);
        if (ct) {
          await candidateFinish(c, ct, { completeness: partial });
          assert.equal(c.m.state.candidates.document, d);
          assert.equal(
            c.m.state.candidates.utf16Offset,
            action === "point" ? 1 : 0,
          );
        }
        if (dt) await documentFinish(c, dt);
        if (o) await ok(o);
        await noAuto(c);
        assert.equal(c.m.state.refresh, null);
        invariant(c);
      }),
  );
add(
  "ordinary-loadMore-retains-ready",
  "ready-revocation",
  "partial prefix, ready queued, loadMore no-op",
  "ordinary loadMore does not revoke valid ready work",
  () =>
    using(async (c) => {
      await partialBound(c);
      ready(c);
      const o = call(c, "loadMore"),
        a = await autoStart(c);
      await autoFinish(c, a);
      await ok(o);
      assert.equal(c.m.state.refresh, a.r);
    }),
);
add(
  "same-binding-noops-retain-ready",
  "ready-revocation",
  "ready queued then same-target load and same-point locate",
  "same intent work not cancelled by no-op/join",
  () =>
    using(async (c) => {
      const d = await partialBound(c);
      ready(c);
      const a = call(c, "load", "B-nav-target", "definition"),
        b = call(c, "locate", d, 0),
        t = await autoStart(c);
      await autoFinish(c, t);
      await ok(a);
      await ok(b);
      assert.equal(c.m.state.refresh, t.r);
    }),
);
for (const method of ["load", "locate"])
  add(
    "invalid-input-retains-ready-" + method,
    "ready-revocation",
    method,
    "invalid input cannot revoke queued ready/refresh or alter binding",
    () =>
      using(async (c) => {
        await partialBound(c);
        ready(c);
        const s = snapshot(c),
          o =
            method === "load"
              ? call(c, method, null, "definition")
              : call(c, method, {}, 0);
        unchanged(c, s);
        await bad(o);
        const a = await autoStart(c);
        await autoFinish(c, a);
      }),
  );
for (const method of ["locate", "loadMore", "reloadCandidates"])
  add(
    "pause-and-resume-" + method,
    "ready-pause",
    method,
    "cancel pauses even success; explicit action resumes only future events, does not replay old ready",
    () =>
      using(async (c) => {
        const d = await partialBound(c);
        ready(c);
        const first = await autoStart(c);
        await autoFinish(c, first, partial);
        await ok(call(c, "cancelCandidates"));
        assert.equal(c.m.state.refresh, null);
        ready(c);
        await noAuto(c);
        if (method === "reloadCandidates") {
          const t = await candidateStart(c, d, 0, method);
          await candidateFinish(c, t, { completeness: partial });
        } else
          await ok(
            method === "locate" ? call(c, method, d, 0) : call(c, method),
          );
        await noAuto(c);
        assert.equal(c.m.state.refresh, null);
        ready(c);
        const second = await autoStart(c);
        await autoFinish(c, second, partial);
        await noAuto(c);
      }),
  );
add(
  "no-loop-after-auto-failure",
  "ready",
  "auto request fails and no newer event",
  "completion rejects original error, failed state stays; no retry loop",
  () =>
    using(async (c) => {
      await partialBound(c);
      ready(c);
      const a = await autoStart(c);
      c.wire.fail(a.q, "not_found");
      const e = await bad(a.o, "not_found");
      assert.equal(
        e,
        c.calls.findLast((x) => x.method === "resolveSource").error,
      );
      assert.equal(c.m.state.refresh, a.r);
      assert.equal(c.m.state.candidates.state.status, "failed");
      await noAuto(c);
    }),
);
add(
  "handle-retained-across-pagination",
  "completion",
  "auto complete prefix with next, loadMore succeeds",
  "same refresh handle/completion and original document across ordinary page update",
  () =>
    using(async (c) => {
      const d = await partialBound(c);
      ready(c);
      const a = await autoStart(c);
      await autoFinish(c, a, complete, "B-next");
      const t = await candidateStart(c, d, 0, "loadMore");
      await candidateFinish(c, t);
      assert.equal(c.m.state.refresh, a.r);
      await ok(a.o);
    }),
);
for (const action of [
  "reloadCandidates",
  "point",
  "reloadDocument",
  "clear",
  "cancelCandidates",
  "dispose",
])
  add(
    "handle-revoked-" + action,
    "completion",
    action,
    "old retained completion settles once; current refresh cleared/replaced without stale resurrection",
    () =>
      using(async (c) => {
        const { d, a } = await refreshed(c);
        let t, dt, o;
        if (action === "point") t = await candidateStart(c, d, 1);
        else if (action === "reloadCandidates")
          t = await candidateStart(c, d, 0, action);
        else if (action === "reloadDocument")
          dt = await documentStart(c, action);
        else if (action === "dispose") c.m.dispose();
        else o = call(c, action);
        assert.equal(c.m.state.refresh, null);
        if (t) await candidateFinish(c, t);
        if (dt) await documentFinish(c, dt);
        if (o) await ok(o);
        await ok(a.o);
        assert.equal(c.m.state.refresh, null);
      }),
  );
