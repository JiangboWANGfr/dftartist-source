// Hand-table and SDK facilities. No fallback queryAt and no author mapper.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { boot, H, document, snapshot, unchanged } from "./harness.mjs";
import { texts, poison, impostors } from "./fixtures.mjs";
import { cases } from "./cases.mjs";
import "./lifecycle.mjs";
import { coreCases } from "./core.mjs";
import { negatives } from "./types.mjs";
await boot(false);
test("B hand position tables cover all scalar/whole-newline boundaries; encoding crosscheck is facility-only", () => {
  for (const t of texts) {
    assert.equal(new Set(t.valid.map((x) => x[0])).size, t.valid.length, t.id);
    assert.equal(t.valid[0][0], 0);
    assert.equal(t.valid.at(-1)[0], t.text.length);
    for (const [offset, line, col] of t.valid) {
      const prefix = t.text.slice(0, offset),
        lines = prefix.split(/\r\n|\r|\n/);
      assert.equal(lines.length, line, t.id + ":" + offset);
      assert.equal(
        Buffer.byteLength(lines.at(-1)) + 1,
        col,
        t.id + ":" + offset,
      );
      if (offset > 0 && offset < t.text.length) {
        assert.equal(
          t.text[offset - 1] === "\r" && t.text[offset] === "\n",
          false,
        );
        const at = t.text.charCodeAt(offset),
          before = t.text.charCodeAt(offset - 1);
        assert.equal(
          before >= 0xd800 && before <= 0xdbff && at >= 0xdc00 && at <= 0xdfff,
          false,
        );
      }
    }
    for (const offset of t.invalid) {
      const at = t.text.charCodeAt(offset),
        before = t.text.charCodeAt(offset - 1);
      assert.ok(
        (before >= 0xd800 &&
          before <= 0xdbff &&
          at >= 0xdc00 &&
          at <= 0xdfff) ||
          (before === 13 && at === 10),
      );
    }
  }
});
test("inventories are unique, explicit, and list only; old raw fixture tables remain pinned", () => {
  assert.equal(
    new Set([...cases, ...coreCases].map((x) => x.id)).size,
    cases.length + coreCases.length,
  );
  assert.ok(cases.length > 200);
  assert.equal(coreCases.length, 11);
  assert.equal(negatives.length, 32);
  for (const c of [...cases, ...coreCases]) {
    assert.ok(c.input !== undefined);
    assert.ok(c.expected);
    assert.ok(c.basis);
    assert.equal(typeof c.run, "function");
  }
  assert.equal(
    texts.find((x) => x.id === "old-B-mixed").text,
    "ab\t中😀e\u0301\r\nZ\rQ\n",
  );
  assert.equal(texts.find((x) => x.id === "old-B-bom").text, "\uFEFF中😀\r\n");
});
test("hostile/revoked fixture identity compares without probes; hostile fixture itself has working negative trap", () => {
  for (const [name, factory] of impostors) {
    const n = { probes: 0 },
      target = {},
      v = factory(target, n);
    assert.equal(v === target, false, name);
    assert.equal(n.probes, 0);
  }
  const n = { probes: 0 },
    p = poison(n);
  assert.throws(() => p.any);
  assert.equal(n.probes, 1);
});
test("existing real SDK/model setup provides exact empty-span text and changed state without queryAt substitute", () =>
  H.using(async (c) => {
    const before = c.wire.messages.size,
      d = await document(c, "\uFEFF中😀\r\n");
    assert.equal(d.location.status, "exact");
    assert.equal(d.content.result.text, "\uFEFF中😀\r\n");
    assert.deepEqual(d.location.range, {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 },
    });
    assert.equal(c.wire.messages.size, before);
    const state = snapshot(c);
    unchanged(c, state);
    await H.success(H.invoke(c, "clear"));
    const changed = await document(c, "A", true);
    assert.equal(changed.location.status, "changed");
    assert.equal("range" in changed.location, false);
  }));
