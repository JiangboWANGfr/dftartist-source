// Narrow normal-path regression for B48's real context dependency. No heap/UI oracle.
import test from "node:test";
import assert from "node:assert/strict";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
import { ready } from "../pointer-rebind/public-model.mjs";
import { cursor } from "../pagination/public-model.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P, "explicit fixed product");
const classes = {
  ...(await import(publicEntry(P, "@hier/client"))),
  ...(await import(publicEntry(P, "@hier/viewmodel"))),
};
for (const command of ["loadMore", "reloadCandidates"])
  test(
    "B49 normal ready -> " + command + " -> settle -> context close",
    async () => {
      const c = await ready(classes),
        document = c.document,
        selection = c.s.current;
      try {
        const p = c.n[command]();
        p.catch(() => {});
        c.owned.push(p);
        const q = await c.next("source.resolve");
        assert.equal(q.params.cursor, command === "loadMore" ? cursor : "");
        assert.equal(c.n.state.candidates.state.status, "pending");
        c.reply(q, "complete", false, true);
        await p;
        assert.equal(c.n.state.candidates.state.status, "success");
        assert.equal(c.n.state.document.data, document);
        assert.equal(c.s.current, selection);
      } finally {
        assert.deepEqual(await c.close(), []);
        assert.equal(c.n.disposed, true);
        assert.equal(c.s.disposed, true);
        assert.equal(c.messages.size, 0);
        assert.equal(c.closes.size, 0);
      }
    },
  );
