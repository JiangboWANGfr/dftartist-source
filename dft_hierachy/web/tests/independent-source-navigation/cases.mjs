import assert from "node:assert/strict";
import {
  H,
  C,
  methods,
  using,
  context,
  call,
  ok,
  bad,
  navError,
  positionError,
  invariant,
  snapshot,
  unchanged,
  document,
  documentStart,
  documentFinish,
  candidateStart,
  candidateFinish,
  turn,
  noAuto,
  ready,
  sdkAlive,
  hit,
  complete,
  partial,
} from "./harness.mjs";
import {
  impostors,
  badOffsets,
  hostile,
  mixedText,
  mixedBoundaries,
  bomText,
  bomBoundaries,
} from "./fixtures.mjs";
export const cases = [];
export function add(
  id,
  group,
  input,
  expected,
  run,
  basis = "DESIGN §6.13.1–4",
) {
  cases.push({ id: "SN-" + id, group, input, expected, basis, run });
}
add(
  "construction",
  "ownership",
  "ready SDK/default options",
  "idle/null/null; frozen state; exactly one SDK ready registration; no query; dispose releases subscription, not SDK",
  () =>
    using(async (c) => {
      const s = invariant(c);
      assert.equal(s.document.status, "idle");
      assert.equal(s.candidates, null);
      assert.equal(s.refresh, null);
      assert.equal(c.wire.queries.length, 0);
      assert.equal(c.readyTokens.size, 1);
      assert.equal(c.m.disposed, false);
      assert.equal(c.m.snapshotId, c.client.snapshot.snapshotId);
      c.m.dispose();
      c.m.dispose();
      assert.equal(c.m.disposed, true);
      assert.equal(c.readyTokens.size, 0);
      assert.equal(c.m.state.document.status, "idle");
      assert.equal(c.m.state.candidates, null);
      assert.equal(c.m.state.refresh, null);
      await sdkAlive(c);
    }),
);
add(
  "not-ready-first",
  "ownership",
  "not-ready SDK + poisonous options",
  "original snapshot readiness error before probing options or subscribing",
  () =>
    using(
      async (c) => {
        let original,
          proto = c.client,
          d;
        while (!d && proto) {
          d = Object.getOwnPropertyDescriptor(proto, "snapshot");
          proto = Object.getPrototypeOf(proto);
        }
        let probes = 0;
        Object.defineProperty(c.client, "snapshot", {
          configurable: true,
          get() {
            try {
              return Reflect.apply(d.get, this, []);
            } catch (e) {
              original = e;
              throw e;
            }
          },
        });
        const options = new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              probes++;
              throw Error("forbidden options");
            },
          },
        );
        assert.throws(
          () => c.make(options),
          (e) => original !== undefined && e === original,
        );
        assert.equal(probes, 0);
        assert.equal(c.readyTokens.size, 0);
        assert.equal(c.wire.queries.length, 0);
      },
      { withModel: false, ready: false },
    ),
);
for (const [name, value] of [
  ["null", null],
  ["array", []],
  ["function", () => {}],
  ["number", 7],
  ["string", "x"],
  ["bool", false],
])
  add(
    "bad-options-" + name,
    "options",
    name,
    "SourceCandidatesError invalid_options, no SDK query/registration",
    () =>
      using(
        async (c) => {
          assert.throws(
            () => c.make(value),
            (e) =>
              e instanceof H.vm.SourceCandidatesError &&
              e.code === "invalid_options",
          );
          assert.equal(c.readyTokens.size, 0);
          assert.equal(c.wire.queries.length, 0);
        },
        { withModel: false },
      ),
  );
for (const [name, value] of [
  ["zero", 0],
  ["negative", -1],
  ["fraction", 1.5],
  ["string", "1"],
  ["undefined", undefined],
  ["nan", NaN],
  ["infinity", Infinity],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1],
])
  add(
    "bad-page-size-" + name,
    "options",
    name,
    "same pageSize primitive/limit validation as existing Candidates; no subscriptions",
    () =>
      using(
        async (c) => {
          assert.throws(
            () => c.make({ pageSize: value }),
            (e) =>
              e instanceof H.vm.SourceCandidatesError &&
              e.code === "invalid_options",
          );
          assert.equal(c.readyTokens.size, 0);
        },
        { withModel: false },
      ),
  );
