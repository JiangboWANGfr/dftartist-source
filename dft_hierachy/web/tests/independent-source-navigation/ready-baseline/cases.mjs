import assert from "node:assert/strict";
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
  track,
  hit,
  partial,
  complete,
} from "../harness.mjs";
export const cases = [];
function add(
  id,
  input,
  expected,
  run,
  basis = "DESIGN §6.13.2–3 (fixed b55f27d, C-86 revision)",
) {
  cases.push({
    id: "SN-RB-" + id,
    group: "ready-baseline",
    input,
    expected,
    basis,
    run,
  });
}
const queries = (c) =>
  c.wire.queries.filter((q) => q.method === "source.resolve");
function watch(c) {
  const w = { handles: [], states: [] };
  c.m.subscribe(() => {
    const s = c.m.state;
    w.states.push(s);
    if (s.refresh && !w.handles.includes(s.refresh)) {
      w.handles.push(s.refresh);
      track(c, s.refresh.completion);
    }
  });
  return w;
}
async function stopped(c, w, n, handles) {
  await noAuto(c);
  assert.equal(
    queries(c).length,
    n,
    "total source.resolve count, not a late relative baseline",
  );
  assert.equal(w.handles.length, handles);
  assert.equal(c.m.state.refresh, handles ? w.handles.at(-1) : null);
  assert.equal(c.calls.filter((x) => x.method === "source").length, 1);
  assert.equal(c.calls.filter((x) => x.method === "readSource").length, 1);
  invariant(c);
}
async function partialReply(c, t, w) {
  const sdkCall = c.calls.findLast((x) => x.method === "resolveSource");
  c.wire.ok(t.q, C.page([hit()]), partial);
  await ok(t.o);
  assert.ok(sdkCall.reply);
  assert.ok(
    w.states.some(
      (s) =>
        s.candidates?.state.status === "success" &&
        s.candidates.state.pages.at(-1) === sdkCall.reply,
    ),
    "committed original Reply was publicly visible; do not assume still success after await",
  );
}
async function failed(c, w, code = "not_found", events = 1) {
  const d = await document(c),
    t = await candidateStart(c, d);
  for (let i = 0; i < events; i++) ready(c);
  c.wire.fail(t.q, code);
  const e = await bad(t.o, code);
  assert.equal(e, c.calls.findLast((x) => x.method === "resolveSource").error);
  assert.equal(
    c.m.state.candidates.state.status,
    code === "cancelled" ? "cancelled" : "failed",
  );
  await stopped(c, w, 1, 0);
  return { d, t, e };
}
for (const code of ["not_found", "cancelled"])
  for (const method of ["loadMore", "locate"])
    add(
      "preserved-after-" + code + "-" + method,
      {
        first: "pending",
        event: "E1",
        terminal: code,
        retry: method,
        replies: ["partial", "partial"],
      },
      "no retry at failure; ordinary same-binding retry preserves E1; total3 resolve/one H1, old error identity, H1 settles and no loop",
      () =>
        using(async (c) => {
          const w = watch(c),
            { d } = await failed(c, w, code);
          const t = await candidateStart(c, d, 0, method);
          assert.equal(t.q.params.cursor, "");
          await partialReply(c, t, w);
          const a = await autoStart(c);
          assert.equal(a.r.document, d);
          assert.equal(a.r.utf16Offset, 0);
          await autoFinish(c, a, partial);
          await stopped(c, w, 3, 1);
        }),
    );
add(
  "retry-multiple-events",
  { terminal: "not_found", readyCount: 3, retry: "loadMore" },
  "multiple uncovered pre-failure events coalesce in one automatic restart; total3/one H1",
  () =>
    using(async (c) => {
      const w = watch(c),
        { d } = await failed(c, w, "not_found", 3),
        t = await candidateStart(c, d, 0, "loadMore");
      await partialReply(c, t, w);
      const a = await autoStart(c);
      await autoFinish(c, a, partial);
      await stopped(c, w, 3, 1);
    }),
);
for (const method of ["loadMore", "locate"])
  add(
    "pending-join-" + method,
    { event: "E1 during initial pending", join: method },
    "joining keeps original request and uncovered event; both explicit waiters settle, total2/one automatic handle",
    () =>
      using(async (c) => {
        const w = watch(c),
          d = await document(c),
          t = await candidateStart(c, d);
        ready(c);
        const j = method === "locate" ? call(c, method, d, 0) : call(c, method);
        assert.equal(queries(c).length, 1);
        await partialReply(c, t, w);
        await ok(j);
        const a = await autoStart(c);
        await autoFinish(c, a, partial);
        await stopped(c, w, 2, 1);
      }),
  );
