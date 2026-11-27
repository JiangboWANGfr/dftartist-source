// Additional boundary fixtures, still only public SDK/model seams.
import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import {
  N,
  using,
  ready,
  hit,
  issue,
  local,
  confirm,
  expected,
  poison,
  noWrites,
} from "./harness.mjs";
add(
  "empty-success",
  "readiness",
  "successful empty candidate page",
  "issuance invalid_index, not not_ready; no selection or SDK writes",
  () =>
    using(async (c) => {
      const { page } = await ready(c, { items: [] });
      noWrites(c, () => local(() => issue(c, page, 0), "invalid_index"));
    }),
);
add(
  "disposed-after-issued",
  "priority",
  "valid owned action, nav disposed, malformed target",
  "disposed before owned/stale/target; original action cannot be revived",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c),
        h = poison();
      c.m.dispose();
      local(() => c.m.confirmCandidate(a, h.value), "disposed");
      assert.equal(h.counts.probes, 0);
    }),
);
add(
  "selection-own-overrides",
  "selection-brand",
  "real Selection with own hostile select/snapshot/disposed getters",
  "original base reads/commit bypass instance overrides; no property dispatch",
  () =>
    using(async (c) => {
      await ready(c);
      let probes = 0;
      for (const k of ["select", "snapshotId", "disposed"])
        Object.defineProperty(c.s, k, {
          configurable: true,
          get() {
            probes++;
            throw Error("B external override");
          },
        });
      assert.equal(c.m.confirmCandidate(issue(c), c.s), undefined);
      assert.equal(probes, 0);
      assert.deepEqual(c.s.current, expected(c, hit()));
    }),
);
add(
  "selection-identical-during-notification",
  "selection-error",
  "current target notifying same chosen identity",
  "original same-identity no-op remains allowed; keeps tree origin; no recursive notification",
  () =>
    using(async (c) => {
      await ready(c);
      const a = issue(c);
      let count = 0;
      const off = c.s.subscribe(() => {
        count++;
        assert.equal(c.m.confirmCandidate(a, c.s), undefined);
      });
      c.s.select({ ...expected(c, hit()), origin: "tree" });
      off();
      assert.equal(count, 1);
      assert.equal(c.s.current.origin, "tree");
      assert.equal(confirm(c, a), 0);
    }),
);
for (const source of ["source", "readSource", "resolveSource"])
  for (const method of ["createCandidateAction", "confirmCandidate"]) {
    add(
      "diagnostic-sync-" + source + "-" + method,
      "diagnostic-reentrancy",
      { source, method },
      "local reentrant_change before hostile inputs in original error.data getter; original SDK failure object preserved",
      () =>
        using(async (c) => {
          const d =
              source === "resolveSource" ? await N.document(c) : undefined,
            h = poison();
          const original = new N.H.sdk.HierError(
            "not_found",
            "core",
            "B independent diagnostic",
            {},
          );
          let count = 0;
          Object.defineProperty(original, "data", {
            get() {
              count++;
              local(() => c.m[method](h.value, h.value), "reentrant_change");
              return { B: "kept" };
            },
          });
          c.client[source] = () => Promise.reject(original);
          const o =
            source === "resolveSource"
              ? N.call(c, "locate", d, 0)
              : N.call(c, "load", "B-nav-target", "definition");
          if (source === "readSource") {
            const q = await c.wire.next("obj.source");
            c.wire.ok(q, N.H.span(N.H.point(0), N.H.point(0)));
          }
          assert.equal(await N.bad(o), original);
          assert.equal(count, 1);
          assert.equal(h.counts.probes, 0);
          local(
            () => c.m[method](h.value, h.value),
            method === "createCandidateAction" ? "not_ready" : "invalid_action",
          );
        }),
    );
  }
