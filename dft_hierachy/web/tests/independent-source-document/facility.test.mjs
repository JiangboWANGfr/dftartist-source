// These validate B inputs/SDK facilities, NOT SourceDocumentModel product semantics.
import test from "node:test";
import assert from "node:assert/strict";
import {
  boot,
  using,
  span,
  read,
  hashA,
  hashB,
  rawSnapshot,
} from "./harness.mjs";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import {
  mixedText,
  mixedBoundaries,
  bomText,
  bomBoundaries,
} from "./positions.mjs";
import {
  leafText,
  topText,
  leafDeclaration,
  topDeclaration,
  instantiations,
  expectedRange,
} from "./source-fixture.mjs";
import { cases } from "./cases.mjs";
import "./lifecycle.mjs";
import "./diagnostics.mjs";
import "./boundaries.mjs";
import { coreCases } from "./core-cases.mjs";
import { negatives } from "./types.mjs";
await boot(false);
test("hand coordinate literals roundtrip against original fixture bytes", () => {
  assert.equal(Buffer.byteLength(mixedText), 19);
  assert.equal(mixedText.length, 14);
  assert.equal(Buffer.byteLength(bomText), 12);
  assert.equal(bomText.length, 6);
  for (const [text, table] of [
    [mixedText, mixedBoundaries],
    [bomText, bomBoundaries],
  ])
    for (const [bytes, line, byteColumn, units, unitColumn] of table) {
      const prefix = text.slice(0, units);
      assert.equal(Buffer.byteLength(prefix), bytes);
      const lines = prefix.split(/\r\n|\r|\n/);
      assert.equal(lines.length, line);
      assert.equal(Buffer.byteLength(lines.at(-1)) + 1, byteColumn);
      assert.equal(lines.at(-1).length + 1, unitColumn);
      assert.equal(
        Buffer.from(text).subarray(0, bytes).toString("utf8"),
        prefix,
      );
    }
});
test("HDL fixture exact literals/physical BOM+CRLF and unique markers", () => {
  assert.equal(leafText.charCodeAt(0), 0xfeff);
  assert.equal(leafText.replaceAll("\r\n", "").includes("\n"), false);
  assert.deepEqual(expectedRange(leafText, leafDeclaration).start, {
    offset: 22,
    line: 2,
    column: 1,
  });
  for (const [text, literal] of [
    [leafText, leafDeclaration],
    [topText, topDeclaration],
    [topText, instantiations.left],
    [topText, instantiations.right],
    [leafText, "assign q = d;"],
  ]) {
    const r = expectedRange(text, literal);
    assert.equal(text.slice(r.start.offset, r.end.offset), literal);
  }
  assert.deepEqual(
    Object.values(instantiations).map(
      (v) => expectedRange(topText, v).start.line,
    ),
    [4, 5],
  );
});
test("all independent inventories unique, explicit inputs/expectations/bases", () => {
  const all = [...cases, ...coreCases];
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
  assert.ok(cases.length > 200);
  assert.equal(coreCases.length, 14);
  assert.equal(negatives.length, 34);
  for (const c of all) {
    assert.ok(c.input !== undefined);
    assert.ok(c.expected);
    assert.ok(c.basis);
    assert.equal(typeof c.run, "function");
  }
});
test("B replies/hello validate authoritative public generated Schema with negative controls", async () => {
  const { validateDefinition } = await import(
    publicEntry(process.env.HIER_B_PRODUCT_ROOT, "@hier/protocol-types")
  );
  for (const [type, value] of [
    ["SnapshotInfo", rawSnapshot()],
    ["SourceSpan", span()],
    ["SourceRead", read()],
    ["SourceRead", read("", hashB, false)],
    ["IndexReady", { event: "index", state: "ready" }],
  ])
    assert.equal(validateDefinition(type, value), true, type);
  for (const [type, value] of [
    ["SourceSpan", { ...span(), file: "" }],
    ["SourceSpan", { ...span(), start: { offset: -1, line: 1, column: 1 } }],
    ["SourceRead", { ...read(), contentHash: "bad" }],
    ["SourceRead", { ...read(), matchesSnapshot: "true" }],
  ])
    assert.equal(validateDefinition(type, value), false, type);
  for (const entry of cases.filter((c) => c.group === "coordinates")) {
    if (typeof entry.input !== "object" || entry.input === null) continue;
    for (const key of ["start", "end", "bad"])
      if (entry.input[key] !== undefined)
        assert.equal(
          validateDefinition("SourcePos", entry.input[key]),
          true,
          entry.id +
            ":" +
            key +
            " must reach L6 semantic validation rather than SDK schema rejection",
        );
  }
});
test("real SDK public source/read replies + counters, not replacement SDK/model", () =>
  using(
    async (c) => {
      const p = c.client.source("B-ref", "definition"),
        q = await c.wire.next("obj.source");
      assert.deepEqual(q.params, { ref: "B-ref", kind: "definition" });
      c.wire.ok(q, span());
      const original = await p;
      assert.equal(c.calls[0].reply, original);
      assert.equal(Object.isFrozen(original), true);
      const r = c.client.readSource(original.result.file),
        request = await c.wire.next("source.read");
      assert.deepEqual(request.params, { file: span().file });
      c.wire.ok(request, read());
      assert.equal((await r).result.contentHash, hashA);
    },
    { withModel: false },
  ));
test("real SDK close diagnostic preserves HierError identity", () =>
  using(
    async (c) => {
      const { sdk } = await import("./harness.mjs");
      const original = new sdk.HierError(
          "transport_closed",
          "transport",
          "B control",
          {},
        ),
        p = c.client.source("B", "statement");
      p.catch(() => {});
      await c.wire.next("obj.source");
      c.wire.close(original);
      await assert.rejects(p, (e) => e === original);
    },
    { withModel: false },
  ));