for (const size of [1, 2, 200])
  add(
    "page-size-" + size,
    "options",
    { size },
    "configured first page limit, original SDK Reply and no flattened items",
    () =>
      using(
        async (c) => {
          const d = await document(c),
            t = await candidateStart(c, d);
          assert.equal(t.q.params.limit, size);
          assert.equal(t.q.params.cursor, "");
          const b = await candidateFinish(c, t);
          assert.equal("items" in b, false);
          assert.equal("pages" in b, false);
        },
        { options: { pageSize: size } },
      ),
  );
add(
  "options-projection",
  "options",
  "one own pageSize getter, poisonous prototype/extension/enumeration",
  "descriptor/Get once; no inherited/extra probes",
  () =>
    using(
      async (c) => {
        const log = [];
        const options = new Proxy(
          {
            get pageSize() {
              log.push("getter");
              return 2;
            },
            get ignored() {
              throw Error("no extension");
            },
          },
          {
            getOwnPropertyDescriptor(t, k) {
              log.push("has:" + String(k));
              return Reflect.getOwnPropertyDescriptor(t, k);
            },
            get(t, k, r) {
              log.push("get:" + String(k));
              return Reflect.get(t, k, r);
            },
            ownKeys() {
              throw Error("no enum");
            },
            getPrototypeOf() {
              throw Error("no proto");
            },
          },
        );
        c.m = c.make(options);
        assert.deepEqual(log, ["has:pageSize", "get:pageSize", "getter"]);
      },
      { withModel: false },
    ),
);
for (const site of ["descriptor", "get"])
  add(
    "options-throw-" + site,
    "options",
    site,
    "invalid_options cause exactly original unknown value; SDK remains live",
    () =>
      using(
        async (c) => {
          const value = hostile().value;
          const options =
            site === "descriptor"
              ? new Proxy(
                  {},
                  {
                    getOwnPropertyDescriptor() {
                      throw value;
                    },
                  },
                )
              : {
                  get pageSize() {
                    throw value;
                  },
                };
          assert.throws(
            () => c.make(options),
            (e) =>
              e instanceof H.vm.SourceCandidatesError &&
              e.code === "invalid_options" &&
              e.cause === value,
          );
          assert.equal(c.readyTokens.size, 0);
          await sdkAlive(c);
        },
        { withModel: false },
      ),
  );
add(
  "sdk-subscription-failure",
  "ownership",
  "public SDK registration throws after constructor validation",
  "failed constructor does not close borrowed SDK or send queries",
  () =>
    using(
      async (c) => {
        c.client.onIndexReady = () => {
          throw Error("B injected registration failure");
        };
        assert.throws(() => c.make());
        assert.equal(c.wire.queries.length, 0);
        assert.equal(c.readyTokens.size, 0);
        await sdkAlive(c);
      },
      { withModel: false },
    ),
);
for (const method of [
  "reloadDocument",
  "cancelDocument",
  "clear",
  "loadMore",
  "reloadCandidates",
  "cancelCandidates",
])
  add(
    "idle-noop-" + method,
    "noops",
    method,
    "Promise resolves; no observable changes/SDK calls",
    () =>
      using(async (c) => {
        const s = snapshot(c);
        await ok(call(c, method));
        unchanged(c, s);
      }),
  );
for (const method of methods)
  add(
    "disposed-" + method,
    "priority",
    method,
    "Navigation disposed Promise rejection before poisonous inputs; no new task",
    () =>
      using(async (c) => {
        c.m.dispose();
        const h = hostile(),
          before = snapshot(c);
        const e = await bad(
          call(
            c,
            method,
            ...(method === "load"
              ? [h.value, h.value]
              : method === "locate"
                ? [h.value, h.value]
                : []),
          ),
          "disposed",
        );
        navError(e, "disposed");
        assert.equal(h.counts.probes, 0);
        assert.equal(Object.hasOwn(e, "cause"), false);
        unchanged(c, before);
      }),
  );
