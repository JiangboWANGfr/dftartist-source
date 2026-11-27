import assert from "node:assert/strict";
import {
  N,
  vm,
  codes,
  using,
  ready,
  hit,
  issue,
  local,
  selectedError,
  noWrites,
  confirm,
  expected,
  poison,
  selection,
  republish,
} from "./harness.mjs";
export const cases = [];
export const add = (
  id,
  group,
  input,
  expected,
  run,
  basis = "DESIGN §6.17; §6.5/6.11–6.16 unchanged",
) => cases.push({ id, group, input, expected, basis, run });
add(
  "errors",
  "surface",
  "nine local error codes",
  "public Error subtype; exact code, nonempty message",
  async () => {
    for (const code of codes) {
      const e = new (vm().SourceConfirmationError)(code, "B");
      assert.ok(e instanceof Error);
      assert.equal(e.code, code);
      assert.ok(e.message);
    }
  },
);
for (const refKind of ["object", "definition"])
  for (const kind of ["definition", "instantiation", "statement"])
    for (const instance of [false, true])
      add(
        "mapping-" + refKind + "-" + kind + "-" + instance,
        "mapping",
        { refKind, kind, instance },
        "one exact ref/def by refKind, origin source, snapshot; no inst/kind inference; no nav/SDK writes",
        () =>
          using(async (c) => {
            const h = hit(refKind, 0, {
              kind,
              ...(instance ? { inst: "B/not-the-address" } : {}),
            });
            const { page } = await ready(c, { items: [h] });
            const a = issue(c, page);
            assert.equal(confirm(c, a), 1);
            assert.deepEqual(c.s.current, expected(c, h));
            assert.equal(c.s.canGoBack, true);
            c.s.back();
            assert.deepEqual(c.s.current.items, []);
            c.s.forward();
            assert.deepEqual(c.s.current, expected(c, h));
          }),
      );
for (const mode of ["partial", "complete", "allOccurrences"])
  add(
    "explicit-slot-" + mode,
    "mapping",
    mode,
    "never auto select/first item/multi selection; original partial/occurrence fields remain",
    () =>
      using(async (c) => {
        const items = [
          hit("definition", 0, { allOccurrences: true, instanceCount: 999 }),
          hit("object", 1, { inst: "B/another" }),
        ];
        const { page } = await ready(c, {
          items,
          completeness: mode === "partial" ? N.partial : N.complete,
        });
        assert.deepEqual(c.s.current.items, []);
        const before = JSON.stringify(page),
          a = issue(c, page, 1);
        assert.equal(confirm(c, a), 1);
        assert.deepEqual(c.s.current, expected(c, items[1]));
        assert.equal(JSON.stringify(page), before);
        assert.equal(c.m.state.candidates.state.pages[0], page);
      }),
  );
add(
  "action-shape",
  "issuance",
  "original page, -0",
  "shallow frozen, original page and normalized primitive slot, no copied facts/public commands",
  () =>
    using(async (c) => {
      const { page } = await ready(c);
      const a = noWrites(c, () => issue(c, page, -0));
      assert.ok(Object.isFrozen(a));
      assert.equal(a.page, page);
      assert.equal(a.itemIndex, 0);
      assert.equal(Object.is(a.itemIndex, -0), false);
      N.H.deep(page);
      assert.throws(() => {
        a.itemIndex = 1;
      }, TypeError);
      assert.throws(() => {
        a.page = {};
      }, TypeError);
    }),
);
for (const [id, value] of [
  ["undefined", undefined],
  ["null", null],
  ["negative", -1],
  ["fraction", 0.1],
  ["nan", NaN],
  ["infinity", Infinity],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ["length", 2],
  ["string", "0"],
  ["bigint", 0n],
  ["symbol", Symbol("B")],
  ["boxed", new Number(0)],
])
  add(
    "index-" + id,
    "issuance",
    { index: id },
    "invalid_index; no changes, no coercion, same chain usable",
    () =>
      using(async (c) => {
        await ready(c, { items: [hit(), hit("object", 1)] });
        noWrites(c, () =>
          local(() => issue(c, undefined, value), "invalid_index"),
        );
        confirm(c, issue(c));
      }),
  );
