import test from "node:test";
import assert from "node:assert/strict";
import { vm, using as graphUsing, deep, tick } from "../independent-graph-session/harness.mjs";
import { MessageGate } from "../independent-layout/worker.mjs";
import { content, expected, edgeItems, X, Y } from "./input.mjs";
import { modelCases } from "./cases.mjs";
const cap = () => {
  for (const n of ["createGraphProjection", "selectGraphElement", "GraphProjectionError"])
    assert.equal(typeof vm[n], "function", "missing production export " + n);
};
const err = (code) => (e) => {
  assert(e instanceof vm.GraphProjectionError);
  assert.equal(e.code, code);
  return true;
};
async function using(fn, empty = false) {
  return graphUsing(async (c) => {
    c.selection = new vm.SelectionModel({ snapshotId: c.graph.state.snapshotId });
    c.models.push(c.selection);
    c.source = c.graph.registerSource({ label: "B87 main", origin: "analysis" });
    if (!empty) await c.source.replace(content(c.graph.state.snapshotId));
    return fn(c);
  });
}
const by = (p, id) =>
  p.nodes.find((n) => n.member.node.value?.id === id || n.member.node.key === id);
for (const item of modelCases)
  test(item.id + " " + item.inputExpected, { timeout: 10000 }, async () => {
    cap();
    await using(async (c) => {
      const g = c.graph,
        s = c.selection,
        project = () => vm.createGraphProjection(g),
        select = (t) => vm.selectGraphElement(g, s, t);
      if (item.id === "M01") {
        const state = g.state,
          sel = s.current,
          p = project();
        assert.equal(p.state, state);
        deep(p);
        assert.deepEqual(p.nodes, []);
        assert.deepEqual(p.edges, []);
        assert.deepEqual(p.layout, {
          sessionId: state.sessionId,
          graphRevision: state.revision,
          direction: "RIGHT",
          nodes: [],
          edges: [],
        });
        assert.equal(s.current, sel);
        assert.equal(c.wire.sent.length, 0);
        return;
      }
      const p = project();
      if (item.id === "M02") {
        deep(p);
        assert.equal(p.state, g.state);
        assert.equal(p.nodes.length, g.state.nodes.length);
        assert.equal(p.edges.length, g.state.edges.length);
        for (const [kind, list, members] of [
          ["node", p.nodes, g.state.nodes],
          ["edge", p.edges, g.state.edges],
        ])
          list.forEach((x, i) => {
            assert.equal(x.member, members[i]);
            assert.deepEqual(x.target, {
              sessionId: g.state.sessionId,
              graphRevision: g.state.revision,
              kind,
              id: members[i].id,
            });
          });
        for (const n of p.nodes) {
          const raw = n.member.node;
          assert.equal(
            n.label,
            raw.kind === "external"
              ? raw.label
              : raw.value.kind +
                  ": " +
                  (raw.value.point?.slice.ref ?? raw.value.ref ?? raw.value.id),
          );
        }
        for (const e of p.edges)
          assert.equal(
            e.label,
            e.member.edge.kind === "external"
              ? e.member.edge.label
              : e.member.edge.value.kind + ": " + e.member.edge.value.fact,
          );
        assert.equal(c.wire.sent.length, 0);
        assert.equal(project().state, p.state);
      }
      if (item.id === "M03") {
        const highDegree = content(g.state.snapshotId);
        for (let i = 0; i < 12; i++) {
          const e = structuredClone(highDegree.edges[0]);
          e.value.id = "B87-degree-" + i;
          e.value.fact = "B87:degree-fact-" + i;
          highDegree.edges.push(e);
        }
        await c.source.replace(highDegree);
        for (const [dir, from, to] of [
          ["RIGHT", "EAST", "WEST"],
          ["LEFT", "WEST", "EAST"],
          ["DOWN", "SOUTH", "NORTH"],
          ["UP", "NORTH", "SOUTH"],
        ]) {
          const q = vm.createGraphProjection(g, dir);
          assert.equal(q.layout.direction, dir);
          const ports = new Map(q.layout.nodes.map((n) => [n.id, []]));
          for (const e of g.state.edges) {
            ports.get(e.from).push({
              key: JSON.stringify(["edge", e.id, "from"]),
              width: 6,
              height: 6,
              side: from,
            });
            ports
              .get(e.to)
              .push({ key: JSON.stringify(["edge", e.id, "to"]), width: 6, height: 6, side: to });
          }
          for (const n of q.layout.nodes) {
            assert.deepEqual(n.ports, ports.get(n.id));
            const max = Math.max(
              ...["NORTH", "SOUTH", "EAST", "WEST"].map(
                (side) => n.ports.filter((p) => p.side === side).length,
              ),
            );
            assert.equal(
              n.width,
              ["DOWN", "UP"].includes(dir) ? Math.max(160, 16 * (max + 1)) : 160,
            );
            assert.equal(
              n.height,
              ["RIGHT", "LEFT"].includes(dir) ? Math.max(64, 16 * (max + 1)) : 64,
            );
          }
          q.layout.edges.forEach((e) =>
            assert.deepEqual(e, {
              id: e.id,
              fromPort: JSON.stringify(["edge", e.id, "from"]),
              toPort: JSON.stringify(["edge", e.id, "to"]),
            }),
          );
        }
      }
      if (item.id === "M04") {
        for (const [id, items] of Object.entries(expected))
          assert.deepEqual(by(p, id).items, items);
        assert.deepEqual(by(p, "ext").items, [
          { ref: "B87:external", bits: { lsb: 1, width: 3 }, side: "outside" },
        ]);
        assert.deepEqual(by(p, "no-target").items, []);
        for (const e of p.edges) assert.deepEqual(e.items, edgeItems(e.member.edge.value?.id));
      }
      if (item.id === "M05") {
        let notices = 0;
        const off = s.subscribe(() => notices++);
        select(by(p, X).target);
        assert.deepEqual(s.current.items, expected[X]);
        assert.equal(s.current.origin, "graph");
        select(p.edges.find((e) => e.member.edge.value?.id === "B-high").target);
        assert.deepEqual(s.current.items, edgeItems("B-high"));
        assert.equal(notices, 2);
        s.back();
        assert.deepEqual(s.current.items, expected[X]);
        s.forward();
        assert.deepEqual(s.current.items, edgeItems("B-high"));
        off();
      }
      if (item.id === "M06") {
        for (const fake of [{}, Object.create(vm.GraphSession.prototype), new Proxy(g, {})])
          assert.throws(() => vm.createGraphProjection(fake), err("invalid_argument"));
        for (const direction of ["right", "", null, 0, {}])
          assert.throws(() => vm.createGraphProjection(g, direction), err("invalid_argument"));
        Object.defineProperty(g, "state", {
          configurable: true,
          get() {
            throw Error("must use class-owned read");
          },
        });
        assert.equal(project().state, p.state);
        delete g.state;
        assert.throws(
          () => vm.selectGraphElement(g, new Proxy(s, {}), by(p, X).target),
          err("invalid_argument"),
        );
      }
      if (item.id === "M07") {
        const t = by(p, X).target,
          sel = s.current;
        for (const bad of [
          null,
          {},
          { ...t, extra: 1 },
          { ...t, id: undefined },
          { ...t, id: "" },
          { ...t, kind: "source" },
          { ...t, graphRevision: -1 },
          { ...t, graphRevision: Infinity },
          { ...t, id: "unknown" },
          { ...t, sessionId: "other" },
        ]) {
          assert.throws(
            () => select(bad),
            err(bad?.sessionId === "other" ? "stale_graph" : "invalid_argument"),
          );
          assert.equal(s.current, sel);
        }
        assert.doesNotThrow(() => select(Object.assign(Object.create(null), t)));
      }
      if (item.id === "M08") {
        const t = by(p, X).target,
          reads = {};
        const target = {};
        for (const k of Object.keys(t))
          Object.defineProperty(target, k, {
            enumerable: true,
            get() {
              reads[k] = (reads[k] ?? 0) + 1;
              return t[k];
            },
          });
        select(target);
        assert.deepEqual(Object.values(reads), [1, 1, 1, 1]);
        const cause = { opaque: 1 },
          bad = { ...t };
        Object.defineProperty(bad, "id", {
          get() {
            throw cause;
          },
        });
        assert.throws(
          () => select(bad),
          (e) => err("invalid_argument")(e) && e.cause === cause,
        );
        const old = s.current,
          changing = { ...t };
        Object.defineProperty(changing, "id", {
          get() {
            c.source.clear().catch(() => {});
            return t.id;
          },
        });
        assert.throws(() => select(changing), err("stale_graph"));
        assert.equal(s.current, old);
        await tick();
        const disposed = { ...t };
        Object.defineProperty(disposed, "id", {
          get() {
            g.dispose();
            throw cause;
          },
        });
        assert.throws(
          () => select(disposed),
          (e) => err("disposed")(e) && e.cause === cause,
        );
      }
      if (item.id === "M09") {
        let reads = 0;
        const target = new Proxy(
          {},
          {
            ownKeys() {
              reads++;
              throw Error("no target read");
            },
          },
        );
        const unbound = new vm.SelectionModel(),
          other = new vm.SelectionModel({ snapshotId: "other" });
        c.models.push(unbound, other);
        for (const sel of [unbound, other])
          assert.throws(() => vm.selectGraphElement(g, sel, target), err("snapshot_mismatch"));
        s.dispose();
        assert.throws(() => select(target), err("disposed"));
        assert.equal(reads, 0);
        g.dispose();
        assert.throws(() => vm.createGraphProjection(g, "bad"), err("disposed"));
      }
      if (item.id === "M10") {
        const shared = g.registerSource({ origin: "design", label: "B87 shared" }),
          raw = content(g.state.snapshotId);
        await shared.replace({
          ...raw,
          nodes: raw.nodes.filter((n) => n.kind === "design" && [X, Y].includes(n.value.id)),
          edges: [raw.edges[0]],
        });
        const now = project(),
          t = by(now, X).target;
        select(t);
        const original = s.current;
        await c.source.clear();
        assert.throws(() => select(t), err("stale_graph"));
        assert.equal(s.current, original);
        const after = project();
        assert.equal(after.nodes.length, 2);
        assert.equal(after.edges.length, 1);
        assert.equal(p.nodes.length, 8);
        deep(p);
        await shared.clear();
        assert.equal(project().nodes.length, 0);
      }
      if (item.id === "M11") {
        select(by(p, X).target);
        const old = s.current;
        assert.throws(() => select(by(p, "B-none").target), err("not_selectable"));
        assert.equal(s.current, old);
        const cause = { B87: "listener" };
        const off = s.subscribe(() => {
          throw cause;
        });
        assert.throws(
          () => select(by(p, Y).target),
          (e) => e instanceof AggregateError && e.errors.includes(cause),
        );
        assert.deepEqual(s.current.items, expected[Y]);
        off();
      }
      if (item.id === "M12") {
        let posted;
        const ready = new Promise((r) => (posted = r)),
          workers = [];
        const service = new vm.LayoutService(g, {
          timeoutMs: 5000,
          workerFactory() {
            const w = new MessageGate();
            w.onLayout = () => posted(w);
            workers.push(w);
            return w;
          },
        });
        c.models.push(service);
        const pending = service.layout(p.layout);
        pending.catch(() => {});
        const w = await ready;
        w.succeed();
        await pending;
        assert.equal(service.state.status, "success");
        assert.deepEqual(
          service.state.result.edges.map((e) => [e.id, e.from, e.to]),
          g.state.edges.map((e) => [e.id, e.from, e.to]),
        );
        assert.equal(project().state, p.state);
        service.dispose();
        for (const worker of workers) assert.equal(worker.terminated, 1);
      }
    }, item.id === "M01");
  });