const invalidLoad = [
  ...[undefined, null, 7, [], {}, new String("B"), ""].map((v, i) => [
    "ref-" + i,
    v,
    "definition",
  ]),
  ...[undefined, null, 7, "", "invalid-kind"].map((v, i) => [
    "kind-" + i,
    "B-nav-target",
    v,
  ]),
];
for (const pending of [false, true])
  for (const [id, ref, kind] of invalidLoad)
    add(
      "load-invalid-" + pending + "-" + id,
      "binding-input",
      { pending, id },
      "SourceDocumentError invalid_argument; old binding/pages/task/refresh retained",
      () =>
        using(async (c) => {
          const d = await document(c),
            t = await candidateStart(c, d);
          if (!pending) await candidateFinish(c, t);
          const before = snapshot(c);
          const e = await bad(call(c, "load", ref, kind), "invalid_argument");
          assert.ok(e instanceof H.vm.SourceDocumentError);
          unchanged(c, before);
          if (pending) await candidateFinish(c, t);
        }),
    );
for (const pending of [false, true])
  for (const sample of impostors({}))
    add(
      "locate-foreign-" + pending + "-" + sample.id,
      "binding-input",
      { pending, shape: sample.id },
      "SourcePositionError stale_document; zero external probes; old query remains",
      () =>
        using(async (c) => {
          const d = await document(c),
            t = await candidateStart(c, d);
          if (!pending) await candidateFinish(c, t);
          const current = impostors(d).find((x) => x.id === sample.id),
            before = snapshot(c);
          positionError(
            await bad(
              call(c, "locate", current.value, hostile().value),
              "stale_document",
            ),
            "stale_document",
          );
          assert.equal(current.counts.probes, 0);
          unchanged(c, before);
          if (pending) await candidateFinish(c, t);
        }),
    );
for (const changed of [false, true])
  for (const [name] of badOffsets().values)
    add(
      "offset-" + changed + "-" + name,
      "binding-input",
      { changed, offset: name },
      "changed before offset; otherwise primitive/scalar/CRLF invalid_argument; no coercion",
      () =>
        using(async (c) => {
          const d = await document(c, undefined, changed),
            set = badOffsets(),
            v = set.values.find((x) => x[0] === name)[1],
            before = snapshot(c),
            code = changed ? "changed_document" : "invalid_argument";
          positionError(await bad(call(c, "locate", d, v), code), code);
          assert.equal(set.counts.probes, 0);
          unchanged(c, before);
        }),
    );
for (const [id, text, table] of [
  ["mixed", mixedText, mixedBoundaries],
  ["bom", bomText, bomBoundaries],
])
  for (const [, line, col, offset] of table)
    add(
      "point-" + id + "-" + offset,
      "coordinates",
      { text: id, offset, line, col },
      "original document and explicit UTF8 byte point; legal outside span; queryAt semantics unchanged",
      () =>
        using(async (c) => {
          const d = await document(c, text),
            t = await candidateStart(c, d, offset);
          assert.deepEqual(t.q.params, {
            file: d.source.result.file,
            line,
            col,
            limit: 200,
            cursor: "",
          });
          await candidateFinish(c, t, { items: [] });
          assert.ok(c.m.state.candidates.utf16Offset === offset);
        }),
    );
