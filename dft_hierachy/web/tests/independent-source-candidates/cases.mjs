import assert from "node:assert/strict";
import {
  using,
  invoke,
  begin,
  finish,
  firstRequest,
  failure,
  success,
  local,
  state,
  deep,
  Q,
  hit,
  page,
  complete,
  partial,
  tick,
  sdk,
  vm,
  sdkAlive,
} from "./harness.mjs";
export const cases = [];
export function add(id, group, input, expected, run, basis = "DESIGN §6.11") {
  cases.push({ id: "SC-" + id, group, input, expected, basis, run });
}
add(
  "idle",
  "ownership",
  {},
  "frozen idle, no query/SDK listener; no-op identity; dispose keeps SDK alive",
  () =>
    using(async (c) => {
      const s = state(c, "idle", null);
      assert.equal(c.m.snapshotId, Q.snapshotId);
      assert.equal(c.m.disposed, false);
      assert.equal(c.wire.queries.length, 0);
      assert.equal(c.registrations, 0);
      for (const cmd of ["loadMore", "reload", "cancel", "clear"])
        await success(invoke(c, cmd));
      assert.equal(c.m.state, s);
      assert.equal(c.events.length, 0);
      assert.equal(c.wire.queries.length, 0);
      c.m.dispose();
      c.m.dispose();
      assert.equal(c.m.disposed, true);
      state(c, "idle", null);
      assert.equal(c.events.length, 0);
      await sdkAlive(c);
    }),
);
add(
  "not-ready",
  "ownership",
  { ready: false },
  "constructor synchronously preserves SDK snapshot error identity before options",
  () =>
    using(
      async (c) => {
        let original,
          descriptor,
          proto = c.client;
        while (!descriptor && proto) {
          descriptor = Object.getOwnPropertyDescriptor(proto, "snapshot");
          proto = Object.getPrototypeOf(proto);
        }
        assert.ok(descriptor?.get);
        Object.defineProperty(c.client, "snapshot", {
          configurable: true,
          get() {
            try {
              return Reflect.apply(descriptor.get, this, []);
            } catch (e) {
              original = e;
              throw e;
            }
          },
        });
        let probes = 0;
        const opts = new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              probes++;
              throw Error("forbidden");
            },
          },
        );
        assert.throws(
          () => new vm.SourceCandidatesModel(c.client, opts),
          (e) => original !== undefined && e === original,
        );
        assert.equal(probes, 0);
        assert.equal(c.wire.queries.length, 0);
      },
      { withModel: false, ready: false },
    ),
);
add(
  "original-pages",
  "pages",
  { count: 5, limit: 3 },
  "all occurrence order/identities/extensions preserved; one page per command; frozen wrappers and old state stable",
  () =>
    using(
      async (c) => {
        const items = [
          hit(2),
          hit(0),
          { ...hit(0), kind: "instantiation" },
          { ...hit(0), inst: "another-occurrence" },
          hit(1),
        ];
        const t = await begin(c);
        assert.deepEqual(t.q.params, {
          file: Q.file,
          line: 7,
          limit: 3,
          cursor: "",
        });
        assert.equal("snapshotId" in t.q.params, false);
        await finish(c, t, page(items.slice(0, 3), "B-cursor/opaque"));
        const first = c.m.state,
          reply = first.pages[0];
        assert.deepEqual(reply.result.items, items.slice(0, 3));
        assert.equal(c.calls.length, 1);
        assert.equal(c.events.length, 2);
        assert.notEqual(first.query, Q);
        assert.deepEqual(first.query, Q);
        const more = await begin(c, Q, "loadMore");
        assert.deepEqual(more.q.params, {
          file: Q.file,
          line: 7,
          limit: 3,
          cursor: "B-cursor/opaque",
        });
        assert.equal(c.m.state.pages[0], reply);
        await finish(c, more, page(items.slice(3)));
        const s = state(c, "success", Q);
        assert.equal(s.pages.length, 2);
        assert.equal(s.pages[0], reply);
        assert.deepEqual(
          s.pages.flatMap((p) => p.result.items),
          items,
        );
        assert.equal(s.pages[0].result.items[0], reply.result.items[0]);
        assert.equal(
          s.pages[0].result.items[0].span,
          reply.result.items[0].span,
        );
        assert.equal(first.pages.length, 1);
        assert.equal(c.calls.length, 2);
        const n = c.events.length;
        await success(invoke(c, "loadMore"));
        await success(invoke(c, "load", { ...Q }));
        await success(invoke(c, "cancel"));
        assert.equal(c.m.state, s);
        assert.equal(c.events.length, n);
        assert.equal(c.calls.length, 2);
      },
      { options: { pageSize: 3 } },
    ),
);
for (const nonempty of [false, true])
  for (const next of [false, true])
    for (const prefix of [false, true])
      add(
        "partial-" + [nonempty, next, prefix].join("-"),
        "partial",
        { nonempty, next, prefix },
        "partial success preserves full metadata; loadMore/same-load no-op; reload starts without cursor",
        () =>
          using(async (c) => {
            if (prefix)
              await finish(c, await begin(c), page([hit()], "B-first"));
            const t = await begin(c, Q, prefix ? "loadMore" : "load");
            await finish(
              c,
              t,
              page(
                nonempty ? [hit(1)] : [],
                next ? "B-partial-next" : undefined,
              ),
              partial,
            );
            const s = c.m.state,
              r = s.pages.at(-1),
              n = c.calls.length;
            assert.deepEqual(r.completeness, partial);
            await success(invoke(c, "loadMore"));
            await success(invoke(c, "load", { ...Q }));
            assert.equal(c.m.state, s);
            assert.equal(c.calls.length, n);
            // No automatic index.ready handling in this raw model.
            c.wire.emit({ event: "index", state: "ready" });
            await tick();
            assert.equal(c.calls.length, n);
            assert.equal(c.registrations, 0);
            const reload = await begin(c, Q, "reload");
            firstRequest(c, reload);
            assert.equal(c.m.state.pages.length, 0);
            await finish(c, reload, page([]));
            assert.equal(c.m.state.pages.length, 1);
          }),
      );
