import { test, after } from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import {
  capability,
  using,
  unready,
  source,
  command,
  vm,
  HierError,
  deep,
  tick,
  snapshotProbe,
  consistent,
  find,
  designNodes,
  local,
  releaseAll,
} from "./harness.mjs";
import { fragment, node, X, Y, Z, edge, external, deferred } from "./input.mjs";
import { realInput } from "./core-input.mjs";
const bodies = {
  G01: async () => {
    await unready(async (c) => {
      const probe = snapshotProbe(c.client);
      try {
        assert.throws(
          () => new vm.GraphSession(c.client),
          (e) => e === probe.errors[0],
        );
        assert.equal(probe.errors.length, 1);
      } finally {
        probe.restore();
      }
    });
    await using(async (c) => {
      const g = c.graph;
      assert.equal(g.snapshotId, c.snap.snapshotId);
      assert.equal(g.state.sessionId, g.id);
      assert.equal(g.state.revision, 0);
      assert.deepEqual(g.state.sources, []);
      assert.deepEqual(g.state.nodes, []);
      assert.deepEqual(g.state.edges, []);
      deep(g.state);
      assert.equal(c.wire.queries.length, 0);
      assert.equal(c.indexRegistrations, 0);
      g.dispose();
      assert.equal(c.client.snapshot.snapshotId, c.snap.snapshotId);
      assert.equal(c.wire.closed, false);
    });
  },
  G02: () =>
    using(async (c) => {
      const a = source(c, "plan", ""),
        b = source(c, "plan", "");
      assert.notEqual(a.id, b.id);
      assert.deepEqual(a.state, {
        id: a.id,
        label: "",
        origin: "plan",
        revision: 0,
        status: "idle",
        content: null,
      });
      assert.equal(c.graph.state.revision, 0);
      assert.deepEqual(c.graph.state.sources, []);
      for (const v of [
        null,
        { label: "x", origin: "worker" },
        { label: "x", origin: "plan", id: "chosen" },
        { label: undefined, origin: "plan" },
      ])
        assert.throws(() => c.graph.registerSource(v), local("invalid_argument"));
      await command(c, a, "dispose");
      const d = source(c, "plan", "");
      assert.notEqual(d.id, a.id);
      const g2 = new vm.GraphSession(c.client);
      c.models.push(g2);
      assert.notEqual(g2.id, c.graph.id);
    }),
  G03: () =>
    using(async (c) => {
      const a = source(c),
        b = source(c),
        u = source(c, "design");
      await command(c, a, "replace", fragment(c, [X(), Y()]));
      await command(c, b, "replace", fragment(c, [X()]));
      await command(c, u, "replace", fragment(c, [X()]));
      assert.deepEqual(find(c, "B-x").owners, [a.id, b.id, u.id]);
      await command(c, a, "replace", fragment(c, [X(), Z()]));
      assert.equal(find(c, "B-y"), undefined);
      assert(find(c, "B-z"));
      await command(c, a, "clear");
      assert.deepEqual(
        designNodes(c).map((x) => x.node.value.id),
        ["B-x"],
      );
      assert.deepEqual(find(c, "B-x").owners, [b.id, u.id]);
      await command(c, b, "dispose");
      assert.deepEqual(find(c, "B-x").owners, [u.id]);
      await command(c, u, "clear");
      assert.deepEqual(c.graph.state.nodes, []);
      consistent(c.graph.state);
    }),
  G04: () =>
    using(async (c) => {
      const a = source(c),
        b = source(c),
        seen = [];
      c.graph.subscribe(() => {
        consistent(c.graph.state);
        seen.push(c.graph.state);
      });
      const f = fragment(c, [X(), Y()], [edge()]);
      await command(c, b, "replace", f);
      await command(c, a, "replace", f);
      assert.deepEqual(c.graph.state.edges[0].owners, [a.id, b.id]);
      assert.deepEqual(
        c.graph.state.sources.map((s) => s.id),
        [a.id, b.id],
      );
      await command(c, a, "clear");
      assert.equal(c.graph.state.edges.length, 1);
      assert.deepEqual(c.graph.state.edges[0].owners, [b.id]);
      await command(c, b, "clear");
      assert.equal(c.graph.state.edges.length, 0);
      assert.equal(seen.length, 4);
    }),
  G05: () =>
    using(async (c) => {
      const a = source(c, "plan"),
        b = source(c, "plan");
      const make = (label) =>
        fragment(
          c,
          [external("node1", label, { ports: [{ key: "p", label: "port" }] })],
          [
            {
              kind: "external",
              key: "e",
              label: "线",
              from: { node: { kind: "external", key: "node1" }, port: "p" },
              to: { node: { kind: "external", key: "node1" } },
            },
          ],
        );
      await command(c, a, "replace", make("同名"));
      await command(c, b, "replace", make("同名"));
      assert.equal(c.graph.state.nodes.length, 2);
      assert.equal(c.graph.state.edges.length, 2);
      const before = c.graph.state.nodes.find((n) => n.owners[0] === a.id).id,
        oldEdge = c.graph.state.edges.find((e) => e.owners[0] === a.id).id;
      await command(c, a, "replace", make("新标签"));
      assert.equal(c.graph.state.nodes.find((n) => n.owners[0] === a.id).id, before);
      assert.equal(c.graph.state.edges.find((e) => e.owners[0] === a.id).id, oldEdge);
      await command(c, a, "clear");
      await command(c, a, "replace", make("again"));
      assert.equal(c.graph.state.nodes.find((n) => n.owners[0] === a.id).id, before);
      await command(c, a, "dispose");
      const n = source(c, "plan");
      await command(c, n, "replace", make("again"));
      assert.notEqual(c.graph.state.nodes.find((x) => x.owners[0] === n.id).id, before);
    }),
  G06: () =>
    using(async (c) => {
      const a = source(c),
        ns = [
          X(),
          Y(),
          node("B-bits", "B-signal-x", { lsb: 1, width: 1 }),
          node("B-inside", "B-port", { lsb: 0, width: 1 }, "inside"),
          node("B-outside", "B-port", { lsb: 0, width: 1 }, "outside"),
        ],
        es = [edge("B-edge-2", "B-fact-2"), edge("B-edge-1", "B-fact-1")];
      await command(c, a, "replace", fragment(c, ns, es));
      assert.equal(c.graph.state.nodes.length, 5);
      assert.equal(c.graph.state.edges.length, 2);
      assert.deepEqual(
        c.graph.state.nodes.map((x) => x.node.value.id),
        ns.map((x) => x.value.id).sort(),
      );
      assert.deepEqual(
        c.graph.state.edges.map((x) => x.edge.value.id),
        ["B-edge-1", "B-edge-2"],
      );
      for (const n of ns) assert.deepEqual(find(c, n.value.id).node, n);
      for (const e of es)
        assert.deepEqual(c.graph.state.edges.find((x) => x.edge.value.id === e.value.id).edge, e);
    }),
  G07: () =>
    using(async (c) => {
      const a = source(c),
        f = fragment(c, [X()], [], {
          completeness: { status: "partial", reasons: [{ code: "budget_nodes", B_extra: [1] }] },
          frontier: [{ point: X().value.point, depth: 1, reason: "budget_nodes" }],
          hasConservative: true,
        });
      f.nodes[0].value.B_extra = { nested: [1, "原文"] };
      await command(c, a, "replace", f);
      const old = c.graph.state,
        content = a.state.content;
      deep(old);
      assert.equal(content.sourceRevision, a.state.revision);
      assert.deepEqual(content.completeness, f.completeness);
      assert.deepEqual(content.frontier, f.frontier);
      assert.equal(content.hasConservative, true);
      f.nodes[0].value.B_extra.nested.push(2);
      f.completeness.reasons.length = 0;
      assert.deepEqual(old.nodes[0].node.value.B_extra.nested, [1, "原文"]);
      assert.equal(content.completeness.status, "partial");
      assert.equal(content.completeness.reasons.length, 1);
      await command(c, a, "replace", fragment(c));
      assert(a.state.content);
      assert.deepEqual(a.state.content.nodes, []);
      await command(c, a, "clear");
      assert.equal(a.state.content, null);
      assert.equal(a.state.status, "idle");
      assert.equal(old.nodes.length, 1);
    }),
  G08: () =>
    using(async (c) => {
      const a = source(c),
        d = deferred();
      await command(c, a, "replace", fragment(c, [X()]));
      let ctx;
      const pending = command(c, a, "refresh", (x) => {
        ctx = x;
        return d.promise;
      });
      const before = c.graph.state;
      const e = external();
      const exedge = {
        kind: "external",
        key: "e",
        label: "",
        from: { node: { kind: "external", key: "missing" } },
        to: { node: { kind: "external", key: "node1" } },
      };
      const bad = [
        fragment(c, [X(), X()]),
        fragment(c, [X(), Y()], [edge(), edge()]),
        fragment(c, [e], [exedge]),
        fragment(c, [
          external("n", "", {
            ports: [
              { key: "p", label: "" },
              { key: "p", label: "" },
            ],
          }),
        ]),
        fragment(c, [external("", "")]),
        fragment(c, [external("n\0", "")]),
        fragment(c, [{ ...external(), target: undefined }]),
        { ...fragment(c), layout: {} },
        fragment(c, [{ ...X(), extra: true }]),
        fragment(c, [{ ...external(), extra: 1 }]),
        { ...fragment(c), hasConservative: undefined },
        fragment(c, [X()], [], {
          completeness: { status: "complete", reasons: [], B_bad: Infinity },
        }),
      ];
      for (const f of bad) {
        await assert.rejects(command(c, a, "replace", f), local("invalid_argument"));
        assert.equal(c.graph.state, before);
        assert.equal(ctx.signal.aborted, false);
      }
      const design = source(c, "design");
      await assert.rejects(
        command(c, design, "replace", fragment(c, [external()])),
        local("invalid_argument"),
      );
      await command(c, a, "cancel");
      await assert.rejects(pending, local("cancelled"));
      d.resolve(fragment(c));
    }),
  G09: () =>
    using(async (c) => {
      const a = source(c),
        b = source(c);
      const x = X();
      x.value.B_extra = { a: 1, b: [1, 2] };
      await command(c, a, "replace", fragment(c, [x]));
      const reordered = X();
      reordered.value.B_extra = { b: [1, 2], a: 1 };
      await command(c, b, "replace", fragment(c, [reordered]));
      const before = c.graph.state;
      const foreign = fragment(c, [Z()], [], { snapshotId: "B-other-snapshot" });
      await assert.rejects(command(c, b, "replace", foreign), local("snapshot_mismatch"));
      assert.equal(c.graph.state, before);
      for (const change of [
        (v) => {
          v.B_extra.b = [2, 1];
        },
        (v) => {
          delete v.B_extra;
        },
        (v) => {
          v.B_optional = null;
        },
      ]) {
        const conflict = structuredClone(x);
        change(conflict.value);
        await assert.rejects(
          command(c, b, "replace", fragment(c, [conflict, Z()])),
          local("conflicting_fact"),
        );
        assert.equal(c.graph.state, before);
        assert.equal(find(c, "B-z"), undefined);
      }
    }),
  G10: () =>
    using(async (c) => {
      const a = source(c);
      let calls = 0;
      c.graph.subscribe(() => calls++);
      await command(c, a, "cancel");
      assert.equal(calls, 0);
      for (const name of ["replace", "replace", "clear", "clear"]) {
        const r = c.graph.state.revision,
          sr = a.state.revision;
        await command(c, a, name, ...(name === "replace" ? [fragment(c)] : []));
        assert.equal(c.graph.state.revision, r + 1);
        assert.equal(a.state.revision, sr + 1);
      }
      await command(c, a, "dispose");
      const end = c.graph.state;
      await command(c, a, "dispose");
      assert.equal(c.graph.state, end);
      assert.equal(calls, 5);
      assert.equal(a.state.status, "disposed");
      assert.equal(a.disposed, true);
      deep(a.state);
      await assert.rejects(command(c, a, "clear"), local("source_disposed"));
    }),
  G11: () =>
    using(async (c) => {
      const a = source(c),
        events = [];
      c.graph.subscribe(() => events.push(c.graph.state));
      let captured;
      await command(c, a, "refresh", (ctx) => {
        captured = ctx;
        assert.equal(a.state.status, "pending");
        assert.equal(events.length, 1);
        assert.equal(a.state.revision, ctx.sourceRevision);
        return fragment(c, [X()]);
      });
      assert.deepEqual(
        Object.keys(captured).sort(),
        ["sessionId", "snapshotId", "sourceId", "sourceRevision", "signal"].sort(),
      );
      assert.equal(captured.sessionId, c.graph.id);
      assert.equal(captured.snapshotId, c.snap.snapshotId);
      assert.equal(captured.sourceId, a.id);
      assert(captured.signal instanceof AbortSignal);
      assert.equal(events.length, 2);
      assert.equal(a.state.status, "success");
      assert.equal(a.state.revision, 1);
      assert.equal(a.state.content.sourceRevision, 1);
      assert.equal(c.graph.state.revision, 2);
    }),
  G12: () =>
    using(async (c) => {
      const a = source(c),
        one = deferred(),
        two = deferred();
      let c1, c2;
      const p = command(c, a, "refresh", (x) => {
          c1 = x;
          return one.promise;
        }),
        q = command(c, a, "refresh", (x) => {
          c2 = x;
          return two.promise;
        });
      await assert.rejects(p, local("cancelled"));
      assert.equal(c1.signal.aborted, true);
      assert.equal(c2.signal.aborted, false);
      assert(c2.sourceRevision > c1.sourceRevision);
      two.resolve(fragment(c, [Z()]));
      await q;
      const state = c.graph.state;
      one.reject(new Error("B old rejection consumed"));
      await tick();
      assert.equal(c.graph.state, state);
      assert(find(c, "B-z"));
    }),
  G13: () =>
    using(async (c) => {
      const a = source(c),
        d = deferred();
      const p = command(c, a, "refresh", () => d.promise);
      await command(c, a, "replace", fragment(c, [Y()]));
      await assert.rejects(p, local("cancelled"));
      const state = c.graph.state;
      d.resolve(fragment(c, [X()]));
      await tick();
      assert.equal(c.graph.state, state);
      assert.equal(find(c, "B-x"), undefined);
      assert(find(c, "B-y"));
    }),
  G14: async () => {
    for (const name of ["clear", "dispose"])
      await using(async (c) => {
        const a = source(c),
          d = deferred();
        let signal;
        const p = command(c, a, "refresh", (x) => {
          signal = x.signal;
          return d.promise;
        });
        await command(c, a, name);
        await assert.rejects(p, local(name === "clear" ? "cancelled" : "source_disposed"));
        assert(signal.aborted);
        const state = c.graph.state;
        d.resolve(fragment(c, [Z()]));
        await tick();
        assert.equal(c.graph.state, state);
        assert.equal(c.graph.state.nodes.length, 0);
        assert.equal(
          c.graph.state.sources.some((s) => s.id === a.id),
          name === "clear",
        );
      });
  },
  G15: () =>
    using(async (c) => {
      const a = source(c),
        b = source(c),
        da = deferred(),
        db = deferred();
      await command(
        c,
        a,
        "replace",
        fragment(c, [X()], [], {
          completeness: { status: "partial", reasons: [{ code: "budget_nodes" }] },
        }),
      );
      const content = a.state.content;
      let ca, cb;
      const pa = command(c, a, "refresh", (x) => {
          ca = x;
          return da.promise;
        }),
        pb = command(c, b, "refresh", (x) => {
          cb = x;
          return db.promise;
        });
      assert.deepEqual(a.state.content, content);
      await command(c, a, "cancel");
      await assert.rejects(pa, local("cancelled"));
      assert(ca.signal.aborted);
      assert.equal(cb.signal.aborted, false);
      assert.equal(a.state.status, "cancelled");
      assert.equal(a.state.error.code, "cancelled");
      assert.deepEqual(a.state.content, content);
      assert(a.state.content.sourceRevision < a.state.revision);
      db.resolve(fragment(c, [Z()]));
      await pb;
      da.resolve(fragment(c, [Y()]));
      await tick();
      assert(find(c, "B-x"));
      assert(find(c, "B-z"));
      assert.equal(find(c, "B-y"), undefined);
    }),
  G16: () =>
    using(async (c) => {
      const a = source(c);
      await command(c, a, "replace", fragment(c, [X()]));
      const content = a.state.content,
        marker = new Error("B provider cause"),
        remote = new HierError("invalid_argument", "core", "B core refusal", { B: [1] });
      const providers = [
        () => {
          throw marker;
        },
        () => Promise.reject(marker),
        () =>
          Object.defineProperty({}, "then", {
            get() {
              throw marker;
            },
          }),
        () => ({ invalid: true }),
        () => Promise.reject(remote),
      ];
      for (const loader of providers) {
        const p = command(c, a, "refresh", loader);
        const e = await p.then(
          () => assert.fail("must reject"),
          (e) => e,
        );
        if (loader === providers.at(-1)) {
          assert.equal(e, remote);
          assert.equal(a.state.error.origin, "core");
        } else if (loader === providers[3]) assert(local("invalid_argument")(e));
        else {
          assert(local("source_failure")(e));
          assert.equal(e.cause, marker);
        }
        assert.equal(a.state.status, "failed");
        assert.deepEqual(a.state.content, content);
        deep(a.state.error);
        assert.equal(a.state.content.sourceRevision, 1);
      }
    }),
  G17: () =>
    using(async (c) => {
      const a = source(c),
        d = deferred();
      let ctx;
      const p = command(c, a, "refresh", (x) => {
        ctx = x;
        return d.promise;
      });
      const before = c.graph.state,
        marker = new Error("B input getter");
      const bad = fragment(c);
      Object.defineProperty(bad, "nodes", {
        enumerable: true,
        get() {
          throw marker;
        },
      });
      const error = await command(c, a, "replace", bad).then(
        () => assert.fail("getter must reject"),
        (e) => e,
      );
      assert(local("invalid_argument")(error));
      assert.equal(error.cause, marker);
      assert.equal(c.graph.state, before);
      assert.equal(ctx.signal.aborted, false);
      const f = fragment(c, [X()]),
        counts = {},
        read = {};
      let nested;
      for (const [key, value] of Object.entries(f))
        Object.defineProperty(read, key, {
          enumerable: true,
          get() {
            counts[key] = (counts[key] ?? 0) + 1;
            if (key === "nodes") {
              nested = command(c, a, "clear");
              assert.throws(() => source(c), local("reentrant_change"));
            }
            return value;
          },
        });
      await command(c, a, "replace", read);
      await assert.rejects(nested, local("reentrant_change"));
      await assert.rejects(p, local("cancelled"));
      assert(Object.values(counts).every((n) => n === 1));
      assert.equal(Object.keys(counts).length, Object.keys(f).length);
      d.resolve(fragment(c));
    }),
  G18: () =>
    using(async (c) => {
      const a = source(c);
      await command(c, a, "replace", fragment(c, [X()]));
      const old = c.graph.state;
      let calls = 0;
      c.graph.subscribe(() => calls++);
      const f = fragment(c, [external()]);
      Object.defineProperty(f.nodes[0], "label", {
        enumerable: true,
        get() {
          c.graph.dispose();
          return "B";
        },
      });
      await assert.rejects(command(c, a, "replace", f), local("disposed"));
      assert(c.graph.disposed && a.disposed);
      assert.equal(c.graph.state.revision, old.revision);
      assert.deepEqual(c.graph.state.nodes, []);
      assert.deepEqual(c.graph.state.edges, []);
      assert.deepEqual(c.graph.state.sources, []);
      assert.equal(calls, 0);
      assert.equal(old.nodes.length, 1);
      await command(c, a, "dispose");
      await assert.rejects(command(c, a, "replace", null), local("disposed"));
      assert.throws(() => c.graph.registerSource(null), local("disposed"));
      assert.throws(() => c.graph.subscribe(null), local("disposed"));
      assert.equal(c.wire.closed, false);
      deep(old);
    }),
  G19: () =>
    using(async (c) => {
      const a = source(c),
        events = [],
        marker = new Error("B listener");
      let late = false,
        offSecond;
      const offFirst = c.graph.subscribe(() => {
        events.push("first");
        offSecond();
        if (!late) {
          late = true;
          c.graph.subscribe(() => events.push("late"));
        }
        throw marker;
      });
      offSecond = c.graph.subscribe(() => events.push("removed"));
      const same = () => events.push("same"),
        offA = c.graph.subscribe(same),
        offB = c.graph.subscribe(same);
      const error = await command(c, a, "replace", fragment(c, [X()])).then(
        () => assert.fail("aggregate"),
        (e) => e,
      );
      assert(error instanceof AggregateError);
      assert.deepEqual(error.errors, [marker]);
      assert.deepEqual(events, ["first", "same", "same"]);
      assert(find(c, "B-x"));
      offFirst();
      offFirst();
      offA();
      offA();
      events.length = 0;
      await command(c, a, "clear");
      assert.deepEqual(events, ["same", "late"]);
      offB();
    }),
  G20: () =>
    using(async (c) => {
      const a = source(c);
      let nested;
      const off = c.graph.subscribe(() => {
        nested = command(c, a, "clear");
        assert.throws(() => source(c), local("reentrant_change"));
      });
      await command(c, a, "replace", fragment(c, [X()]));
      await assert.rejects(nested, local("reentrant_change"));
      off();
      const old = c.graph.state;
      c.graph.subscribe(() => c.graph.dispose());
      await assert.rejects(command(c, a, "replace", fragment(c, [Y()])), local("disposed"));
      assert(c.graph.disposed);
      assert.equal(c.graph.state.nodes.length, 0);
      assert.equal(old.nodes[0].node.value.id, "B-x");
    }),
  G21: async () => {
    for (const dispose of [false, true])
      await using(async (c) => {
        const a = source(c),
          d = deferred();
        let ctx, nested;
        const p = command(c, a, "refresh", (x) => {
          ctx = x;
          x.signal.addEventListener(
            "abort",
            () => {
              d.resolve(fragment(c, [X()]));
              if (dispose) c.graph.dispose();
              else nested = command(c, a, "clear");
            },
            { once: true },
          );
          return d.promise;
        });
        const q = command(c, a, "replace", fragment(c, [Y()]));
        if (dispose) {
          await assert.rejects(q, local("disposed"));
          await assert.rejects(p);
          assert.equal(c.graph.state.nodes.length, 0);
        } else {
          await q;
          await assert.rejects(p, local("cancelled"));
          await assert.rejects(nested, local("reentrant_change"));
          await tick();
          assert.equal(find(c, "B-x"), undefined);
          assert(find(c, "B-y"));
        }
        assert(ctx.signal.aborted);
      });
  },
  G22: () =>
    using(async (c) => {
      const a = source(c);
      await command(c, a, "replace", fragment(c, [X()]));
      const content = a.state.content,
        one = new Error("B pending listener"),
        two = new Error("B terminal listener"),
        remote = new HierError("invalid_argument", "core", "B terminal", { B: 1 });
      const seen = [];
      c.graph.subscribe(() => {
        seen.push(a.state.status);
        throw a.state.status === "pending" ? one : two;
      });
      let invoked = false;
      const p = command(c, a, "refresh", () => {
        invoked = true;
        return Promise.reject(remote);
      });
      const e = await p.then(
        () => assert.fail("aggregate"),
        (e) => e,
      );
      assert(invoked);
      assert(e instanceof AggregateError);
      assert.deepEqual(e.errors, [one, two]);
      assert.equal(e.cause, remote);
      assert.deepEqual(seen, ["pending", "failed"]);
      assert.deepEqual(a.state.content, content);
      assert.equal(a.state.error.code, remote.code);
    }),
  G23: () =>
    using(async (c) => {
      const shared = new vm.SelectionModel({ snapshotId: c.snap.snapshotId });
      try {
        const first = {
            snapshotId: c.snap.snapshotId,
            origin: "tree",
            items: [{ ref: "B-signal-y" }],
          },
          chosen = {
            snapshotId: c.snap.snapshotId,
            origin: "graph",
            items: [{ ref: "B-signal-x", bits: { lsb: 0, width: 1 } }],
          };
        shared.select(first);
        shared.select(chosen);
        let events = 0;
        shared.subscribe(() => events++);
        const a = source(c);
        await command(c, a, "replace", fragment(c, [X()]));
        await command(c, a, "clear");
        await command(c, a, "dispose");
        assert.deepEqual(shared.current, chosen);
        assert.equal(events, 0);
        shared.back();
        assert.deepEqual(shared.current, first);
        shared.forward();
        assert.deepEqual(shared.current, chosen);
      } finally {
        shared.dispose();
      }
    }),
  G24: async (t) => {
    const c = await realInput();
    let g;
    t.after(async () => {
      try {
        g?.dispose();
      } finally {
        await c.close();
      }
    });
    try {
      g = new vm.GraphSession(c.client);
      const a = g.registerSource({ origin: "design", label: "真实Core" });
      await a.replace(c.fragment);
      consistent(g.state);
      for (const n of c.fragment.nodes)
        assert.deepEqual(g.state.nodes.find((x) => x.node.value.id === n.value.id).node, n);
      for (const e of c.fragment.edges)
        assert.deepEqual(g.state.edges.find((x) => x.edge.value.id === e.value.id).edge, e);
      await a.refresh(() => c.partialFragment);
      assert.equal(a.state.status, "success");
      assert.deepEqual(a.state.content.completeness, c.partial.completeness);
      assert.deepEqual(a.state.content.frontier, c.partial.result.frontier);
      g.dispose();
      assert.equal(c.client.snapshot.snapshotId, c.snapshot.snapshotId);
    } finally {
      g?.dispose();
      await c.close();
    }
  },
};
assert.equal(cases.length, 24);
after(() => releaseAll());
assert.deepEqual(
  Object.keys(bodies),
  cases.map((c) => c.id),
);
for (const c of cases)
  test(`${c.id}: ${c.input} => ${c.expected} [${c.basis}]`, { timeout: 20000 }, async (t) => {
    capability();
    await bodies[c.id](t);
  });
