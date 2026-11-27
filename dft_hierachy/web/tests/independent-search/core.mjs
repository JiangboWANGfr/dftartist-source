// B's original HDL and existing real Core scope; no A Search witness or fixture.
import assert from "node:assert/strict";
import { real, releaseCore } from "../independent-source-candidates/core.mjs";
import { sdk, vm, product } from "./harness.mjs";
export { releaseCore };

const complete = (reply) => {
  assert.equal(reply.completeness.status, "complete");
  assert.deepEqual(reply.completeness.reasons, []);
  return reply.result;
};
const hold = (promise) => {
  promise.catch(() => {});
  return promise;
};
const byLeaf = () => ({ text: "b_sd_leaf", kinds: ["instance"] });
const bound = (c, query) => ({
  snapshotId: c.snapshot.snapshotId,
  ...query,
});
function model(c, pageSize = 200) {
  const m = new vm.SearchModel(c.client, { pageSize });
  c.models.push(m);
  return m;
}
function tapSearch(client) {
  const descriptor = Object.getOwnPropertyDescriptor(client, "search"),
    original = client.search,
    calls = [];
  Object.defineProperty(client, "search", {
    configurable: true,
    writable: true,
    value: function (...args) {
      const call = { args };
      calls.push(call);
      try {
        const promise = Reflect.apply(original, this, args);
        call.promise = promise;
        promise.then(
          (reply) => {
            call.reply = reply;
          },
          (error) => {
            call.error = error;
          },
        );
        return promise;
      } catch (error) {
        call.error = error;
        throw error;
      }
    },
  });
  return {
    calls,
    restore() {
      if (descriptor) Object.defineProperty(client, "search", descriptor);
      else assert.equal(Reflect.deleteProperty(client, "search"), true);
    },
  };
}
async function readyIndex(c) {
  // Explicit host setup, not automatic SearchModel retry or an index observer in the model.
  let ready = false,
    resolve;
  const event = new Promise((r) => {
      resolve = r;
    }),
    off = c.client.onIndexReady(() => {
      ready = true;
      resolve();
    });
  try {
    let reply = await c.client.search(byLeaf(), { limit: 200 });
    if (reply.completeness.status === "partial") {
      assert.ok(reply.completeness.reasons.length > 0);
      assert.ok(
        reply.completeness.reasons.every((r) => r.code === "indexing"),
        "B plain HDL setup has only the explicit indexing prerequisite",
      );
      if (!ready) await event;
      reply = await c.client.search(byLeaf(), { limit: 200 });
    }
    const items = complete(reply).items;
    assert.deepEqual(
      items.map((hit) => hit.ref),
      c.children.map((child) => child.ref),
      "literal left/right occurrences, not a shared-body representative",
    );
    assert.ok(items.every((hit) => hit.kind === "instance"));
  } finally {
    off();
  }
}
async function withReal(body) {
  assert.ok(product && sdk && vm, "boot the B Search harness first");
  return real("LF", false, async (c) => {
    const tap = tapSearch(c.client);
    try {
      await readyIndex(c);
      tap.calls.length = 0;
      return await body(c, tap.calls);
    } finally {
      tap.restore();
    }
  });
}
function originalPages(m, calls) {
  for (const page of m.state.pages) {
    assert.ok(
      calls.some((call) => call.reply === page),
      "original SDK Reply",
    );
    complete(page);
  }
}
async function scopedRefs(c) {
  const owner = c.children[0],
    ports = complete(await c.client.ports(owner.ref)),
    signals = complete(
      await c.client.signals(owner.ref, {
        limit: 200,
        filter: { text: "d" },
      }),
    ).items,
    port = ports.find((p) => p.name === "d"),
    signal = signals.find((s) => s.name === "d");
  assert.ok(
    port && signal,
    "B literal input d has distinct port/internal signal",
  );
  assert.notEqual(port.ref, signal.ref);
  return { owner, port, signal };
}

