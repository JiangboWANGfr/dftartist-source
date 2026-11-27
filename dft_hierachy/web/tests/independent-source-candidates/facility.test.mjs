import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  boot,
  using,
  Q,
  hit,
  page,
  partial,
  rawSnapshot,
  protocol,
  sdk,
} from "./harness.mjs";
import { cases } from "./cases.mjs";
import "./inputs.mjs";
import "./lifecycle.mjs";
import "./diagnostics.mjs";
import "./promise.mjs";
import { coreCases, sdkControls } from "./core.mjs";
import { negatives } from "./types.mjs";
import {
  leafText,
  topText,
  leafDeclaration,
  macroLeaf,
  macroInvocation,
  byteRange,
} from "./core-fixture.mjs";
await boot(false);
test("independent inventories are unique/explicit and list is not execution", () => {
  const all = [...cases, ...coreCases, ...sdkControls];
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
  assert.ok(cases.length > 200);
  assert.equal(coreCases.length, 13);
  assert.equal(sdkControls.length, 12);
  assert.equal(negatives.length, 47);
  for (const c of all) {
    assert.ok(c.input !== undefined);
    assert.ok(c.expected);
    assert.ok(c.basis);
    assert.equal(typeof c.run, "function");
  }
});
test("original B include bytes pinned; independently computed UTF8 spans differ from UTF16", () => {
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  assert.equal(
    sha(leafText),
    "2b19339021a552f70120b78cd116a76837dac9289f137c0de9c37d4d1b1dea5d",
  );
  assert.equal(
    sha(topText),
    "fa2403fcb76f087d3e9eb646cd00a3d16b0c799608056853d5b8888d68e9fac9",
  );
  assert.equal(Buffer.byteLength(leafText), 107);
  assert.equal(leafText.length, 100);
  const declaration = byteRange(leafText, leafDeclaration);
  assert.deepEqual(declaration.start, { offset: 29, line: 2, column: 1 });
  const statement = byteRange(leafText, "assign q = d;");
  assert.equal(statement.start.line, 3);
  assert.equal(statement.start.column, 3);
  assert.equal(byteRange(macroLeaf, macroInvocation).start.line, 3);
  assert.equal(byteRange(macroLeaf, macroInvocation).start.column, 3);
});
test("public authoritative definitions validate B positive/negative wire fixtures and exact numeric bounds", () => {
  for (const [type, value] of [
    ["SnapshotInfo", rawSnapshot(Q.snapshotId)],
    ["SourceHit", hit()],
    ["Completeness", partial],
    ["SourceResolveResult", page([hit()], "B-next")],
    ["PageLimit", 2147483647],
    ["UInt", Number.MAX_SAFE_INTEGER],
  ])
    assert.equal(protocol.validateDefinition(type, value), true, type);
  for (const [type, value] of [
    ["SourceHit", { ...hit(), kind: "unknown" }],
    ["SourceHit", { ...hit(), span: { ...hit().span, file: "" } }],
    ["SourceResolveResult", { items: [{}] }],
    ["PageLimit", 2147483648],
    ["UInt", Number.MAX_SAFE_INTEGER + 1],
  ])
    assert.equal(protocol.validateDefinition(type, value), false, type);
});
test("real SDK source.resolve wire strips no fields unexpectedly and preserves raw Reply metadata", () =>
  using(
    async (c) => {
      const p = c.client.resolveSource(
        { file: Q.file, line: 7, col: 1 },
        { limit: 2 },
      );
      p.catch(() => {});
      const q = await c.wire.next("source.resolve");
      assert.deepEqual(q.params, {
        file: Q.file,
        line: 7,
        col: 1,
        limit: 2,
        cursor: "",
      });
      c.wire.ok(q, page([hit(1)], "B-next"), partial);
      const r = await p;
      assert.equal(r, c.calls[0].reply);
      assert.deepEqual(r.completeness, partial);
      assert.equal(Object.isFrozen(r), true);
    },
    { withModel: false },
  ));
test("real SDK close delivers original HierError diagnostic, no SDK replacement", () =>
  using(
    async (c) => {
      const e = new sdk.HierError("transport_closed", "transport", "B", {}),
        p = c.client.resolveSource({ file: Q.file, line: 1 }, { limit: 1 });
      p.catch(() => {});
      await c.wire.next("source.resolve");
      c.wire.close(e);
      await assert.rejects(p, (v) => v === e);
    },
    { withModel: false },
  ));
test("SDK subscriber cancellation is independent (controlled public Transport)", () =>
  using(
    async (c) => {
      const controller = new AbortController(),
        query = { file: Q.file, line: 1 };
      const a = c.client.resolveSource(query, { limit: 1 }, controller.signal),
        b = c.client.resolveSource(query, { limit: 1 });
      a.catch(() => {});
      b.catch(() => {});
      const q = await c.wire.next("source.resolve");
      assert.equal(c.wire.queries.length, 1);
      controller.abort();
      await assert.rejects(a, (e) => e.code === "cancelled");
      assert.equal(c.wire.cancels.length, 0);
      c.wire.ok(q, page([]));
      assert.deepEqual((await b).result.items, []);
    },
    { withModel: false },
  ));
