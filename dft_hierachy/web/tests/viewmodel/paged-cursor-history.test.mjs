import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
const directory = process.env.HIER_A_VIEWMODEL_DIR;
const vm = await import(directory ? pathToFileURL(`${directory}/index.js`) : new URL("../../packages/viewmodel/dist/index.js", import.meta.url));
const { getSourceCandidatePageChain } = await import(directory ? pathToFileURL(`${directory}/source-candidates-model.js`) : new URL("../../packages/viewmodel/dist/source-candidates-model.js", import.meta.url));
const snapshotId = "A-paging-history", complete = Object.freeze({ status: "complete", reasons: Object.freeze([]) });
const partial = Object.freeze({ status: "partial", reasons: Object.freeze([{ code: "indexing" }]) });
const kinds = [
  { name: "search", Class: vm.SearchModel, method: "search", query: (n = 1) => ({ snapshotId, text: `needle-${n}` }), item: Object.freeze({ ref: "r", kind: "instance", name: "same", pathText: "same", def: "d" }) },
  { name: "source", Class: vm.SourceCandidatesModel, method: "resolveSource", query: (n = 1) => ({ snapshotId, file: "f", line: n }), item: Object.freeze({ ref: "r", kind: "definition", span: Object.freeze({ file: "f" }) }) },
  { name: "instances", Class: vm.DefinitionInstancesModel, method: "instancesOf", query: (n = 1) => ({ snapshotId, def: `definition-${n}` }), item: Object.freeze({ ref: "r", name: "same", path: Object.freeze(["same"]), pathText: "same", kind: "module", def: "d", defName: "same", childCount: 0, hasParamOverrides: false }) },
];
function context(k, t) {
  const calls = [], client = { snapshot: { snapshotId }, [k.method](query, page, signal) {
    let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    calls.push({ query, page, signal, resolve, reject }); return promise;
  } }, model = new k.Class(client, { pageSize: 2 });
  t.after(() => model.dispose()); return { model, calls };
}
function reply(k, next, { size = 1, completeness = complete } = {}) {
  return Object.freeze({ result: Object.freeze({ items: Object.freeze(Array.from({ length: size }, () => k.item)), ...(next === undefined ? {} : { next }), extension: "kept" }), completeness });
}
async function answer(c, command, value) {
  const p = command(); c.calls.at(-1).resolve(value); await p; return c.model.state.pages;
}
const code = (expected) => (error) => error.code === expected;
for (const k of kinds) {
  test(`A M7 paging ${k.name}: old cursor cycles and oversized bad pages preserve the retry prefix`, async (t) => {
    const c = context(k, t), a = reply(k, "a"), b = reply(k, "b");
    const first = await answer(c, () => c.model.load(k.query()), a), prefix = await answer(c, () => c.model.loadMore(), b);
    assert.equal(first[0], a); assert.equal(prefix[0], a); assert.equal(prefix[1], b); assert.ok(Object.isFrozen(prefix));
    for (const bad of [reply(k, "a"), reply(k, "b"), reply(k, "new", { size: 3 })]) {
      const failed = assert.rejects(c.model.loadMore(), code("inconsistent_reply"));
      assert.equal(c.calls.at(-1).page.cursor, "b"); c.calls.at(-1).resolve(bad); await failed;
      assert.equal(c.model.state.status, "failed"); assert.equal(c.model.state.pages, prefix);
    }
    const accepted = reply(k, "new"); await answer(c, () => c.model.loadMore(), accepted);
    assert.equal(c.model.state.pages[2], accepted); assert.equal(first.length, 1); assert.equal(prefix.length, 2);
  });
  test(`A M7 paging ${k.name}: cancellation and late success cannot register an uncommitted cursor`, async (t) => {
    const c = context(k, t); const prefix = await answer(c, () => c.model.load(k.query()), reply(k, "a"));
    const cancelled = assert.rejects(c.model.loadMore(), code("cancelled")), old = c.calls.at(-1);
    await c.model.cancel(); await cancelled; assert.ok(old.signal.aborted); assert.equal(c.model.state.pages, prefix);
    const current = c.model.loadMore(); assert.equal(c.calls.at(-1).page.cursor, "a");
    old.resolve(reply(k, "late")); await Promise.resolve(); c.calls.at(-1).resolve(reply(k, "late")); await current;
    assert.equal(c.model.state.pages.length, 2); assert.equal(c.model.state.pages[1].result.next, "late");
  });
  test(`A M7 paging ${k.name}: reload, replacement, failed same-target load and clear reset opaque cursor history`, async (t) => {
    const c = context(k, t), cursor = "__proto__/尾/e\u0301";
    await answer(c, () => c.model.load(k.query()), reply(k, cursor));
    await answer(c, () => c.model.reload(), reply(k, cursor)); assert.equal(c.calls.at(-1).page.cursor, undefined);
    await answer(c, () => c.model.load(k.query(2)), reply(k, cursor));
    const failed = assert.rejects(c.model.loadMore(), code("inconsistent_reply")); c.calls.at(-1).resolve(reply(k, cursor)); await failed;
    await answer(c, () => c.model.load(k.query(2)), reply(k, cursor));
    await c.model.clear(); assert.equal(c.model.state.status, "idle");
    await answer(c, () => c.model.load(k.query()), reply(k, cursor));
    await answer(c, () => c.model.loadMore(), reply(k, "__proto__/尾/é")); // Exact string identity, no Unicode normalization.
    assert.equal(c.model.state.pages.length, 2);
  });
  test(`A M7 paging ${k.name}: no-op, joins and rejected input/reentrant commands do not reset a live chain`, async (t) => {
    const c = context(k, t), prefix = await answer(c, () => c.model.load(k.query()), reply(k, "a")), rejected = [];
    const chain = k.name === "source" ? getSourceCandidatePageChain(c.model) : undefined;
    await c.model.load(k.query()); assert.equal(c.calls.length, 1); assert.equal(c.model.state.pages, prefix);
    await assert.rejects(c.model.load({}), code("invalid_argument"));
    const off = c.model.subscribe(() => {
      rejected.push(assert.rejects(c.model.clear(), code("reentrant_change")), assert.rejects(c.model.reload(), code("reentrant_change")));
    });
    const next = c.model.loadMore(), joined = c.model.load(k.query()); assert.equal(next, joined); assert.equal(c.calls.length, 2);
    c.calls.at(-1).resolve(reply(k, "b")); await next; await Promise.all(rejected); off();
    if (chain) assert.equal(getSourceCandidatePageChain(c.model), chain);
    const failed = assert.rejects(c.model.loadMore(), code("inconsistent_reply")); c.calls.at(-1).resolve(reply(k, "a")); await failed;
    assert.equal(c.model.state.pages.length, 2);
  });
  test(`A M7 paging ${k.name}: listener failure still commits history and partial/exhaustion remain no-op`, async (t) => {
    const c = context(k, t), sentinel = new Error("listener"), off = c.model.subscribe(() => { if (c.model.state.status === "success") throw sentinel; });
    const failed = assert.rejects(c.model.load(k.query()), (error) => error instanceof AggregateError && error.errors[0] === sentinel);
    c.calls.at(-1).resolve(reply(k, "a")); await failed; off(); assert.equal(c.model.state.status, "success");
    const cycle = assert.rejects(c.model.loadMore(), code("inconsistent_reply")); c.calls.at(-1).resolve(reply(k, "a")); await cycle;
    await answer(c, () => c.model.reload(), reply(k, "a", { completeness: partial })); const count = c.calls.length;
    await c.model.loadMore(); assert.equal(c.calls.length, count); assert.equal(c.model.state.pages[0].completeness, partial);
    await answer(c, () => c.model.reload(), reply(k)); const end = c.calls.length;
    await c.model.loadMore(); assert.equal(c.calls.length, end);
  });
  test(`A M7 paging ${k.name}: clear during a pending page and synchronous success disposal leave old pages readable`, async (t) => {
    const c = context(k, t), first = reply(k, "a"), prefix = await answer(c, () => c.model.load(k.query()), first);
    const cancelled = assert.rejects(c.model.loadMore(), code("cancelled")), old = c.calls.at(-1);
    await c.model.clear(); await cancelled; old.resolve(reply(k, "poison"));
    const off = c.model.subscribe(() => { if (c.model.state.status === "success") c.model.dispose(); });
    const disposed = assert.rejects(c.model.load(k.query()), code("disposed")); c.calls.at(-1).resolve(reply(k, "poison")); await disposed; off();
    assert.equal(c.model.state.status, "idle"); assert.equal(c.model.disposed, true); assert.equal(prefix[0], first); assert.ok(Object.isFrozen(prefix));
    await assert.rejects(c.model.loadMore(), code("disposed"));
  });
}