for (const timing of ["pending", "complete"])
  add(
    "complete-record-to-partial-" + timing,
    { eventDuring: timing, first: "complete+next", ordinaryNext: "partial" },
    "complete suppresses automatic eligibility, does not consume E1; later real pagination partial reloads first once; total3/one H1",
    () =>
      using(async (c) => {
        const w = watch(c),
          d = await document(c),
          t = await candidateStart(c, d);
        if (timing === "pending") ready(c);
        await candidateFinish(c, t, {
          next: "B-RB-next",
          completeness: complete,
        });
        if (timing === "complete") ready(c);
        await stopped(c, w, 1, 0);
        const page = await candidateStart(c, d, 0, "loadMore");
        assert.equal(page.q.params.cursor, "B-RB-next");
        await partialReply(c, page, w);
        const a = await autoStart(c);
        assert.equal(a.q.params.cursor, "");
        await autoFinish(c, a, partial);
        await stopped(c, w, 3, 1);
      }),
  );
add(
  "explicit-reload-covers-old-event",
  { failed: "E1→not_found", explicit: "reloadCandidates", reply: "partial" },
  "explicit reload establishes new intent before pending; old E1 cannot replay; total2/no handle",
  () =>
    using(async (c) => {
      const w = watch(c),
        { d } = await failed(c, w),
        t = await candidateStart(c, d, 0, "reloadCandidates");
      await partialReply(c, t, w);
      await stopped(c, w, 2, 0);
    }),
);
for (const method of ["locate", "loadMore", "reloadCandidates"])
  add(
    "pause-recovery-" + method,
    {
      failed: "E1→not_found",
      pause: "cancelCandidates",
      resume: method,
      pausedEvent: "ignored E2",
      futureEvent: "E3",
    },
    "pause discards E1 and E2; valid recovery alone does not replay; only E3 starts one auto; total3/one H1",
    () =>
      using(async (c) => {
        const w = watch(c),
          { d } = await failed(c, w);
        await ok(call(c, "cancelCandidates"));
        ready(c);
        await noAuto(c);
        const t = await candidateStart(c, d, 0, method);
        await partialReply(c, t, w);
        await stopped(c, w, 2, 0);
        ready(c);
        const a = await autoStart(c);
        await autoFinish(c, a, partial);
        await stopped(c, w, 3, 1);
      }),
  );
for (const action of ["clear", "point", "reloadDocument", "dispose"])
  add(
    "failure-record-revoked-" + action,
    { failed: "pending→E1→not_found", action },
    "failed state retained event is revoked by binding invalidation; new binding cannot inherit E1 and disposal cannot resurrect it",
    () =>
      using(async (c) => {
        const w = watch(c),
          { d } = await failed(c, w);
        if (action === "dispose") {
          c.m.dispose();
          await noAuto(c);
          assert.equal(queries(c).length, 1);
          assert.equal(w.handles.length, 0);
          return;
        }
        let fresh = d,
          offset = 0;
        if (action === "clear") {
          await ok(call(c, "clear"));
          fresh = await document(c);
        }
        if (action === "point") offset = 1;
        if (action === "reloadDocument")
          fresh = await documentFinish(
            c,
            await documentStart(c, "reloadDocument"),
          );
        const t = await candidateStart(c, fresh, offset);
        await partialReply(c, t, w);
        await noAuto(c);
        assert.equal(queries(c).length, 2);
        assert.equal(w.handles.length, 0);
        assert.equal(c.m.state.candidates.document, fresh);
        assert.equal(c.m.state.candidates.utf16Offset, offset);
        assert.equal(c.m.state.refresh, null);
        invariant(c);
      }),
  );
for (const count of [1, 3])
  add(
    "Q2-pending-listener-" + count,
    {
      initial: "partial",
      E1: "queued",
      E2Count: count,
      E2Phase: "H1 pending listener, before SDK send",
    },
    "pending-before-SDK E2 is after H1 coverage; total3 resolve and distinct H1/H2 completions, retained H1 settles, H2 partial no loop",
    () =>
      using(async (c) => {
        const d = await partialBound(c),
          w = watch(c);
        let injected = false;
        c.m.subscribe(() => {
          const s = c.m.state;
          if (
            !injected &&
            s.refresh === w.handles[0] &&
            s.refresh &&
            s.candidates.state.status === "pending"
          ) {
            injected = true;
            assert.equal(
              queries(c).length,
              1,
              "E2 phase precedes first automatic SDK request",
            );
            for (let i = 0; i < count; i++) ready(c);
          }
        });
        ready(c);
        const a = await autoStart(c);
        assert.equal(injected, true);
        await autoFinish(c, a, partial);
        const b = await autoStart(c);
        assert.notEqual(a.r, b.r);
        assert.equal(a.r.document, d);
        assert.equal(b.r.document, d);
        await autoFinish(c, b, partial);
        await ok(a.o);
        await stopped(c, w, 3, 2);
        assert.deepEqual(w.handles, [a.r, b.r]);
        assert.equal(a.o.count, 1);
        assert.equal(b.o.count, 1);
      }),
  );