add(
  "pending-join",
  "binding",
  "two same document/offset locate calls",
  "one SDK subscription; each caller settles once; same binding",
  () =>
    using(async (c) => {
      const d = await document(c),
        t = await candidateStart(c, d),
        n = c.calls.length,
        o = call(c, "locate", d, -0);
      assert.equal(c.calls.length, n);
      await candidateFinish(c, t);
      await ok(o);
    }),
);
add(
  "success-noop",
  "binding",
  "same target load and same binding locate, zero/-zero",
  "same state/document/pages, no calls or notifications",
  () =>
    using(async (c) => {
      const d = await document(c);
      await candidateFinish(c, await candidateStart(c, d));
      const before = snapshot(c);
      await ok(call(c, "load", "B-nav-target", "definition"));
      await ok(call(c, "locate", d, -0));
      await ok(call(c, "cancelDocument"));
      unchanged(c, before);
    }),
);
add(
  "document-join",
  "binding",
  "same pending document load",
  "join existing source/read task; all callers settle once",
  () =>
    using(async (c) => {
      const t = await documentStart(c),
        o = call(c, "load", "B-nav-target", "definition"),
        n = c.wire.queries.length;
      assert.equal(n, 1);
      await documentFinish(c, t);
      await ok(o);
    }),
);
for (const method of ["clear", "reloadDocument", "retarget"])
  for (const nextPage of [false, true])
    add(
      "invalidate-" + method + "-" + nextPage,
      "atomic-invalidation",
      { method, nextPage },
      "new document pending/clear has no old binding/refresh/pages; old late reply cannot reattach",
      () =>
        using(async (c) => {
          const d = await document(c);
          let t = await candidateStart(c, d);
          if (nextPage) {
            await candidateFinish(c, t, { next: "B-nav-next" });
            t = await candidateStart(c, d, 0, "loadMore");
          }
          let dt, o;
          if (method === "clear") o = call(c, "clear");
          else
            dt =
              method === "retarget"
                ? await documentStart(c, "load", "B-nav-other")
                : await documentStart(c, "reloadDocument");
          assert.equal(c.m.state.candidates, null);
          assert.equal(c.m.state.refresh, null);
          await bad(t.o, "cancelled");
          c.wire.ok(t.q, C.page([hit(2)]));
          await turn();
          assert.equal(c.m.state.candidates, null);
          if (dt) {
            const newer = await documentFinish(c, dt);
            assert.notEqual(newer, d);
            positionError(
              await bad(call(c, "locate", d, 0), "stale_document"),
              "stale_document",
            );
            assert.equal(c.m.state.candidates, null);
          } else await ok(o);
        }),
    );
add(
  "different-point",
  "binding",
  "pending point0 replaced by same document point1",
  "new pending has new binding/empty pages; prior waiter cancelled, late page ignored",
  () =>
    using(async (c) => {
      const d = await document(c),
        t = await candidateStart(c, d),
        u = await candidateStart(c, d, 1);
      assert.equal(c.m.state.candidates.utf16Offset, 1);
      assert.deepEqual(c.m.state.candidates.state.pages, []);
      await bad(t.o, "cancelled");
      c.wire.ok(t.q, C.page([hit(2)]));
      await candidateFinish(c, u);
      assert.equal(c.m.state.candidates.state.pages.length, 1);
    }),
);
add(
  "new-document-same-query",
  "binding",
  "reload same text/hash/file, then locate same point",
  "new document cannot inherit prior pages even identical query fields",
  () =>
    using(async (c) => {
      const d = await document(c);
      await candidateFinish(c, await candidateStart(c, d), { next: "B-old" });
      const pages = c.m.state.candidates.state.pages,
        newer = await documentFinish(
          c,
          await documentStart(c, "reloadDocument"),
        );
      assert.notEqual(newer, d);
      const t = await candidateStart(c, newer);
      assert.deepEqual(c.m.state.candidates.state.pages, []);
      await candidateFinish(c, t, { items: [hit(2)] });
      assert.notEqual(c.m.state.candidates.state.pages, pages);
      assert.equal(c.m.state.candidates.document, newer);
    }),
);
add(
  "cross-model-document",
  "binding",
  "two same-SDK owned coordinators, same text",
  "foreign wrapper stale even if snapshot/file/text equal",
  () =>
    using(async (c) => {
      const d = await document(c),
        other = c.make();
      const saved = c.m;
      c.m = other;
      const second = await document(c);
      c.m = saved;
      positionError(
        await bad(call(c, "locate", second, 0), "stale_document"),
        "stale_document",
      );
      assert.equal(c.m.state.document.data, d);
    }),
);
for (const mode of ["complete-next", "complete-end", "partial"])
  add(
    "load-more-" + mode,
    "pages",
    mode,
    "at most one next complete page, no auto paging partial/exhausted; original page Reply retained",
    () =>
      using(async (c) => {
        const d = await document(c);
        await candidateFinish(c, await candidateStart(c, d), {
          next:
            mode.endsWith("next") || mode === "partial" ? "B-next" : undefined,
          completeness: mode === "partial" ? partial : complete,
        });
        const old = c.m.state.candidates.state.pages[0];
        if (mode === "complete-next") {
          const t = await candidateStart(c, d, 0, "loadMore");
          assert.equal(t.q.params.cursor, "B-next");
          await candidateFinish(c, t, { items: [hit(1)] });
          assert.equal(c.m.state.candidates.state.pages[0], old);
          assert.equal(c.m.state.candidates.state.pages.length, 2);
        } else {
          const before = snapshot(c);
          await ok(call(c, "loadMore"));
          unchanged(c, before);
        }
      }),
  );