add(
  "index-poison",
  "issuance",
  "hostile index with conversion hooks",
  "invalid_index before any property/coercion; no writes",
  () =>
    using(async (c) => {
      await ready(c);
      const h = poison();
      noWrites(c, () =>
        local(() => issue(c, undefined, h.value), "invalid_index"),
      );
      assert.equal(h.counts.probes, 0);
      confirm(c, issue(c));
    }),
);
for (const form of [
  "null",
  "result",
  "copy",
  "proxy",
  "revoked",
  "hostile",
  "inheriting",
  "foreign",
])
  add(
    "page-" + form,
    "issuance",
    { form },
    "invalid_page identity before invalid_index; zero input probes, no writes",
    () =>
      using(async (c) => {
        const { page } = await ready(c);
        let q;
        const h = poison();
        if (form === "null") q = null;
        if (form === "result") q = page.result;
        if (form === "copy") q = { ...page };
        if (form === "proxy") q = new Proxy(page, {});
        if (form === "inheriting") q = Object.create(page);
        if (form === "hostile") q = h.value;
        if (form === "revoked") {
          const r = Proxy.revocable(page, {});
          r.revoke();
          q = r.proxy;
        }
        if (form === "foreign") {
          const saved = c.m;
          c.m = c.make();
          const d = await N.document(c);
          await N.candidateFinish(c, await N.candidateStart(c, d), {
            items: [hit()],
          });
          q = c.m.state.candidates.state.pages[0];
          c.m = saved;
          assert.notEqual(q, page);
        }
        noWrites(c, () => local(() => issue(c, q, h.value), "invalid_page"));
        assert.equal(h.counts.probes, 0);
        confirm(c, issue(c));
      }),
  );
for (const form of [
  "undefined",
  "null",
  "fields",
  "copy",
  "descriptors",
  "proxy",
  "revoked",
  "hostile",
  "inheriting",
  "prototype",
])
  add(
    "action-" + form,
    "authenticity",
    form,
    "invalid_action before target probes; issuer identity not shape/brand/prototype",
    () =>
      using(async (c) => {
        const { page } = await ready(c),
          a = issue(c);
        const h = poison();
        let q;
        if (form === "null") q = null;
        if (form === "fields") q = { page, itemIndex: 0 };
        if (form === "copy") q = { ...a };
        if (form === "descriptors")
          q = Object.create(
            Object.getPrototypeOf(a),
            Object.getOwnPropertyDescriptors(a),
          );
        if (form === "proxy") q = new Proxy(a, {});
        if (form === "hostile") q = h.value;
        if (form === "inheriting") q = Object.create(a);
        if (form === "prototype") q = Object.create(Object.getPrototypeOf(a));
        if (form === "revoked") {
          const r = Proxy.revocable(a, {});
          r.revoke();
          q = r.proxy;
        }
        noWrites(c, () =>
          local(() => c.m.confirmCandidate(q, h.value), "invalid_action"),
        );
        assert.equal(h.counts.probes, 0);
        confirm(c, a);
      }),
  );
