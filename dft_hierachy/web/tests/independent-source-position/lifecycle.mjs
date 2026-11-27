import assert from "node:assert/strict";
import { add } from "./cases.mjs";
import { H, document, query, rejected } from "./harness.mjs";
import { poison } from "./fixtures.mjs";
for (const phase of ["pending", "success", "failed", "cancelled", "idle"])
  add(
    "notification-" + phase,
    "read-boundaries",
    { phase },
    "queryAt allowed synchronous read in notification; success accepts current, other statuses stale, never reentrant_change or side effects",
    () =>
      H.using(async (c) => {
        const held = await document(c, "A");
        let hits = 0;
        c.m.subscribe(() => {
          if (c.m.state.status === phase) {
            hits++;
            if (phase === "success") query(c, c.m.state.data, 1, 1, 2);
            else rejected(c, held, 0, "stale_document");
          }
        });
        if (phase === "idle") await H.success(H.invoke(c, "clear"));
        else {
          const o = H.invoke(c, "reload"),
            q = await c.wire.next("obj.source"),
            t = { o, q };
          if (phase === "failed") {
            c.wire.fail(q);
            await H.failure(o, "not_found");
          } else if (phase === "cancelled") {
            await H.success(H.invoke(c, "cancel"));
            await H.failure(o, "cancelled");
          } else
            await H.finish(
              c,
              await H.second(c, t, H.span(H.point(0), H.point(0))),
              H.read("A"),
            );
        }
        assert.equal(hits, 1);
      }),
  );
add(
  "notification-dispose-priority",
  "read-boundaries",
  { phase: "success" },
  "reader after dispose in success callback throws SourcePositionError disposed; responsible async load still original SourceDocument disposed",
  () =>
    H.using(async (c) => {
      let checked = 0;
      const counters = { probes: 0 };
      c.m.subscribe(() => {
        if (c.m.state.status === "success") {
          const d = c.m.state.data;
          c.m.dispose();
          rejected(c, d, poison(counters), "disposed");
          checked++;
        }
      });
      const t = await H.second(
        c,
        await H.begin(c),
        H.span(H.point(0), H.point(0)),
      );
      c.wire.ok(t.r, H.read("A"));
      const e = await H.failure(t.o, "disposed");
      assert.ok(e instanceof H.vm.SourceDocumentError);
      assert.equal(checked, 1);
      assert.equal(counters.probes, 0);
    }),
);
for (const dispose of [false, true])
  add(
    "diagnostic-read-" + dispose,
    "read-boundaries",
    { dispose },
    "read guard does not turn queryAt into reentrant command; stale pending or disposed according to current state; original async cause kept",
    () =>
      H.using(async (c) => {
        const d = await document(c),
          o = H.invoke(c, "reload");
        await c.wire.next("obj.source");
        const data = {},
          n = { probes: 0 };
        let hits = 0;
        Object.defineProperty(data, "readable", {
          enumerable: true,
          get() {
            if (dispose) c.m.dispose();
            rejected(c, d, poison(n), dispose ? "disposed" : "stale_document");
            hits++;
            return 3;
          },
        });
        const e = new H.sdk.HierError(
          "transport_closed",
          "transport",
          "B queryAt diagnostic",
          data,
        );
        c.wire.close(e);
        const result = await H.failure(
          o,
          dispose ? "disposed" : "transport_closed",
        );
        if (dispose) {
          assert.ok(result instanceof H.vm.SourceDocumentError);
          assert.equal(result.cause, e);
        } else {
          assert.equal(result, e);
          assert.equal(c.m.state.error.data.readable, 3);
        }
        assert.equal(hits, 1);
        assert.equal(n.probes, 0);
      }),
  );
add(
  "explicit-old-query-not-revocable",
  "lifetime",
  { sequence: "queryAt→clear→explicit candidates.load" },
  "returned plain query still valid snapshot point; no automatic model creation/cancellation; old doc itself remains stale",
  () =>
    H.using(async (c) => {
      const d = await document(c, "A"),
        point = query(c, d, 1, 1, 2);
      await H.success(H.invoke(c, "clear"));
      rejected(c, d, 1, "stale_document");
      const model = new H.vm.SourceCandidatesModel(c.client);
      c.models.push(model);
      const p = model.load(point);
      p.catch(() => {});
      const q = await c.wire.next("source.resolve");
      assert.equal(q.params.file, point.file);
      assert.equal(q.params.line, point.line);
      assert.equal(q.params.col, point.col);
      c.wire.ok(q, { items: [] });
      await p;
      assert.equal(model.state.status, "success");
      assert.deepEqual(
        Object.fromEntries(
          Reflect.ownKeys(point).map((key) => [key, point[key]]),
        ),
        {
          snapshotId: c.m.snapshotId,
          file: d.source.result.file,
          line: 1,
          col: 2,
        },
      );
    }),
);