for (const count of [2, 4])
  add(
    "pre-boundary-coalescing-" + count,
    { initial: "partial", eventsBeforeAutoBoundary: count },
    "all events before automatic pending boundary are covered once; total2/one H1 and no second auto",
    () =>
      using(async (c) => {
        await partialBound(c);
        const w = watch(c);
        for (let i = 0; i < count; i++) ready(c);
        const a = await autoStart(c);
        await autoFinish(c, a, partial);
        await stopped(c, w, 2, 1);
      }),
  );
for (const code of ["not_found", "cancelled"])
  add(
    "covered-event-not-restored-after-auto-" + code,
    { autoTerminal: code, ordinaryRetry: "partial", newEvent: false },
    "auto covers E1 before starting and terminal never rolls back; later manual retry cannot replay it; H1 keeps original rejection, total3",
    () =>
      using(async (c) => {
        const d = await partialBound(c),
          w = watch(c);
        ready(c);
        const a = await autoStart(c);
        c.wire.fail(a.q, code);
        const e = await bad(a.o, code);
        assert.equal(
          e,
          c.calls.findLast((x) => x.method === "resolveSource").error,
        );
        await stopped(c, w, 2, 1);
        const t = await candidateStart(c, d, 0, "loadMore");
        await partialReply(c, t, w);
        await stopped(c, w, 3, 1);
        assert.equal(await bad(a.o), e);
        assert.equal(c.m.state.refresh, a.r);
      }),
  );
add(
  "covered-complete-to-partial",
  { E1: "auto complete+next", manualNext: "partial", newEvent: false },
  "covered E1 remains covered across complete and ordinary pagination; H1 retained; total3/no second auto",
  () =>
    using(async (c) => {
      const d = await partialBound(c),
        w = watch(c);
      ready(c);
      const a = await autoStart(c);
      await autoFinish(c, a, complete, "B-RB-next");
      const t = await candidateStart(c, d, 0, "loadMore");
      await partialReply(c, t, w);
      await stopped(c, w, 3, 1);
      assert.equal(c.m.state.refresh, a.r);
      await ok(a.o);
    }),
);
add(
  "new-event-survives-auto-failure",
  {
    E1: "starts H1",
    E2: "H1 pending listener",
    H1: "not_found",
    manualRetry: "partial",
  },
  "failed H1 does not retry, E1 stays covered but E2 stays uncovered; manual recovery partial permits exactly H2; total4/two handles",
  () =>
    using(async (c) => {
      const d = await partialBound(c),
        w = watch(c);
      let injected = false;
      c.m.subscribe(() => {
        const s = c.m.state;
        if (
          !injected &&
          s.refresh &&
          s.refresh === w.handles[0] &&
          s.candidates.state.status === "pending"
        ) {
          injected = true;
          assert.equal(queries(c).length, 1);
          ready(c);
        }
      });
      ready(c);
      const a = await autoStart(c);
      assert.equal(injected, true);
      c.wire.fail(a.q, "not_found");
      await bad(a.o, "not_found");
      await stopped(c, w, 2, 1);
      const t = await candidateStart(c, d, 0, "loadMore");
      await partialReply(c, t, w);
      const b = await autoStart(c);
      assert.notEqual(a.r, b.r);
      await autoFinish(c, b, partial);
      await stopped(c, w, 4, 2);
    }),
);
add(
  "explicit-reload-pending-new-event",
  {
    E1: "before failed",
    explicitReload: "covers E1",
    E2: "explicit pending before SDK",
  },
  "explicit reload revokes old E1 but later pending event belongs to new intent; total3/one auto H1",
  () =>
    using(async (c) => {
      const w = watch(c),
        { d } = await failed(c, w);
      let injected = false;
      c.m.subscribe(() => {
        const s = c.m.state;
        if (
          !injected &&
          s.candidates?.state.status === "pending" &&
          s.refresh === null
        ) {
          injected = true;
          assert.equal(queries(c).length, 1);
          ready(c);
        }
      });
      const t = await candidateStart(c, d, 0, "reloadCandidates");
      assert.equal(injected, true);
      await partialReply(c, t, w);
      const a = await autoStart(c);
      await autoFinish(c, a, partial);
      await stopped(c, w, 3, 1);
    }),
);