for (const phase of [
  "idle",
  "document-pending",
  "document-changed",
  "candidate-pending",
  "candidate-failed",
  "candidate-cancelled",
])
  add(
    "not-ready-" + phase,
    "readiness",
    phase,
    "create not_ready before page/index; confirm invalid_action first; no hostile probes",
    () =>
      using(async (c) => {
        let t;
        if (phase === "document-pending") t = await N.documentStart(c);
        else if (phase !== "idle") {
          const d = await N.document(
            c,
            undefined,
            phase === "document-changed",
          );
          if (!phase.startsWith("document")) {
            t = await N.candidateStart(c, d);
            if (phase === "candidate-failed") {
              c.wire.fail(t.q);
              await N.bad(t.o, "not_found");
            }
            if (phase === "candidate-cancelled") {
              await N.ok(N.call(c, "cancelCandidates"));
              await N.bad(t.o, "cancelled");
            }
          }
        }
        const h = poison();
        noWrites(c, () => local(() => issue(c, h.value, h.value), "not_ready"));
        noWrites(c, () =>
          local(() => c.m.confirmCandidate(h.value, h.value), "invalid_action"),
        );
        assert.equal(h.counts.probes, 0);
      }),
  );
add(
  "missing-ref-kind",
  "mapping",
  "valid legacy hit lacking refKind, invalid target",
  "issuance allowed; address_unavailable before invalid target; no guess/obj.get",
  () =>
    using(async (c) => {
      const h = hit();
      delete h.refKind;
      await ready(c, { items: [h, hit("object", 1)] });
      const a = issue(c),
        p = poison();
      noWrites(c, () =>
        local(() => c.m.confirmCandidate(a, p.value), "address_unavailable"),
      );
      assert.equal(p.counts.probes, 0);
      confirm(c, issue(c, undefined, 1));
    }),
);
for (const mode of [
  "undefined",
  "null",
  "object",
  "select-only",
  "prototype",
  "proxy",
  "revoked",
  "hostile",
])
  add(
    "selection-brand-" + mode,
    "selection-brand",
    mode,
    "invalid_selection_model before custom getters/select; restore guard, valid real target later works",
    () =>
      using(async (c) => {
        await ready(c);
        const a = issue(c),
          p = poison();
        let q;
        if (mode === "null") q = null;
        if (mode === "object") q = {};
        if (mode === "select-only")
          q = {
            get select() {
              p.counts.probes++;
              throw Error("no dispatch");
            },
          };
        if (mode === "prototype")
          q = Object.create(vm().SelectionModel.prototype);
        if (mode === "proxy") q = new Proxy(c.s, {});
        if (mode === "hostile") q = p.value;
        if (mode === "revoked") {
          const r = Proxy.revocable(c.s, {});
          r.revoke();
          q = r.proxy;
        }
        noWrites(c, () =>
          local(() => c.m.confirmCandidate(a, q), "invalid_selection_model"),
        );
        assert.equal(p.counts.probes, 0);
        confirm(c, a);
      }),
  );
add(
  "selection-subclass",
  "selection-brand",
  "real subclass with hostile select/getters",
  "real private-state subclass accepted; original base methods not overridden dispatch",
  () =>
    using(async (c) => {
      let probes = 0;
      class Derived extends vm().SelectionModel {
        get snapshotId() {
          probes++;
          throw Error("no subclass get");
        }
        get disposed() {
          probes++;
          throw Error("no subclass get");
        }
        select() {
          probes++;
          throw Error("no subclass call");
        }
      }
      await ready(c);
      const target = selection(c, { snapshotId: c.m.snapshotId }, Derived);
      assert.equal(c.m.confirmCandidate(issue(c), target), undefined);
      assert.equal(probes, 0);
      const baseCurrent = Object.getOwnPropertyDescriptor(
        vm().SelectionModel.prototype,
        "current",
      ).get.call(target);
      assert.deepEqual(baseCurrent, expected(c, hit()));
    }),
);
for (const mode of ["disposed", "unbound", "wrong-snapshot"])
  add(
    "selection-error-" + mode,
    "selection-error",
    mode,
    "original SelectionError disposed/snapshot_mismatch, no selection/nav writes; guard recovers",
    () =>
      using(async (c) => {
        await ready(c);
        const a = issue(c),
          s =
            mode === "unbound"
              ? selection(c, {})
              : mode === "wrong-snapshot"
                ? selection(c, { snapshotId: "B other" })
                : selection(c);
        if (mode === "disposed") s.dispose();
        const old = s.current;
        noWrites(c, () =>
          selectedError(
            () => c.m.confirmCandidate(a, s),
            mode === "disposed" ? "disposed" : "snapshot_mismatch",
          ),
        );
        assert.equal(s.current, old);
        confirm(c, a);
      }),
  );
