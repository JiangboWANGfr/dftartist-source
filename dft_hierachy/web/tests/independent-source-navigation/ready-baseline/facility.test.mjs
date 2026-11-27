// Existing public SDK/Candidates reachability controls only; NO Navigation emulation.
import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { boot, H, C, context, turn, partial, complete } from "../harness.mjs";
await boot(false);
test("B supplemental inventory has explicit unique input/expected/basis", () => {
  assert.equal(cases.length, 26);
  assert.equal(new Set(cases.map((x) => x.id)).size, 26);
  for (const c of cases)
    assert.ok(
      c.input !== undefined &&
        c.expected &&
        c.basis &&
        typeof c.run === "function",
    );
});
for (const code of ["not_found", "cancelled"])
  test(
    "real old Candidates " +
      code +
      "→ordinary loadMore retry partial; no automatic coordinator",
    async () => {
      const c = await context({ withModel: false }),
        m = new H.vm.SourceCandidatesModel(c.client, { pageSize: 2 });
      c.models.push(m);
      let events = 0;
      const off = c.client.onIndexReady(() => events++);
      const observe = (p) => {
        const o = H.observe(p);
        c.commands.push(o);
        return o;
      };
      try {
        const query = {
          snapshotId: c.client.snapshot.snapshotId,
          file: "B-source-file/尾",
          line: 1,
          col: 1,
        };
        const first = observe(m.load(query)),
          q = await c.wire.next("source.resolve");
        c.wire.emit({ event: "index", state: "ready" });
        c.wire.fail(q, code);
        const e = await H.failure(first, code);
        assert.equal(
          e,
          c.calls.findLast((x) => x.method === "resolveSource").error,
        );
        await turn();
        assert.equal(c.wire.queries.length, 1);
        assert.equal(events, 1);
        const retry = observe(m.loadMore()),
          second = await c.wire.next("source.resolve");
        assert.equal(second.params.cursor, "");
        c.wire.ok(second, C.page([]), partial);
        await H.success(retry);
        assert.equal(m.state.status, "success");
        assert.equal(
          m.state.pages[0],
          c.calls.findLast((x) => x.method === "resolveSource").reply,
        );
        await turn();
        assert.equal(c.wire.queries.length, 2);
      } finally {
        off();
        await c.close();
      }
    },
  );
test("real old pending listener can receive ready before SDK source.resolve send", async () => {
  const c = await context({ withModel: false }),
    m = new H.vm.SourceCandidatesModel(c.client);
  c.models.push(m);
  const order = [];
  let inject = true;
  const off = c.client.onIndexReady(() => order.push("ready"));
  m.subscribe(() => {
    if (inject && m.state.status === "pending") {
      inject = false;
      order.push("pending");
      assert.equal(c.wire.queries.length, 0);
      c.wire.emit({ event: "index", state: "ready" });
      order.push("pending-return");
    }
  });
  try {
    const o = H.observe(
      m.load({
        snapshotId: c.client.snapshot.snapshotId,
        file: "B-source-file/尾",
        line: 1,
        col: 1,
      }),
    );
    c.commands.push(o);
    const q = await c.wire.next("source.resolve");
    order.push("SDK-send-observed");
    assert.deepEqual(order, [
      "pending",
      "ready",
      "pending-return",
      "SDK-send-observed",
    ]);
    c.wire.ok(q, C.page([]), partial);
    await H.success(o);
    await turn();
    assert.equal(c.wire.queries.length, 1);
  } finally {
    off();
    await c.close();
  }
});