for (const prefix of [false, true])
  add(
    "empty-complete-" + prefix,
    "pages",
    { prefix },
    "complete empty page legal, no-next no-op; old prefix retained",
    () =>
      using(async (c) => {
        if (prefix) await finish(c, await begin(c), page([hit()], "B-last"));
        const t = await begin(c, Q, prefix ? "loadMore" : "load");
        await finish(c, t, page([]));
        const s = c.m.state,
          n = c.calls.length;
        assert.equal(s.pages.length, prefix ? 2 : 1);
        await success(invoke(c, "loadMore"));
        assert.equal(c.m.state, s);
        assert.equal(c.calls.length, n);
      }),
  );
for (const bad of [
  "oversize-first",
  "oversize-next",
  "same-request",
  "earlier-next",
])
  add(
    "bad-page-" + bad,
    "paging-errors",
    { bad, limit: 2 },
    "inconsistent_reply; no bad-page/cursor registration; preserve prefix; retry exact pending cursor",
    () =>
      using(
        async (c) => {
          if (bad !== "oversize-first")
            await finish(c, await begin(c), page([hit()], "B-one"));
          if (bad === "earlier-next")
            await finish(
              c,
              await begin(c, Q, "loadMore"),
              page([hit(1)], "B-two"),
            );
          const old = [...c.m.state.pages],
            t = await begin(
              c,
              Q,
              bad === "oversize-first" ? "load" : "loadMore",
            ),
            expectedCursor = t.q.params.cursor;
          const value = bad.startsWith("oversize")
            ? page([hit(0), hit(1), hit(2)], "B-unused")
            : page([hit(2)], bad === "same-request" ? expectedCursor : "B-one");
          c.wire.ok(t.q, value);
          local(await failure(t.o, "inconsistent_reply"), "inconsistent_reply");
          state(c, "failed", Q, old);
          const retry = await begin(c, Q, "loadMore");
          assert.equal(retry.q.params.cursor, expectedCursor);
          assert.equal(retry.q.params.limit, 2);
          await finish(c, retry, page([hit(7)], "B-unused"));
          assert.equal(c.m.state.pages.length, old.length + 1);
          const next = await begin(c, Q, "loadMore");
          assert.equal(next.q.params.cursor, "B-unused");
          await finish(c, next, page([]));
        },
        { options: { pageSize: 2 } },
      ),
  );
