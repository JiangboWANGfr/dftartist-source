// B facility controls for original SDK/models/input mechanics, NOT Navigation.
import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import "./ready.mjs";
import "./observers.mjs";
import "./diagnostics.mjs";
import { coreCases } from "./core.mjs";
import { negatives } from "./types.mjs";
import { boot, H, C, context, turn, hit } from "./harness.mjs";
import {
  mixedText,
  mixedBoundaries,
  bomText,
  bomBoundaries,
  hostile,
} from "./fixtures.mjs";
await boot(false);
test("B inventories unique/explicit and old raw tables remain byte pins; no Navigation run", () => {
  const all = [...cases, ...coreCases];
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
  assert.ok(cases.length > 150);
  assert.equal(coreCases.length, 10);
  assert.equal(new Set(negatives.map((x) => x[0])).size, negatives.length);
  for (const c of all) {
    assert.ok(c.input !== undefined);
    assert.ok(c.expected && c.basis);
    assert.equal(typeof c.run, "function");
  }
});
test("B hand tables encoding crosscheck is facility-only, not runtime mapper", () => {
  for (const [text, table] of [
    [mixedText, mixedBoundaries],
    [bomText, bomBoundaries],
  ])
    for (const [byte, , , utf16] of table)
      assert.equal(Buffer.byteLength(text.slice(0, utf16), "utf8"), byte);
  const h = hostile();
  assert.throws(() => Reflect.get(h.value, "B"));
  assert.equal(h.counts.probes, 1);
});
test("actual SDK controlled index events, canonical cursor and Reason metadata", async () => {
  const c = await context({ withModel: false });
  let count = 0;
  const off = c.client.onIndexReady(() => count++);
  try {
    c.wire.emit({ event: "index", state: "ready" });
    c.wire.emit({ event: "index", state: "ready" });
    await turn();
    assert.equal(count, 2);
    const p = c.client.resolveSource(
      { file: "B-source-file/尾", line: 1, col: 1 },
      { limit: 2 },
    );
    p.catch(() => {});
    const q = await c.wire.next("source.resolve");
    assert.equal(q.params.cursor, "");
    c.wire.ok(q, C.page([hit()]), C.partial);
    const r = await p;
    assert.equal(r.completeness.status, "partial");
    assert.equal(r.completeness.reasons[0].code, "indexing");
    assert.equal(Object.isFrozen(r), true);
  } finally {
    off();
    await c.close();
  }
});
test("real old SourceDocument/queryAt/Candidates share SDK without pretending to coordinate", async () => {
  const c = await context({ withModel: false });
  try {
    c.m = new H.vm.SourceDocumentModel(c.client);
    c.models.push(c.m);
    const t = await H.second(
      c,
      await H.begin(c),
      H.span(H.point(0), H.point(0)),
    );
    await H.finish(c, t, H.read("ab中😀\r\nZ"));
    const d = c.m.state.data,
      q = c.m.queryAt(d, 3);
    assert.equal(q.col, 6);
    const candidate = new H.vm.SourceCandidatesModel(c.client, { pageSize: 2 });
    c.models.push(candidate);
    const p = candidate.load(q);
    p.catch(() => {});
    const request = await c.wire.next("source.resolve");
    c.wire.ok(request, C.page([hit()]), C.partial);
    await p;
    assert.equal(
      candidate.state.pages[0],
      c.calls.findLast((x) => x.method === "resolveSource").reply,
    );
    const count = c.wire.queries.length;
    c.wire.emit({ event: "index", state: "ready" });
    await turn();
    assert.equal(
      c.wire.queries.length,
      count,
      "standalone old models do not implement new coordination",
    );
    assert.equal(
      d.content,
      c.calls.findLast((x) => x.method === "readSource").reply,
    );
  } finally {
    await c.close();
  }
});