add(
  "page-stale-cursor",
  "pages",
  "second page Core stale_cursor",
  "original HierError; failed prefix retained, loadMore repeats original failure until explicit retry",
  () =>
    using(async (c) => {
      const d = await document(c);
      await candidateFinish(c, await candidateStart(c, d), { next: "B-next" });
      const first = c.m.state.candidates.state.pages[0],
        t = await candidateStart(c, d, 0, "loadMore");
      c.wire.fail(t.q, "stale_cursor");
      const e = await bad(t.o, "stale_cursor");
      assert.equal(
        e,
        c.calls.findLast((x) => x.method === "resolveSource").error,
      );
      assert.equal(c.m.state.candidates.state.pages[0], first);
      assert.equal(await bad(call(c, "loadMore")), e);
      const u = await candidateStart(c, d, 0, "reloadCandidates");
      assert.equal(u.q.params.cursor, "");
      await candidateFinish(c, u);
    }),
);
add(
  "candidate-cancel-prefix",
  "pages",
  "pending next page cancelCandidates",
  "cancelled waiter/prefix retained, document unchanged, future ready paused",
  () =>
    using(async (c) => {
      const d = await document(c);
      await candidateFinish(c, await candidateStart(c, d), { next: "B-next" });
      const first = c.m.state.candidates.state.pages[0],
        t = await candidateStart(c, d, 0, "loadMore");
      await ok(call(c, "cancelCandidates"));
      await bad(t.o, "cancelled");
      assert.equal(c.m.state.document.data, d);
      assert.equal(c.m.state.candidates.state.status, "cancelled");
      assert.equal(c.m.state.candidates.state.pages[0], first);
      ready(c);
      await noAuto(c);
    }),
);
for (const stage of ["source", "readSource"])
  for (const outcome of ["failed", "cancelled"])
    add(
      "new-document-terminal-" + stage + "-" + outcome,
      "atomic-invalidation",
      { stage, outcome },
      "new document task failure/cancel leaves old binding absent; no late source/read reply or ready can restore it",
      () =>
        using(async (c) => {
          const old = await document(c);
          await candidateFinish(c, await candidateStart(c, old));
          const t = await documentStart(c, "reloadDocument");
          let q = t.q;
          if (stage === "readSource") {
            c.wire.ok(q, H.span(H.point(0), H.point(0)));
            q = await c.wire.next("source.read");
          }
          if (outcome === "failed") {
            c.wire.fail(q, "not_found");
            await bad(t.o, "not_found");
          } else {
            await ok(call(c, "cancelDocument"));
            await bad(t.o, "cancelled");
            c.wire.ok(
              q,
              stage === "source" ? H.span(H.point(0), H.point(0)) : H.read(),
            );
          }
          assert.equal(c.m.state.candidates, null);
          assert.equal(c.m.state.refresh, null);
          assert.equal(c.m.state.document.status, outcome);
          positionError(
            await bad(call(c, "locate", old, 0), "stale_document"),
            "stale_document",
          );
          ready(c);
          await noAuto(c);
        }),
    );
add(
  "same-ref-new-kind",
  "binding",
  "same ref but instantiation instead of definition",
  "new document pending clears prior binding, not same-target no-op",
  () =>
    using(async (c) => {
      const d = await document(c);
      await candidateFinish(c, await candidateStart(c, d));
      const t = await documentStart(c, "load", "B-nav-target", "instantiation");
      const next = await documentFinish(c, t);
      assert.notEqual(next, d);
      assert.equal(c.m.state.candidates, null);
    }),
);
add(
  "inherited-options-ignored",
  "options",
  "inherited poisonous pageSize getter",
  "default200; inherited fields not read",
  () =>
    using(
      async (c) => {
        let reads = 0;
        const opts = Object.create({
          get pageSize() {
            reads++;
            throw Error("forbidden inherited");
          },
        });
        c.m = c.make(opts);
        assert.equal(reads, 0);
        const d = await document(c),
          t = await candidateStart(c, d);
        assert.equal(t.q.params.limit, 200);
        await candidateFinish(c, t);
      },
      { withModel: false },
    ),
);
