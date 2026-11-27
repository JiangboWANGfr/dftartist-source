import assert from "node:assert/strict";
import { test } from "node:test";
import { PagedQueryModel } from "../../packages/viewmodel/dist/paged-query-model.js";
import { SearchError } from "../../packages/viewmodel/dist/search-types.js";

test("A M7 paging resources: long chains do not rescan old cursor fields or retain history after clear/dispose", async (t) => {
  const originalAdd = Set.prototype.add, originalClear = Set.prototype.clear, held = new Map();
  Set.prototype.add = function (value) {
    if (typeof value === "string" && value.startsWith("A-M7-resource/")) {
      let values = held.get(this); if (!values) held.set(this, values = new Set());
      originalAdd.call(values, value);
    }
    return originalAdd.call(this, value);
  };
  Set.prototype.clear = function () { held.delete(this); return originalClear.call(this); };
  t.after(() => { Set.prototype.add = originalAdd; Set.prototype.clear = originalClear; });
  let reads = 0, index = 0;
  const size = 2048, replies = [];
  const model = new PagedQueryModel({ snapshot: { snapshotId: "A-M7" } }, {
    Error: SearchError, origin: "search", label: "Search", replyName: "search", invalidPageMessage: "bad chain", pageSize: 1,
    sameQuery: (a, b) => a === b,
    request: async () => {
      const cursor = `A-M7-resource/${++index}`;
      const value = Object.freeze({ result: Object.freeze({ items: Object.freeze([]), get next() { reads++; return cursor; } }), completeness: Object.freeze({ status: "complete" }) });
      replies.push(value); return value;
    },
  }, "A-M7");
  t.after(() => model.dispose());
  await model.load(() => "query"); for (let n = 1; n < size; ++n) await model.loadMore();
  assert.equal(model.state.pages.length, size); assert.equal(model.state.pages[0], replies[0]);
  assert.ok(reads <= size * 6, `cursor reads ${reads} exceed a linear per-page budget`);
  const prefix = model.state.pages;
  assert.equal([...held.values()].reduce((n, s) => n + s.size, 0), size);
  await model.clear(); assert.equal(held.size, 0); assert.equal(prefix.length, size); assert.equal(prefix[0], replies[0]);
  await model.load(() => "new chain"); assert.equal([...held.values()].reduce((n, s) => n + s.size, 0), 1);
  await model.reload(); assert.equal([...held.values()].reduce((n, s) => n + s.size, 0), 1);
  model.dispose(); assert.equal(held.size, 0);
});