add(
  "selection-notification-error",
  "selection-error",
  "target already notifying a different choice",
  "original SelectionError reentrant_change; outer selection unchanged; future confirmation succeeds",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c);
      let called = 0;
      const off = c.s.subscribe(() => {
        called++;
        selectedError(() => c.m.confirmCandidate(a, c.s), "reentrant_change");
      });
      c.s.select({
        items: [{ ref: "B unrelated" }],
        origin: "tree",
        snapshotId: c.m.snapshotId,
      });
      assert.equal(called, 1);
      assert.equal(c.s.current.items[0].ref, "B unrelated");
      off();
      confirm(c, a);
    }),
);
add(
  "selection-input-error",
  "selection-error",
  "confirm from target select input getter",
  "original SelectionError reentrant_change; outer select commits; nav guard restored",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c);
      let count = 0;
      const input = {
        get items() {
          count++;
          selectedError(() => c.m.confirmCandidate(a, c.s), "reentrant_change");
          return [{ ref: "B other" }];
        },
        origin: "tree",
        snapshotId: c.m.snapshotId,
      };
      c.s.select(input);
      assert.equal(count, 1);
      assert.equal(c.s.current.items[0].ref, "B other");
      confirm(c, a);
    }),
);
add(
  "reconfirm-history",
  "history",
  "confirm, unrelated choice, confirm original action again",
  "action not consumed; history branches/truncation are original Selection semantics",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c);
      assert.equal(confirm(c, a), 1);
      const first = c.s.current;
      assert.equal(confirm(c, a), 0);
      assert.equal(c.s.current, first);
      c.s.select({
        items: [{ ref: "B second" }],
        origin: "graph",
        snapshotId: c.m.snapshotId,
      });
      c.s.back();
      assert.equal(c.s.canGoForward, true);
      assert.equal(confirm(c, a), 0);
      assert.equal(c.s.canGoForward, true);
      c.s.forward();
      assert.equal(confirm(c, a), 1);
      assert.equal(c.s.canGoForward, false);
    }),
);
add(
  "same-identity-origin",
  "history",
  "tree chose same address before source click",
  "identity no-op preserves original object/origin/forward history, no selection notification",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c),
        value = { ...expected(c, hit()), origin: "tree" };
      c.s.select(value);
      c.s.select({
        items: [{ ref: "B forward" }],
        origin: "graph",
        snapshotId: c.m.snapshotId,
      });
      c.s.back();
      const old = c.s.current;
      assert.equal(confirm(c, a), 0);
      assert.equal(c.s.current, old);
      assert.equal(c.s.current.origin, "tree");
      assert.equal(c.s.canGoForward, true);
    }),
);
for (const method of [
  "clear",
  "reloadDocument",
  "retarget",
  "different-point",
  "reloadCandidates",
])
  add(
    "expires-" + method,
    "generation",
    method,
    "synchronous invalidation at accepted restart; stale_action before not_ready, old page invalid for new issuance",
    () =>
      using(async (c) => {
        const { d, page } = await ready(c),
          a = issue(c);
        let t;
        if (method === "clear") await N.ok(N.call(c, "clear"));
        if (method === "reloadDocument")
          t = await N.documentStart(c, "reloadDocument");
        if (method === "retarget")
          t = await N.documentStart(c, "load", "B retarget");
        if (method === "different-point") t = await N.candidateStart(c, d, 1);
        if (method === "reloadCandidates")
          t = await N.candidateStart(c, d, 0, "reloadCandidates");
        noWrites(c, () =>
          local(() => c.m.confirmCandidate(a, c.s), "stale_action"),
        );
        if (method === "reloadDocument" || method === "retarget") {
          const newer = await N.documentFinish(c, t);
          t = await N.candidateStart(c, newer);
        }
        if (t) {
          await N.candidateFinish(c, t, { items: [hit()] });
          noWrites(c, () => local(() => issue(c, page), "invalid_page"));
          confirm(c, issue(c));
        }
      }),
  );
