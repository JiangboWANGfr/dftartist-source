// Original B LF HDL + accepted B real Core scope, no A fixture or witness.
import assert from "node:assert/strict";
import { real, releaseCore } from "../independent-source-candidates/core.mjs";
import { sdk, vm, product } from "./harness.mjs";
export { releaseCore };
const complete = (r) => {
  assert.equal(r.completeness.status, "complete");
  assert.deepEqual(r.completeness.reasons, []);
  return r.result;
};
const hold = (p) => {
  p.catch(() => {});
  return p;
};
function tap(client) {
  const descriptor = Object.getOwnPropertyDescriptor(client, "instancesOf"),
    original = client.instancesOf,
    calls = [];
  Object.defineProperty(client, "instancesOf", {
    configurable: true,
    writable: true,
    value: function (...args) {
      const call = { args };
      calls.push(call);
      try {
        const p = Reflect.apply(original, this, args);
        call.promise = p;
        p.then(
          (r) => {
            call.reply = r;
          },
          (e) => {
            call.error = e;
          },
        );
        return p;
      } catch (e) {
        call.error = e;
        throw e;
      }
    },
  });
  return {
    calls,
    restore() {
      if (descriptor) Object.defineProperty(client, "instancesOf", descriptor);
      else assert(Reflect.deleteProperty(client, "instancesOf"));
    },
  };
}
function model(c, size = 200) {
  const m = new vm.DefinitionInstancesModel(c.client, { pageSize: size });
  c.models.push(m);
  return m;
}
const bound = (c) => ({
  snapshotId: c.snapshot.snapshotId,
  def: c.children[0].def,
});
async function withReal(fn) {
  assert(product && sdk && vm, "boot B harness");
  return real("LF", false, async (c) => {
    const t = tap(c.client);
    try {
      return await fn(c, t.calls);
    } finally {
      t.restore();
    }
  });
}
export const coreCases = [
  {
    id: "DI-CORE-01-pages-explicit-confirm",
    input: { fixture: "original B LF", definition: "b_sd_leaf", pageSize: 1 },
    expected:
      "left/right original occurrence pages, no auto selection/reveal; explicit second ObjectRef selection and Tree.reveal; shared definition not merged",
    basis: "DESIGN §6.24.1–3, §5.5.5; original B literal HDL/children metadata",
    run: () =>
      withReal(async (c, calls) => {
        const m = model(c, 1),
          q = bound(c),
          selection = new vm.SelectionModel({ snapshotId: q.snapshotId }),
          tree = new vm.TreeModel(c.client);
        c.models.push(selection, tree);
        selection.select({
          snapshotId: q.snapshotId,
          origin: "external",
          items: [{ def: q.def }],
        });
        const before = selection.current;
        await m.load(q);
        assert.equal(calls.length, 1);
        assert.equal(m.state.status, "success");
        assert.equal(m.state.pages[0], calls[0].reply);
        assert.equal(m.state.pages[0].result.items.length, 1);
        assert.equal(m.state.pages[0].result.items[0].ref, c.children[0].ref);
        assert(m.state.pages[0].result.next);
        assert.equal(selection.current, before);
        assert.equal(tree.revealState.status, "idle");
        const first = m.state.pages[0];
        await m.loadMore();
        assert.equal(calls.length, 2);
        assert.equal(calls[1].args[1].cursor, first.result.next);
        assert.equal(m.state.pages[0], first);
        assert.equal(m.state.pages[1], calls[1].reply);
        assert.deepEqual(
          m.state.pages.flatMap((p) => complete(p).items.map((x) => x.ref)),
          c.children.map((x) => x.ref),
        );
        assert(c.children.every((x) => x.def === q.def));
        assert.equal(m.state.pages[1].result.next, undefined);
        assert.equal(selection.current, before);
        const state = m.state;
        await m.loadMore();
        assert.equal(m.state, state);
        assert.equal(calls.length, 2);
        const picked = m.state.pages[1].result.items[0];
        selection.select({
          snapshotId: q.snapshotId,
          origin: "external",
          items: [{ ref: picked.ref }],
        });
        await tree.reveal(picked.ref);
        assert.deepEqual(selection.current.items, [{ ref: c.children[1].ref }]);
        assert.equal(tree.revealState.status, "success");
        assert.equal(tree.revealState.ref, c.children[1].ref);
        selection.back();
        assert.deepEqual(selection.current.items, [{ def: q.def }]);
        selection.forward();
        assert.deepEqual(selection.current.items, [{ ref: picked.ref }]);
      }),
  },
  {
    id: "DI-CORE-02-invalid-definition",
    input: {
      fixture: "original B LF",
      def: "known instance ObjectRef as syntactically valid def",
    },
    expected:
      "Core decides semantic validity; exact HierError retained, no fake empty success; explicit good target recovers",
    basis: "DESIGN §6.24.1–3; opaque DefRef schema and Core address authority",
    run: () =>
      withReal(async (c, calls) => {
        const m = model(c);
        let raw;
        await assert.rejects(
          m.load({ snapshotId: c.snapshot.snapshotId, def: c.root.ref }),
          (e) => {
            raw = e;
            assert(e instanceof sdk.HierError);
            assert.equal(e.origin, "core");
            return true;
          },
        );
        assert.equal(calls[0].error, raw);
        assert.equal(m.state.status, "failed");
        assert.equal(m.state.error.code, raw.code);
        await m.load(bound(c));
        assert.equal(m.state.status, "success");
        assert.deepEqual(
          complete(m.state.pages[0]).items.map((x) => x.ref),
          c.children.map((x) => x.ref),
        );
      }),
  },
  {
    id: "DI-CORE-03-shared-sdk",
    input: { fixture: "original B LF", commands: ["cancel", "dispose"] },
    expected:
      "same-stack cancel/dispose rejects own task only; concurrent direct SDK and later roots survive",
    basis: "DESIGN §6.24.3 borrowed ownership; original B HDL",
    run: () =>
      withReal(async (c) => {
        for (const action of ["cancel", "dispose"]) {
          const m = model(c),
            q = bound(c),
            task = hold(m.load(q)),
            direct = hold(c.client.instancesOf(q.def, { limit: 200 }));
          assert.equal(m.state.status, "pending");
          if (action === "cancel") await m.cancel();
          else m.dispose();
          await assert.rejects(
            task,
            (e) => e.code === (action === "cancel" ? "cancelled" : "disposed"),
          );
          assert.deepEqual(
            complete(await direct).items.map((x) => x.ref),
            c.children.map((x) => x.ref),
          );
        }
        assert.equal(c.client.snapshot.snapshotId, c.snapshot.snapshotId);
        assert(
          complete(await c.client.roots()).some((x) => x.ref === c.root.ref),
        );
      }),
  },
];
// Only verifies pre-existing SDK/Core/Selection/Tree ability, never the new model.
export async function sdkCoreControl() {
  let wire;
  const value = await withReal(async (c, calls) => {
    wire = c.wire;
    const q = bound(c),
      first = await c.client.instancesOf(q.def, { limit: 1 });
    assert.deepEqual(
      complete(first).items.map((x) => x.ref),
      [c.children[0].ref],
    );
    assert(first.result.next);
    const second = await c.client.instancesOf(q.def, {
      limit: 1,
      cursor: first.result.next,
    });
    assert.deepEqual(
      complete(second).items.map((x) => x.ref),
      [c.children[1].ref],
    );
    assert.equal(second.result.next, undefined);
    assert.equal(calls[0].reply, first);
    assert.equal(calls[1].reply, second);
    const selection = new vm.SelectionModel({ snapshotId: q.snapshotId }),
      tree = new vm.TreeModel(c.client);
    c.models.push(selection, tree);
    selection.select({
      snapshotId: q.snapshotId,
      origin: "external",
      items: [{ def: q.def }],
    });
    assert.deepEqual(selection.current.items, [{ def: q.def }]);
    selection.select({
      snapshotId: q.snapshotId,
      origin: "external",
      items: [{ ref: c.children[1].ref }],
    });
    await tree.reveal(c.children[1].ref);
    assert.equal(tree.revealState.status, "success");
    assert.equal(tree.revealState.ref, c.children[1].ref);
    return { fixture: "original B LF", sdkOnly: true, occurrences: 2 };
  });
  assert.deepEqual(await wire.exited, { code: 0, signal: null });
  return { ...value, exit: await wire.exited };
}
