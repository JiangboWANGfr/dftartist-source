import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { real, releaseCore } from "../independent-source-candidates/core.mjs";
import { H } from "./harness.mjs";
export { releaseCore };
export const coreCases = [];
for (const kind of ["CRLF", "LF", "macro"])
  for (const limit of [1, 2, 200])
    coreCases.push({
      id: "SP-CORE-" + kind + "-" + limit,
      group: "real-chain",
      input: { fixture: kind, limit, position: "B literal statement start" },
      expected:
        "real current SourceDocument.queryAt explicit UTF8 query→Candidates all five ordered Core occurrences, original include/macro spans and bounded pages",
      basis: "DESIGN §6.12.3/6.12.4/§5.5.6; prior independent B source fixture",
      run: () =>
        real(kind, true, async (c) => {
          const m = new H.vm.SourceDocumentModel(c.client);
          c.models.push(m);
          await m.load(c.children[0].ref, "definition");
          const d = m.state.data;
          assert.equal(m.state.status, "success");
          assert.equal(d.location.status, "exact");
          assert.equal(d.content.result.text, c.leaf);
          const offset = c.leaf.indexOf(c.statement);
          assert.ok(offset >= 0);
          const before = c.calls.length,
            value = m.queryAt(d, offset);
          assert.deepEqual(
            Object.fromEntries(
              Reflect.ownKeys(value).map((k) => [k, value[k]]),
            ),
            c.query,
          );
          assert.equal(Object.isFrozen(value), true);
          assert.equal(c.calls.length, before);
          c.exact(await c.collect(value, limit));
          const old = { ...value };
          m.dispose();
          assert.throws(
            () => m.queryAt(d, offset),
            (e) =>
              e instanceof H.vm.SourcePositionError && e.code === "disposed",
          );
          assert.deepEqual({ ...value }, old);
        }),
    });

coreCases.push({
  id: "SP-CORE-disk-reload",
  group: "real-chain",
  input: { fixture: "CRLF", change: "replace leaf then restore" },
  expected:
    "disk edit alone does not revoke current exact document; Core remains snapshot; reload changed rejects before offset; restored fresh document accepts old byte point",
  basis: "DESIGN §6.12.2/§6.12.4/§6.10.3; B original file bytes",
  run: () =>
    real("CRLF", true, async (c) => {
      const m = new H.vm.SourceDocumentModel(c.client);
      c.models.push(m);
      await m.load(c.children[0].ref, "definition");
      const d = m.state.data,
        offset = c.leaf.indexOf(c.statement);
      await fs.writeFile(
        path.join(c.dir, c.leafName),
        "// B replaced current disk\r\n",
      );
      const q = m.queryAt(d, offset);
      assert.deepEqual(
        Object.fromEntries(Reflect.ownKeys(q).map((k) => [k, q[k]])),
        c.query,
      );
      c.exact(await c.collect(q, 2));
      await m.reload();
      const changed = m.state.data;
      assert.equal(changed.location.status, "changed");
      assert.throws(
        () => m.queryAt(changed, undefined),
        (e) =>
          e instanceof H.vm.SourcePositionError &&
          e.code === "changed_document",
      );
      assert.throws(
        () => m.queryAt(d, offset),
        (e) =>
          e instanceof H.vm.SourcePositionError && e.code === "stale_document",
      );
      await fs.writeFile(path.join(c.dir, c.leafName), c.leaf);
      await m.reload();
      const next = m.state.data;
      assert.notEqual(next, d);
      assert.equal(next.location.status, "exact");
      assert.throws(
        () => m.queryAt(d, offset),
        (e) => e.code === "stale_document",
      );
      c.exact(await c.collect(m.queryAt(next, offset), 2));
    }),
});
coreCases.push({
  id: "SP-CORE-other-model",
  group: "real-chain",
  input: { fixture: "CRLF", models: 2, sameRef: true },
  expected:
    "real same-session identical source text belongs to each own current publication; foreign data rejected even if current FileRef/snapshot/text equal",
  basis: "DESIGN §6.12.2 current publication identity",
  run: () =>
    real("CRLF", true, async (c) => {
      const a = new H.vm.SourceDocumentModel(c.client),
        b = new H.vm.SourceDocumentModel(c.client);
      c.models.push(a, b);
      await Promise.all([
        a.load(c.children[0].ref, "definition"),
        b.load(c.children[0].ref, "definition"),
      ]);
      const da = a.state.data,
        db = b.state.data,
        offset = c.leaf.indexOf(c.statement);
      assert.notEqual(da, db);
      assert.equal(da.content.result.text, db.content.result.text);
      assert.throws(
        () => a.queryAt(db, offset),
        (e) =>
          e instanceof H.vm.SourcePositionError && e.code === "stale_document",
      );
      assert.throws(
        () => b.queryAt(da, offset),
        (e) =>
          e instanceof H.vm.SourcePositionError && e.code === "stale_document",
      );
      c.exact(await c.collect(a.queryAt(da, offset), 1));
      c.exact(await c.collect(b.queryAt(db, offset), 200));
    }),
});