add(
  "new-document-same-bytes",
  "generation",
  "reload same text/hash/file/coords",
  "old action permanently stale even after new success; no value identity shortcuts",
  () =>
    using(async (c) => {
      const { d } = await ready(c),
        a = issue(c);
      const newer = await N.documentFinish(
        c,
        await N.documentStart(c, "reloadDocument"),
      );
      assert.notEqual(newer, d);
      await N.candidateFinish(c, await N.candidateStart(c, newer), {
        items: [hit()],
      });
      local(() => c.m.confirmCandidate(a, c.s), "stale_action");
      confirm(c, issue(c));
    }),
);
add(
  "page-append-join",
  "generation",
  "append pending, duplicate loadMore joins, later page success",
  "old action not_ready only while pending, prefix identity preserved; both slots usable after success",
  () =>
    using(async (c) => {
      const { d, page } = await ready(c, { next: "B next" }),
        a = issue(c),
        t = await N.candidateStart(c, d, 0, "loadMore"),
        j = N.call(c, "loadMore");
      local(() => c.m.confirmCandidate(a, c.s), "not_ready");
      await N.candidateFinish(c, t, { items: [hit("definition", 1)] });
      await N.ok(j);
      assert.equal(c.m.state.candidates.state.pages[0], page);
      confirm(c, a);
      confirm(c, issue(c, c.m.state.candidates.state.pages[1]));
    }),
);
for (const terminal of ["failed", "cancelled"])
  add(
    "append-" + terminal + "-retry",
    "generation",
    terminal,
    "same-chain prefix survives failed/cancelled append; not_ready then valid on successful loadMore retry",
    () =>
      using(async (c) => {
        const { d, page } = await ready(c, { next: "B next" }),
          a = issue(c),
          t = await N.candidateStart(c, d, 0, "loadMore");
        if (terminal === "failed") {
          c.wire.fail(t.q, "internal");
          await N.bad(t.o, "internal");
        } else {
          await N.ok(N.call(c, "cancelCandidates"));
          await N.bad(t.o, "cancelled");
        }
        assert.equal(c.m.state.candidates.state.pages[0], page);
        local(() => c.m.confirmCandidate(a, c.s), "not_ready");
        const u = await N.candidateStart(c, d, 0, "loadMore");
        await N.candidateFinish(c, u, { items: [hit("object", 1)] });
        confirm(c, a);
      }),
  );
for (const terminal of ["failed", "cancelled"])
  add(
    "same-bound-head-restart-" + terminal,
    "generation",
    terminal,
    "locate after terminal starts new head; old owned action stale before pending",
    () =>
      using(async (c) => {
        const { d } = await ready(c, { next: "B next" }),
          a = issue(c),
          t = await N.candidateStart(c, d, 0, "loadMore");
        if (terminal === "failed") {
          c.wire.fail(t.q, "internal");
          await N.bad(t.o);
        } else {
          await N.ok(N.call(c, "cancelCandidates"));
          await N.bad(t.o);
        }
        const u = await N.candidateStart(c, d);
        local(() => c.m.confirmCandidate(a, c.s), "stale_action");
        await N.candidateFinish(c, u, { items: [hit()] });
        confirm(c, issue(c));
      }),
  );