export const coreCases = [
  {
    id: "SEARCH-CORE-01-instance-pages",
    input: { fixture: "original B LF", text: "b_sd_leaf", pageSize: 1 },
    expected:
      "two left/right instances by definition name, original Replies/order, one page per command and EOF no-op",
    basis: "DESIGN §6.22.1–3; §5.5.5; B original leaf/top HDL",
    run: () =>
      withReal(async (c, calls) => {
        assert.deepEqual(
          c.children.map((x) => x.name),
          ["left", "right"],
        );
        assert.ok(c.children.every((x) => x.defName === "b_sd_leaf"));
        const m = model(c, 1);
        await m.load(bound(c, byLeaf()));
        assert.equal(calls.length, 1, "no automatic second page");
        assert.equal(m.state.status, "success");
        assert.equal(m.state.pages.length, 1);
        const first = m.state.pages[0];
        assert.equal(first.result.items.length, 1);
        assert.equal(first.result.items[0].ref, c.children[0].ref);
        assert.ok(first.result.next, "one further literal occurrence");
        originalPages(m, calls);
        await m.loadMore();
        assert.equal(calls.length, 2, "exactly one further SDK page");
        assert.equal(m.state.pages.length, 2);
        assert.equal(m.state.pages[0], first, "original prefix identity");
        assert.deepEqual(
          m.state.pages.flatMap((p) => p.result.items.map((h) => h.ref)),
          c.children.map((x) => x.ref),
        );
        assert.equal(m.state.pages[1].result.items.length, 1);
        assert.equal(m.state.pages[1].result.next, undefined);
        assert.equal(calls[1].args[1].cursor, first.result.next);
        originalPages(m, calls);
        const state = m.state;
        await m.loadMore();
        assert.equal(calls.length, 2, "EOF does not query");
        assert.equal(m.state, state, "EOF no publication");
      }),
  },
  {
    id: "SEARCH-CORE-02-scope-address-path",
    input: {
      fixture: "original B LF",
      scope: "left occurrence",
      text: "d",
      kinds: ["port", "signal"],
    },
    expected:
      "scope preserves distinct d port/signal refs and path round-trips; definition ref feeds explicit instancesOf without selecting an occurrence",
    basis: "DESIGN §6.22.2; §5.5.5; B original d declarations/left-right HDL",
    run: () =>
      withReal(async (c, calls) => {
        const { owner, port, signal } = await scopedRefs(c),
          m = model(c);
        await m.load(
          bound(c, { text: "d", kinds: ["port", "signal"], scope: owner.ref }),
        );
        assert.equal(m.state.status, "success");
        assert.equal(m.state.pages.length, 1);
        originalPages(m, calls);
        const hits = m.state.pages[0].result.items,
          dHits = hits.filter((hit) => hit.name === "d");
        // "d" also occurs in b_sd_top's pathText: do not wrongly exclude a lawful q hit.
        assert.deepEqual(
          dHits.map((hit) => ({ kind: hit.kind, ref: hit.ref })),
          [
            { kind: "port", ref: port.ref },
            { kind: "signal", ref: signal.ref },
          ],
        );
        for (const hit of hits) {
          assert.equal(hit.inst, owner.ref);
          const refs = complete(await c.client.resolvePath(hit.pathText));
          assert.ok(
            refs.includes(hit.ref),
            "literal HDL path round-trip includes hit",
          );
        }
        await m.load(
          bound(c, {
            text: "b_sd_leaf",
            kinds: ["definition"],
            scope: owner.ref,
          }),
        );
        originalPages(m, calls);
        const definitions = m.state.pages[0].result.items;
        assert.equal(definitions.length, 1);
        const definition = definitions[0];
        assert.equal(definition.kind, "definition");
        assert.equal(definition.ref, owner.def);
        assert.equal(definition.def, owner.def);
        assert.equal(definition.inst, undefined);
        const instances = complete(
          await c.client.instancesOf(definition.ref, { limit: 200 }),
        );
        assert.deepEqual(
          instances.items.map((x) => x.ref),
          c.children.map((x) => x.ref),
        );
        assert.equal(instances.next, undefined);
      }),
  },
  {
    id: "SEARCH-CORE-03-empty-kinds-core-error",
    input: {
      fixture: "original B LF",
      kinds: [],
      invalidScope: "known port ref",
    },
    expected:
      "empty kinds calls Core; non-instance scope still rejects, preserving the exact original SDK HierError without freezing its specific code",
    basis: "DESIGN §6.22.1–3; §5.5.5 scope is an instance",
    run: () =>
      withReal(async (c, calls) => {
        const { owner, port } = await scopedRefs(c),
          m = model(c);
        await m.load(bound(c, { text: "", kinds: [], scope: owner.ref }));
        assert.equal(calls.length, 1, "empty kinds reaches the real SDK/Core");
        assert.deepEqual(calls[0].args[0].kinds, []);
        assert.equal(m.state.status, "success");
        assert.deepEqual(m.state.pages[0].result.items, []);
        originalPages(m, calls);
        let observed;
        await assert.rejects(
          m.load(bound(c, { text: "", kinds: [], scope: port.ref })),
          (error) => {
            observed = error;
            assert.ok(error instanceof sdk.HierError);
            assert.equal(error.origin, "core");
            return true;
          },
        );
        assert.equal(calls.length, 2);
        assert.equal(
          calls[1].error,
          observed,
          "unwrapped original SDK rejection",
        );
        assert.equal(m.state.status, "failed");
        assert.equal(m.state.error.code, observed.code);
        assert.equal(m.state.error.origin, observed.origin);
      }),
  },
  {
    id: "SEARCH-CORE-04-shared-sdk-ownership",
    input: { fixture: "original B LF", operations: ["cancel", "dispose"] },
    expected:
      "cancelling/disposing only the model leaves concurrent shared direct SDK search and later SDK access alive",
    basis: "DESIGN §6.22.3 and inherited §6.11.3 borrowed SDK cancellation",
    run: () =>
      withReal(async (c) => {
        const query = byLeaf(),
          q = bound(c, query),
          expected = c.children.map((x) => x.ref),
          m = model(c),
          task = hold(m.load(q)),
          direct = hold(c.client.search(query, { limit: 200 }));
        assert.equal(
          m.state.status,
          "pending",
          "same-stack model task started",
        );
        await m.cancel();
        await assert.rejects(task, (error) => error.code === "cancelled");
        assert.deepEqual(
          complete(await direct).items.map((x) => x.ref),
          expected,
        );
        const second = model(c),
          secondTask = hold(second.load(q)),
          secondDirect = hold(c.client.search(query, { limit: 200 }));
        assert.equal(second.state.status, "pending");
        second.dispose();
        await assert.rejects(secondTask, (error) => error.code === "disposed");
        assert.deepEqual(
          complete(await secondDirect).items.map((x) => x.ref),
          expected,
        );
        assert.equal(c.client.snapshot.snapshotId, c.snapshot.snapshotId);
        const roots = complete(await c.client.roots());
        assert.ok(roots.some((x) => x.ref === c.root.ref));
      }),
  },
];

// Explicit SDK/Core premise only, never counted as a SearchModel test.
export async function sdkCoreControl() {
  return withReal(async (c) => {
    const expected = c.children.map((x) => x.ref),
      first = await c.client.search(byLeaf(), { limit: 1 });
    assert.deepEqual(
      complete(first).items.map((x) => x.ref),
      [expected[0]],
    );
    assert.ok(first.result.next);
    const second = await c.client.search(byLeaf(), {
      limit: 1,
      cursor: first.result.next,
    });
    assert.deepEqual(
      complete(second).items.map((x) => x.ref),
      [expected[1]],
    );
    assert.equal(second.result.next, undefined);
    return { fixture: "original B LF", sdkOnly: true, occurrences: 2 };
  });
}