for (const stage of ["first", "next"])
  for (const code of ["not_found", "bad_request", "cancelled", "stale_cursor"])
    add(
      "core-error-" + stage + "-" + code,
      "errors",
      { stage, code },
      "original HierError identity and diagnostic; retain prefix; no implicit retry; stale loadMore same object/no query",
      () =>
        using(async (c) => {
          if (stage === "next")
            await finish(c, await begin(c), page([hit()], "B-next"));
          const old = [...c.m.state.pages],
            t = await begin(c, Q, stage === "next" ? "loadMore" : "load");
          c.wire.fail(t.q, code);
          const e = await failure(t.o, code);
          assert.ok(e instanceof sdk.HierError);
          assert.equal(e, c.calls.at(-1).error);
          state(c, code === "cancelled" ? "cancelled" : "failed", Q, old);
          assert.equal(c.m.state.error.code, code);
          assert.equal(c.m.state.error.origin, "core");
          assert.deepEqual(c.m.state.error.data, e.data);
          assert.notEqual(c.m.state.error.data, e.data);
          const n = c.calls.length;
          await tick();
          assert.equal(c.calls.length, n);
          if (code === "stale_cursor") {
            assert.equal(await failure(invoke(c, "loadMore"), code), e);
            assert.equal(c.calls.length, n);
            const r = await begin(c, Q, "reload");
            firstRequest(c, r);
            assert.equal(c.m.state.pages.length, 0);
            await finish(c, r, page());
          } else {
            const r = await begin(c, Q, "loadMore");
            assert.equal(r.q.params.cursor, t.q.params.cursor);
            await finish(c, r, page());
          }
        }),
    );
for (const recovery of ["load", "reload", "clear-load"])
  add(
    "reset-history-" + recovery,
    "paging-errors",
    { recovery },
    "new page chain permits previously used cursor; load after failed clears prefix; clear idle",
    () =>
      using(async (c) => {
        await finish(c, await begin(c), page([hit()], "B-reusable"));
        const t = await begin(c, Q, "loadMore");
        c.wire.fail(t.q, "not_found");
        await failure(t.o);
        if (recovery === "clear-load") {
          await success(invoke(c, "clear"));
          state(c, "idle", null);
        }
        const r = await begin(c, Q, recovery === "reload" ? "reload" : "load");
        firstRequest(c, r);
        assert.equal(c.m.state.pages.length, 0);
        await finish(c, r, page([hit()], "B-reusable"));
        await finish(c, await begin(c, Q, "loadMore"), page([]));
      }),
  );
for (const stage of ["first", "next"])
  for (const join of ["load", "loadMore"])
    add(
      "join-" + stage + "-" + join,
      "tasks",
      { stage, join },
      "same value query pending joins even in later page; every waiter settles once; no extra SDK",
      () =>
        using(async (c) => {
          if (stage === "next")
            await finish(c, await begin(c), page([hit()], "B-next"));
          const t = await begin(c, Q, stage === "next" ? "loadMore" : "load"),
            n = c.calls.length;
          const a =
              join === "load"
                ? invoke(c, "load", { ...Q })
                : invoke(c, "loadMore"),
            b = invoke(c, "loadMore");
          assert.equal(c.calls.length, n);
          assert.equal(a.done, false);
          assert.equal(b.done, false);
          await finish(c, t);
          await success(a);
          await success(b);
          assert.equal(c.calls.length, n);
        }),
    );