add(
  "same-binding-noops",
  "generation",
  "same bound locate + load same target + exhausted loadMore + cancelCandidates success",
  "real no-ops and paused ready don't expire explicit actions",
  () =>
    using(async (c) => {
      const { d } = await ready(c),
        a = issue(c);
      await N.ok(N.call(c, "locate", d, 0));
      await N.ok(N.call(c, "load", "B-nav-target", "definition"));
      await N.ok(N.call(c, "loadMore"));
      await N.ok(N.call(c, "cancelCandidates"));
      confirm(c, a);
      N.ready(c);
      await N.noAuto(c);
      confirm(c, a);
    }),
);
add(
  "pending-same-binding-join",
  "generation",
  "old prefix action during loadMore, locate same binding joins",
  "not_ready not stale; join must not start new generation",
  () =>
    using(async (c) => {
      const { d } = await ready(c, { next: "B next" }),
        a = issue(c),
        t = await N.candidateStart(c, d, 0, "loadMore"),
        j = N.call(c, "locate", d, 0);
      local(() => c.m.confirmCandidate(a, c.s), "not_ready");
      await N.candidateFinish(c, t, { items: [hit()] });
      await N.ok(j);
      confirm(c, a);
    }),
);
add(
  "invalid-command-retains",
  "generation",
  "invalid locate offset then valid confirm",
  "rejected argument does not invalidate committed generation or probe hostile page",
  () =>
    using(async (c) => {
      const { d } = await ready(c),
        a = issue(c);
      await N.bad(N.call(c, "locate", d, -1), "invalid_argument");
      confirm(c, a);
    }),
);
add(
  "stale-cursor",
  "generation",
  "second page stale_cursor, loadMore again, reload head",
  "original error repeated, prefix display-only/not_ready; actual restart makes old action stale",
  () =>
    using(async (c) => {
      const { d, page } = await ready(c, { next: "B cursor" }),
        a = issue(c),
        t = await N.candidateStart(c, d, 0, "loadMore");
      c.wire.fail(t.q, "stale_cursor");
      const e = await N.bad(t.o, "stale_cursor");
      assert.equal(await N.bad(N.call(c, "loadMore")), e);
      assert.equal(c.m.state.candidates.state.pages[0], page);
      local(() => c.m.confirmCandidate(a, c.s), "not_ready");
      const u = await N.candidateStart(c, d, 0, "reloadCandidates");
      local(() => c.m.confirmCandidate(a, c.s), "stale_action");
      await N.candidateFinish(c, u, { items: [hit()] });
      confirm(c, issue(c));
    }),
);
add(
  "same-reply-new-chain-adapter",
  "generation-adapter",
  "public SDK adapter re-publishes exact frozen Reply",
  "new chain expires old action despite same page identity; reissued local action valid; NOT real SDK caching",
  () =>
    using(async (c) => {
      const { page } = await ready(c),
        a = issue(c);
      await republish(c, page, async (calls) => {
        const o = N.call(c, "reloadCandidates");
        local(() => c.m.confirmCandidate(a, c.s), "stale_action");
        await N.ok(o);
        assert.equal(calls(), 1);
        assert.equal(c.m.state.candidates.state.pages[0], page);
        local(() => c.m.confirmCandidate(a, c.s), "stale_action");
        confirm(c, issue(c, page));
      });
    }),
);
add(
  "ready-queued-vs-started",
  "generation-ready",
  "partial success, ready queued, auto head starts later",
  "ready receipt alone leaves action usable; actual pending has stale_action (before notification reentrancy handled separately)",
  () =>
    using(async (c) => {
      await ready(c, { completeness: N.partial });
      const a = issue(c);
      N.ready(c);
      confirm(c, a);
      const t = await N.autoStart(c);
      local(() => c.m.confirmCandidate(a, c.s), "stale_action");
      c.wire.ok(t.q, N.C.page([hit()]));
      await N.ok(t.o);
      N.invariant(c);
      confirm(c, issue(c));
    }),
);
add(
  "shared-page-model-ownership",
  "authenticity",
  "two real models concurrent same SDK query",
  "shared actual Reply is local page in each; only locally issued action accepted, cross action invalid",
  () =>
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
      const page = saved.state.candidates.state.pages[0];
      assert.equal(other.state.candidates.state.pages[0], page);
      const a = saved.createCandidateAction(page, 0),
        b = other.createCandidateAction(page, 0);
      local(() => saved.confirmCandidate(b, c.s), "invalid_action");
      local(() => other.confirmCandidate(a, c.s), "invalid_action");
      confirm(c, a);
      assert.equal(other.confirmCandidate(b, c.s), undefined);
    }),
);
for (const phase of ["disposed", "not-ready"])
  add(
    "priority-" + phase,
    "priority",
    phase,
    "disposed wins all; otherwise invalid_action before not_ready; no hostile reads",
    () =>
      using(async (c) => {
        const h = poison();
        if (phase === "disposed") c.m.dispose();
        local(
          () => c.m.createCandidateAction(h.value, h.value),
          phase === "disposed" ? "disposed" : "not_ready",
        );
        local(
          () => c.m.confirmCandidate(h.value, h.value),
          phase === "disposed" ? "disposed" : "invalid_action",
        );
        assert.equal(h.counts.probes, 0);
      }),
  );
for (const method of N.methods)
  add(
    "confirm-listener-async-" + method,
    "reentrancy",
    method,
    "old commands reject Promise SourceNavigationError reentrant_change without inputs; no nav publish; guard restored",
    () =>
      using(async (c) => {
        await ready(c);
        const a = issue(c),
          h = poison();
        let o;
        const off = c.s.subscribe(() => {
          o = N.call(c, method, h.value, h.value);
        });
        confirm(c, a);
        off();
        N.navError(await N.bad(o, "reentrant_change"), "reentrant_change");
        assert.equal(h.counts.probes, 0);
        confirm(c, a);
      }),
  );
for (const method of ["createCandidateAction", "confirmCandidate"])
  add(
    "confirm-listener-sync-" + method,
    "reentrancy",
    method,
    "new commands synchronously throw SourceConfirmationError reentrant_change before hostile inputs",
    () =>
      using(async (c) => {
        await ready(c);
        const a = issue(c),
          h = poison();
        const off = c.s.subscribe(() => {
          local(() => c.m[method](h.value, h.value), "reentrant_change");
        });
        confirm(c, a);
        off();
        assert.equal(h.counts.probes, 0);
        confirm(c, a);
      }),
  );
for (const method of ["createCandidateAction", "confirmCandidate"])
  add(
    "nav-notification-sync-" + method,
    "reentrancy",
    method,
    "nav notification reentrancy precedes readiness/invalid inputs; render outside notification can issue",
    () =>
      using(async (c) => {
        const { d } = await ready(c),
          h = poison();
        let n = 0;
        const off = c.m.subscribe(() => {
          n++;
          local(() => c.m[method](h.value, h.value), "reentrant_change");
        });
        await N.candidateFinish(
          c,
          await N.candidateStart(c, d, 0, "reloadCandidates"),
          { items: [hit()] },
        );
        off();
        assert.ok(n >= 2);
        assert.equal(h.counts.probes, 0);
        confirm(c, issue(c));
      }),
  );