for (const action of ["cancel", "clear", "reload", "replace"])
  for (const stage of ["first", "next"])
    add(
      "late-" + action + "-" + stage,
      "tasks",
      { action, stage },
      "old waiters cancelled; late reply not publish; latest query owns state; cancels SDK subscription only",
      () =>
        using(async (c) => {
          if (stage === "next")
            await finish(c, await begin(c), page([hit()], "B-next"));
          const t = await begin(c, Q, stage === "next" ? "loadMore" : "load"),
            joined = invoke(c, "loadMore"),
            old = [...c.m.state.pages];
          const other = { ...Q, line: 8 };
          let r;
          if (action === "cancel" || action === "clear") {
            await success(invoke(c, action));
            await failure(t.o, "cancelled");
            await failure(joined, "cancelled");
            state(
              c,
              action === "cancel" ? "cancelled" : "idle",
              action === "cancel" ? Q : null,
              action === "cancel" ? old : [],
            );
            r = await begin(c, other);
          } else {
            r = await begin(
              c,
              action === "replace" ? other : Q,
              action === "replace" ? "load" : "reload",
            );
            await failure(t.o, "cancelled");
            await failure(joined, "cancelled");
            assert.equal(c.m.state.pages.length, 0);
          }
          const before = c.m.state,
            n = c.events.length;
          c.wire.ok(t.q, page([hit(99)], "B-stale"));
          await tick();
          assert.equal(c.m.state, before);
          assert.equal(c.events.length, n);
          await finish(c, r, page([hit(7)]));
          assert.deepEqual(c.m.state.query, action === "reload" ? Q : other);
          assert.equal(c.m.state.pages.length, 1);
          assert.ok(c.wire.cancels.some((x) => x.params.target === t.q.id));
        }),
    );
for (const mode of ["sync", "reject"])
  add(
    "unexpected-" + mode,
    "errors",
    { mode },
    "non-HierError query throw/rejection => inconsistent_reply with original cause, no later query",
    () =>
      using(async (c) => {
        const original = { B: "unexpected" },
          call = c.client.resolveSource;
        c.client.resolveSource = () => {
          if (mode === "sync") throw original;
          return Promise.reject(original);
        };
        const o = invoke(c, "load", Q),
          e = await failure(o, "inconsistent_reply");
        local(e, "inconsistent_reply");
        assert.equal(e.cause, original);
        state(c, "failed", Q);
        assert.equal(c.m.state.error.origin, "source_candidates");
        assert.deepEqual(c.m.state.error.data, {});
        c.client.resolveSource = call;
      }),
  );
for (const method of ["load", "loadMore", "reload", "cancel", "clear"])
  add(
    "disposed-" + method,
    "ownership",
    { method },
    "disposed Promise rejection precedes input validation; no probes/query/notification",
    () =>
      using(async (c) => {
        c.m.dispose();
        let probes = 0;
        const input = new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              probes++;
              throw 7;
            },
          },
        );
        local(await failure(invoke(c, method, input), "disposed"), "disposed");
        assert.equal(probes, 0);
        state(c, "idle", null);
        assert.throws(
          () => c.m.subscribe(null),
          (e) => e.code === "disposed",
        );
        assert.equal(c.events.length, 0);
      }),
  );

for (const col of [false, true])
  add(
    "sdk-call-boundary-" + col,
    "pages",
    { col },
    "SDK receives byte query only, fixed limit, opaque cursor and owned AbortSignal; no document/read/instances queries",
    () =>
      using(
        async (c) => {
          const query = {
            ...Q,
            ...(col ? { col: 2 } : {}),
            extension: "ignored",
          };
          const t = await begin(c, query),
            call = c.calls[0];
          assert.deepEqual(call.args[0], {
            file: Q.file,
            line: Q.line,
            ...(col ? { col: 2 } : {}),
          });
          assert.deepEqual(call.args[1], { limit: 2 });
          assert.ok(call.args[2] instanceof AbortSignal);
          assert.equal(call.args[2].aborted, false);
          await finish(c, t, page([hit()], "B-next"));
          const r = await begin(c, query, "loadMore"),
            next = c.calls[1];
          assert.deepEqual(next.args[0], call.args[0]);
          assert.deepEqual(next.args[1], { limit: 2, cursor: "B-next" });
          assert.ok(next.args[2] instanceof AbortSignal);
          await finish(c, r, page([]));
          assert.equal(c.registrations, 0);
          assert.ok(c.calls.every((x) => x.method === "resolveSource"));
        },
        { options: { pageSize: 2 } },
      ),
  );