add(
  "invalid-load-no-probe",
  "generation",
  "invalid load ref input (opaque primitive gate)",
  "primitive rejects without reading; subsequent explicit confirm remains valid",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c),
        h = poison();
      await N.bad(N.call(c, "load", h.value, "definition"), "invalid_argument");
      assert.equal(h.counts.probes, 0);
      confirm(c, a);
    }),
);
add(
  "aggregate-commit",
  "notifications",
  "Selection first and third listeners throw distinct raw values",
  "commit retained, peers notified in order, original raw errors retained, no nav writes, guard restored",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c),
        one = poison().value,
        two = { B: "second" },
        seen = [];
      const off1 = c.s.subscribe(() => {
          seen.push(1);
          throw one;
        }),
        off2 = c.s.subscribe((s) => {
          seen.push(2);
          assert.deepEqual(s, expected(c, hit()));
        }),
        off3 = c.s.subscribe(() => {
          seen.push(3);
          throw two;
        });
      const old = N.snapshot(c);
      let e;
      assert.throws(
        () => c.m.confirmCandidate(a, c.s),
        (x) => {
          e = x;
          return true;
        },
      );
      assert.ok(e instanceof AggregateError);
      assert.deepEqual(e.errors, [one, two]);
      assert.equal(e.errors[0], one);
      assert.equal(e.errors[1], two);
      assert.deepEqual(seen, [1, 2, 3]);
      assert.deepEqual(c.s.current, expected(c, hit()));
      N.unchanged(c, old);
      off1();
      off2();
      off3();
      assert.equal(confirm(c, a), 0);
      c.s.back();
      assert.equal(confirm(c, a), 1);
    }),
);
for (const subject of ["navigation", "selection"])
  for (const throws of [false, true])
    add(
      "listener-dispose-" + subject + "-" + throws,
      "disposal",
      { subject, throws },
      "dispose immediately, no resurrect/rollback; original Selection outcome retained",
      () =>
        using(async (c) => {
          await ready(c);
          const a = issue(c),
            sent = c.wire.sent.length,
            token = { B: "disposer" };
          let published,
            peer = 0;
          c.s.subscribe((s) => {
            published = s;
            if (subject === "navigation") c.m.dispose();
            else c.s.dispose();
            if (throws) throw token;
          });
          c.s.subscribe(() => peer++);
          if (throws)
            assert.throws(
              () => c.m.confirmCandidate(a, c.s),
              (e) =>
                e instanceof AggregateError &&
                e.errors.length === 1 &&
                e.errors[0] === token,
            );
          else assert.equal(c.m.confirmCandidate(a, c.s), undefined);
          assert.deepEqual(published, expected(c, hit()));
          assert.equal(c.wire.sent.length, sent);
          if (subject === "navigation") {
            assert.equal(c.m.disposed, true);
            assert.deepEqual(c.s.current, published);
            assert.equal(peer, 1);
            local(() => c.m.confirmCandidate(a, c.s), "disposed");
          } else {
            assert.equal(c.s.disposed, true);
            assert.deepEqual(c.s.current.items, []);
            assert.equal(peer, 0);
          }
        }),
    );
add(
  "other-model-not-global",
  "reentrancy",
  "confirm listener uses a separate nav model",
  "no global confirmation lock; read-only/subscribe/unsubscribe allowed",
  () =>
    using(async (c) => {
      const { d } = await ready(c),
        a = issue(c),
        other = c.make();
      let o;
      const off = c.s.subscribe(() => {
        assert.equal(c.m.snapshotId, c.s.snapshotId);
        assert.equal(c.m.disposed, false);
        const u = c.m.subscribe(() => {});
        u();
        u();
        o = N.H.observe(other.clear());
      });
      confirm(c, a);
      off();
      await N.ok(o);
      assert.equal(c.m.state.candidates.document, d);
    }),
);
add(
  "late-page-after-clear",
  "disposal",
  "append pending then clear; old transport success later",
  "no selection, pages, tasks, or callbacks restored by late reply; borrowed client remains usable",
  () =>
    using(async (c) => {
      const { d } = await ready(c, { next: "B next" }),
        a = issue(c),
        t = await N.candidateStart(c, d, 0, "loadMore");
      await N.ok(N.call(c, "clear"));
      await N.bad(t.o, "cancelled");
      local(() => c.m.confirmCandidate(a, c.s), "stale_action");
      c.wire.ok(t.q, N.C.page([hit()]));
      await N.turn();
      assert.equal(c.m.state.candidates, null);
      assert.deepEqual(c.s.current.items, []);
      await N.sdkAlive(c);
    }),
);
