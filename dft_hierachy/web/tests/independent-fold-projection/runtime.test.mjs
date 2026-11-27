import test from "node:test";
import assert from "node:assert/strict";
import {
  vm,
  using,
  deep,
  tick,
  capability,
  err,
  shownNode,
  shownEdge,
  partition,
} from "./harness.mjs";
import { cases } from "./cases.mjs";
import {
  content,
  node,
  edge,
  hierarchy,
  bus,
  fullOptions,
  nodeKey,
  edgeKey,
  expected,
  expectedItems,
  unique,
} from "./input.mjs";
const options = () => ({ groups: [], collapsed: [] });
for (const item of cases)
  test(item.id + " " + item.inputExpected, { timeout: 10000 }, async () => {
    capability();
    await using(async (c) => {
      const g = c.graph,
        s = c.selection,
        make = (o) => vm.createFoldedGraphProjection(g, o),
        choose = (p, t) => vm.selectFoldedGraphElement(g, s, p, t);
      if (item.id === "F01") {
        const state = g.state,
          selection = s.current;
        let notices = 0;
        const off = g.subscribe(() => notices++);
        const p = make(options());
        assert(p instanceof vm.FoldedGraphProjection);
        assert.equal(p.state, state);
        assert.deepEqual(p.options, options());
        assert.deepEqual(p.nodes, []);
        assert.deepEqual(p.edges, []);
        deep(p);
        assert.equal("layout" in p, false);
        assert.equal(g.state, state);
        assert.equal(s.current, selection);
        assert.equal(notices, 0);
        assert.equal(c.wire.sent.length, 0);
        off();
        return;
      }
      const before = g.state,
        selection = s.current,
        p = make(options());
      if (item.id === "F02") {
        const expanded = make({ groups: [hierarchy(g), bus(g)], collapsed: [] });
        partition(expanded);
        assert.equal(expanded.state, before);
        assert.equal(expanded.nodes.length, before.nodes.length);
        assert.equal(expanded.edges.length, before.edges.length);
        expanded.nodes.forEach((n, i) => {
          assert.equal(n.members[0], before.nodes[i]);
          assert.equal(n.kind, "member");
          assert.deepEqual(n.items, expectedItems(n.members[0]));
          const raw = n.members[0].node;
          assert.equal(
            n.label,
            raw.kind === "external"
              ? raw.label
              : raw.value.kind +
                  ": " +
                  (raw.value.point?.slice.ref ?? raw.value.ref ?? raw.value.id),
          );
        });
        expanded.edges.forEach((e, i) => {
          const m = before.edges[i];
          assert.equal(e.members[0], m);
          assert.equal(e.kind, "member");
          assert.equal(e.from, expanded.nodes.find((n) => n.members[0].id === m.from).target.id);
          assert.equal(e.to, expanded.nodes.find((n) => n.members[0].id === m.to).target.id);
          assert.deepEqual(e.items, expectedItems(m));
          assert.equal(
            e.label,
            m.edge.kind === "external"
              ? m.edge.label
              : m.edge.value.kind + ": " + m.edge.value.fact,
          );
        });
        assert.equal(g.state, before);
        assert.equal(s.current, selection);
        assert.equal(c.wire.sent.length, 0);
      }
      if (item.id === "F03") {
        const reads = {},
          get = (k, v) => ({
            enumerable: true,
            get() {
              reads[k] = (reads[k] ?? 0) + 1;
              return v;
            },
          });
        const arr = (tag, values) =>
          new Proxy(values, {
            get(t, k, r) {
              if (k === Symbol.iterator || k === "toJSON")
                throw Error("no iteration/serialization");
              if (k === "length" || /^\d+$/.test(String(k)))
                reads[tag + String(k)] = (reads[tag + String(k)] ?? 0) + 1;
              return Reflect.get(t, k, r);
            },
          });
        const h = hierarchy(g),
          members = arr("nodes", h.nodes),
          group = Object.create(null, {
            kind: get("kind", h.kind),
            key: get("key", h.key),
            label: get("label", h.label),
            nodes: get("nodes", members),
          });
        const groups = arr("groups", [group]),
          collapsed = arr("collapsed", ["H"]);
        const input = Object.create(null, {
          groups: get("groups", groups),
          collapsed: get("collapsed", collapsed),
        });
        const q = make(input);
        partition(q);
        assert.deepEqual(
          Object.keys(reads).sort(),
          [
            "groups",
            "collapsed",
            "kind",
            "key",
            "label",
            "nodes",
            "groupslength",
            "groups0",
            "nodeslength",
            "nodes0",
            "nodes1",
            "collapsedlength",
            "collapsed0",
          ].sort(),
        );
        for (const n of Object.values(reads)) assert.equal(n, 1);
        h.nodes[0] = "mutated";
        groups[0] = null;
        collapsed[0] = "changed";
        assert.equal(q.options.groups[0].nodes[0], node(g, "B-x").id);
        assert.deepEqual(q.options.collapsed, ["H"]);
        assert.equal(q.nodes.find((n) => n.kind === "hierarchy").label, h.label);
        deep(q);
      }
      if (item.id === "F04") {
        const hole = new Array(1),
          extra = [];
        extra.extra = 1;
        const symbol = [];
        symbol[Symbol("x")] = 1;
        for (const bad of [
          null,
          [],
          new Date(),
          {},
          Object.create(options()),
          { groups: [] },
          { collapsed: [] },
          { groups: undefined, collapsed: [] },
          { ...options(), extra: 1 },
          { ...options(), [Symbol("x")]: 1 },
          { groups: hole, collapsed: [] },
          { groups: extra, collapsed: [] },
          { groups: symbol, collapsed: [] },
          { groups: [], collapsed: hole },
          { groups: [], collapsed: extra },
          { groups: [], collapsed: [undefined] },
        ]) {
          assert.throws(() => make(bad), err("invalid_argument"));
          assert.equal(g.state, before);
          assert.equal(s.current, selection);
          assert.equal(p.state, before);
        }
      }
      if (item.id === "F05") {
        const h = hierarchy(g),
          b = bus(g),
          different = hierarchy(g, "other", ["B-y", "B-ref"]);
        const groups = [
          null,
          {},
          new Date(),
          { ...h, extra: 1 },
          { ...h, [Symbol("x")]: 1 },
          { ...h, nodes: undefined },
          { ...h, key: " " },
          { ...h, label: " " },
          { ...h, nodes: [] },
          { ...h, nodes: [h.nodes[0], h.nodes[0]] },
          { ...h, nodes: [edge(g, "B-low").id] },
          { ...h, nodes: ["B93:missing"] },
          { ...h, edges: b.edges },
          { ...b, edges: [] },
          { ...b, edges: [b.edges[0]] },
          { ...b, edges: [b.edges[0], b.edges[0]] },
          { ...b, edges: [node(g, "B-x").id, node(g, "B-y").id] },
          { ...b, kind: "network" },
        ];
        const sparse = hierarchy(g);
        sparse.nodes = new Array(1);
        groups.push(sparse);
        for (const group of groups)
          assert.throws(() => make({ groups: [group], collapsed: [] }), err("invalid_argument"));
        for (const gs of [
          [h, { ...h, label: "different" }],
          [h, { ...h, key: "same-set" }],
          [h, different],
          [h, { ...b, key: h.key }],
          [b, { ...b, key: "overlap" }],
        ])
          assert.throws(() => make({ groups: gs, collapsed: [] }), err("invalid_argument"));
        for (const collapsed of [["absent"], ["H", "H"], [undefined], [""]])
          assert.throws(() => make({ groups: [h], collapsed }), err("invalid_argument"));
        assert.equal(g.state, before);
        assert.equal(s.current, selection);
        deep(p);
      }
      if (item.id === "F06") {
        let reads = 0;
        const bad = new Proxy(
          {},
          {
            ownKeys() {
              reads++;
              throw 1;
            },
          },
        );
        for (const fake of [{}, Object.create(vm.GraphSession.prototype), new Proxy(g, {})])
          assert.throws(() => vm.createFoldedGraphProjection(fake, bad), err("invalid_argument"));
        g.dispose();
        assert.throws(() => make(bad), err("disposed"));
        assert.equal(reads, 0);
        deep(p);
      }
      if (item.id === "F07") {
        const cause = { B93: "original throw" },
          h = hierarchy(g);
        const bad = {
          ...hierarchy(g, "second", ["B-ref"]),
          get label() {
            throw cause;
          },
        };
        assert.throws(
          () => make({ groups: [h, bad], collapsed: [] }),
          (e) => err("invalid_argument")(e) && e.cause === cause,
        );
        assert.equal(g.state, before);
        assert.equal(s.current, selection);
        deep(p);
      }
      if (item.id === "F08" || item.id === "F09") {
        for (const throws of [false, true])
          await using(async (d) => {
            const old = d.graph.state,
              cause = { B93: throws },
              o = {
                get groups() {
                  if (item.id === "F08") d.graph.dispose();
                  else d.source.clear().catch(() => {});
                  if (throws) throw cause;
                  return [];
                },
                collapsed: [],
              };
            assert.throws(
              () => vm.createFoldedGraphProjection(d.graph, o),
              err(item.id === "F08" ? "disposed" : "stale_graph"),
            );
            if (item.id === "F09") {
              assert.notEqual(d.graph.state, old);
              await tick();
            }
          });
      }
      if (item.id === "F10") {
        const inner = hierarchy(g, "inner"),
          outer = hierarchy(g, "outer", ["B-ref", "B-y", "B-x"]),
          separate = hierarchy(g, "separate", ["B-zero", "B-both"]);
        const q = make({
          groups: [inner, separate, outer],
          collapsed: ["inner", "outer", "separate"],
        });
        partition(q);
        assert.deepEqual(
          new Set(q.nodes.filter((n) => n.kind === "hierarchy").map((n) => n.groupKey)),
          new Set(["outer", "separate"]),
        );
        assert.deepEqual(
          shownNode(q, "B-x").members,
          before.nodes.filter((m) => ["B-x", "B-y", "B-ref"].includes(nodeKey(m))),
        );
        const r = make({ groups: [outer, inner, separate], collapsed: ["inner", "separate"] });
        partition(r);
        assert.equal(shownNode(r, "B-x").groupKey, "inner");
        assert.equal(shownNode(r, "B-ref").kind, "member");
        assert.equal(
          shownNode(r, "B-x").target.id,
          shownNode(make({ groups: [inner], collapsed: ["inner"] }), "B-x").target.id,
        );
      }
      if (item.id === "F11") {
        const q = make({ groups: [hierarchy(g)], collapsed: ["H"] });
        partition(q);
        const h = shownNode(q, "B-x");
        assert.equal(h, shownNode(q, "B-y"));
        assert.deepEqual(
          h.internalEdges,
          before.edges.filter((m) =>
            ["B-low", "B-high", "B-self", "B-reverse"].includes(edgeKey(m)),
          ),
        );
        const boundary = shownEdge(q, "external-edge");
        assert.equal(boundary.to, h.target.id);
        assert.equal(boundary.from, shownNode(q, "ext").target.id);
        assert.equal(boundary.members[0], edge(g, "external-edge"));
        const reverse = shownEdge(q, "reverse-external");
        assert.equal(reverse.from, h.target.id);
        assert.equal(reverse.to, shownNode(q, "ext").target.id);
        const self = shownEdge(q, "nil-loop");
        assert.equal(self.from, self.to);
        assert.equal(g.state, before);
      }
      if (item.id === "F12") {
        const q = make(fullOptions(g));
        partition(q);
        const bundle = shownEdge(q, "external-edge");
        assert.equal(bundle.kind, "bus");
        assert.equal(bundle.groupKey, "BUS");
        assert.deepEqual(
          bundle.members,
          before.edges.filter((m) =>
            ["external-edge", "boundary-y", "parallel-x"].includes(edgeKey(m)),
          ),
        );
        assert.equal(bundle.label, " bus <&> ");
        assert.equal(shownEdge(q, "other-from").kind, "member");
        assert.equal(shownEdge(q, "reverse-external").kind, "member");
        assert.equal(bundle.from, shownNode(q, "ext").target.id);
        assert.equal(bundle.to, shownNode(q, "B-x").target.id);
        assert.equal(shownEdge(q, "B-low"), undefined);
        assert(shownNode(q, "B-x").internalEdges.includes(edge(g, "B-low")));
        const r = make({ groups: fullOptions(g).groups, collapsed: ["BUS"] });
        partition(r);
        assert.deepEqual(shownEdge(r, "external-edge").members.map(edgeKey), [
          "external-edge",
          "parallel-x",
        ]);
        assert.equal(shownEdge(r, "boundary-y").kind, "member");
        assert.deepEqual(q.options.collapsed, ["H", "BUS"]);
      }
      if (item.id === "F13") {
        const groups = [
          bus(g, "one", ["external-edge", "parallel-x"], "same"),
          bus(g, "two", ["boundary-y", "other-from"], "same"),
          hierarchy(g),
        ];
        const q = make({ groups, collapsed: ["H", "one", "two"] });
        partition(q);
        assert.equal(shownEdge(q, "external-edge").kind, "bus");
        assert.equal(shownEdge(q, "boundary-y").kind, "member");
        assert.equal(shownEdge(q, "other-from").kind, "member");
        assert.equal(shownEdge(q, "reverse-external").kind, "member");
        const no = make({ groups: [hierarchy(g)], collapsed: ["H"] });
        assert.equal(shownEdge(no, "external-edge").kind, "member");
        assert.equal(shownEdge(no, "parallel-x").kind, "member");
      }
      if (item.id === "F14") {
        const o = fullOptions(g),
          q = make(o),
          changed = {
            groups: [
              { ...o.groups[1], label: "new", edges: [...o.groups[1].edges].reverse() },
              { ...o.groups[0], label: "new", nodes: [...o.groups[0].nodes].reverse() },
            ],
            collapsed: ["BUS", "H"],
          };
        const r = make(changed);
        partition(q);
        partition(r);
        const shape = (x) => [
          x.nodes.map((n) => [n.target.id, n.members]),
          x.edges.map((e) => [e.target.id, e.from, e.to, e.members]),
        ];
        assert.deepEqual(shape(q), shape(r));
        assert.notEqual(q.id, r.id);
        assert.equal(shownNode(r, "B-x").label, "new");
        assert.equal(shownEdge(r, "external-edge").label, "new");
      }
      if (item.id === "F15") {
        const q = make(fullOptions(g)),
          r = make(fullOptions(g));
        assert.notEqual(q.id, r.id);
        assert.deepEqual(
          q.nodes.map((n) => n.target.id),
          r.nodes.map((n) => n.target.id),
        );
        choose(q, shownNode(q, "B-x").target);
        choose(r, shownNode(r, "B-x").target);
        assert.throws(() => choose(r, shownNode(q, "B-x").target), err("stale_graph"));
        const t = make({ groups: [hierarchy(g, "H", ["B-x", "B-ref"])], collapsed: ["H"] });
        assert.equal(shownNode(t, "B-x").target.id, shownNode(q, "B-x").target.id);
        assert.notEqual(t.id, q.id);
        await using(async (d) => {
          const other = vm.createFoldedGraphProjection(d.graph, fullOptions(d.graph));
          const all = new Set([...q.nodes, ...q.edges].map((x) => x.target.id));
          for (const x of [...other.nodes, ...other.edges])
            assert.equal(all.has(x.target.id), false);
        });
        const ids = [...q.nodes, ...q.edges].map((x) => x.target.id);
        assert.equal(new Set(ids).size, ids.length);
      }
      if (item.id === "F16") {
        const folded = make(fullOptions(g)),
          expanded = make({ ...fullOptions(g), collapsed: [] });
        partition(folded);
        partition(expanded);
        assert.deepEqual(
          expanded.nodes.flatMap((n) => n.members),
          before.nodes,
        );
        assert.deepEqual(
          expanded.edges.flatMap((e) => e.members),
          before.edges,
        );
        for (const n of expanded.nodes)
          assert.equal(n.target.id, shownNode(p, nodeKey(n.members[0])).target.id);
        for (const e of expanded.edges) {
          assert.equal(e.target.id, shownEdge(p, edgeKey(e.members[0])).target.id);
          deep(e.members[0]);
        }
        assert.equal(g.state, before);
      }
      if (item.id === "F17") {
        const o = fullOptions(g),
          q = make(o),
          n = shownNode(q, "B-x");
        await c.source.clear();
        assert.throws(() => choose(q, n.target), err("stale_graph"));
        assert.equal(s.current, selection);
        assert.throws(() => make(o), err("invalid_argument"));
        partition(q);
        assert.equal(q.state, before);
        const empty = make(options());
        assert.deepEqual(empty.nodes, []);
        assert.deepEqual(empty.edges, []);
      }
      if (item.id === "F18") {
        const q = make(fullOptions(g)),
          h = shownNode(q, "B-x"),
          raw = s.select,
          calls = [];
        s.select = function (...args) {
          calls.push(args);
          return Reflect.apply(raw, this, args);
        };
        let publishes = 0;
        const off = g.subscribe(() => publishes++);
        try {
          choose(q, h.target);
          assert.equal(calls.length, 1);
          assert.deepEqual(s.current.items, [...expected["B-x"], ...expected["B-y"]]);
          assert.equal(s.current.origin, "graph");
          assert.equal(s.current.snapshotId, before.snapshotId);
          choose(q, shownNode(q, "B-ref").target);
          assert.equal(calls.length, 2);
          s.back();
          assert.deepEqual(s.current.items, h.items);
          s.forward();
          assert.deepEqual(s.current.items, expected["B-ref"]);
          assert.equal(g.state, before);
          assert.equal(publishes, 0);
          assert.equal(c.wire.sent.length, 0);
        } finally {
          delete s.select;
          off();
        }
      }
      if (item.id === "F19") {
        const q = make(fullOptions(g)),
          bundle = shownEdge(q, "external-edge");
        assert.deepEqual(bundle.items, unique(bundle.members.flatMap(expectedItems)));
        choose(q, bundle.target);
        assert.deepEqual(s.current.items, unique(bundle.members.flatMap(expectedItems)));
        const single = shownEdge(q, "other-from");
        assert.deepEqual(single.items, expected["B-x"]);
        assert.notDeepEqual(single.items, shownNode(q, "B-x").items);
        choose(q, single.target);
        const low = make({ groups: [bus(g, "slice", ["B-low", "B-high"])], collapsed: ["slice"] });
        const e = shownEdge(low, "B-low");
        assert.equal(e.kind, "bus");
        assert.deepEqual(e.items, e.members.flatMap(expectedItems));
        choose(low, e.target);
        assert.deepEqual(s.current.items, e.items);
      }
      if (item.id === "F20") {
        const q = make(fullOptions(g)),
          a = new vm.AnnotationLayer({ snapshotId: before.snapshotId, id: "B93a", label: "A" }),
          b = new vm.AnnotationLayer({ snapshotId: before.snapshotId, id: "B93b", label: "B" });
        c.models.push(a, b);
        a.set([
          { ref: "B87:x<&>", mark: { badge: "x" } },
          { ref: "H", mark: { badge: "not an object" } },
        ]);
        b.set([{ ref: "B87:y", mark: { severity: "warn" } }]);
        const n = shownNode(q, "B-x"),
          e = shownEdge(q, "other-from");
        const resolve = (x) =>
          vm.resolveObjectAnnotations(
            before.snapshotId,
            x.items.map((i) => i.ref),
            [a, b],
          );
        assert.deepEqual(
          resolve(n).map((x) => x.entry.ref),
          ["B87:x<&>", "B87:y"],
        );
        assert.deepEqual(
          resolve(e).map((x) => x.entry.ref),
          ["B87:x<&>"],
        );
        assert.equal(g.state, before);
        assert.equal(s.current, selection);
      }
      if (item.id === "F21") {
        const q = make(fullOptions(g)),
          target = shownNode(q, "B-x").target,
          sel = s.current;
        const extra = Object.assign([], target);
        for (const bad of [
          null,
          {},
          extra,
          Object.create(target),
          { ...target, extra: 1 },
          { ...target, [Symbol("x")]: 1 },
          { ...target, id: undefined },
          { ...target, id: "unknown" },
          { ...target, kind: "source" },
          { ...target, projectionId: undefined },
        ]) {
          assert.throws(() => choose(q, bad), err("invalid_argument"));
          assert.equal(s.current, sel);
        }
        const other = make(fullOptions(g));
        assert.throws(() => choose(q, { ...target, projectionId: other.id }), err("stale_graph"));
        const reads = {},
          record = Object.create(null);
        for (const k of Object.keys(target))
          Object.defineProperty(record, k, {
            enumerable: true,
            get() {
              reads[k] = (reads[k] ?? 0) + 1;
              return target[k];
            },
          });
        choose(q, record);
        assert.deepEqual(reads, { projectionId: 1, kind: 1, id: 1 });
        const cause = { B93: "target" },
          bad = { ...target };
        Object.defineProperty(bad, "id", {
          get() {
            throw cause;
          },
        });
        const now = s.current;
        assert.throws(
          () => choose(q, bad),
          (e) => err("invalid_argument")(e) && e.cause === cause,
        );
        assert.equal(s.current, now);
      }
      if (item.id === "F22") {
        const q = make(fullOptions(g));
        let reads = 0;
        const target = new Proxy(
          {},
          {
            ownKeys() {
              reads++;
              throw 1;
            },
          },
        );
        for (const fake of [
          {},
          Object.create(vm.FoldedGraphProjection.prototype),
          new Proxy(q, {}),
        ])
          assert.throws(
            () => vm.selectFoldedGraphElement(g, s, fake, target),
            err("invalid_argument"),
          );
        for (const fake of [{}, Object.create(vm.SelectionModel.prototype), new Proxy(s, {})])
          assert.throws(
            () => vm.selectFoldedGraphElement(g, fake, q, target),
            err("invalid_argument"),
          );
        for (const fake of [{}, Object.create(vm.GraphSession.prototype), new Proxy(g, {})])
          assert.throws(
            () => vm.selectFoldedGraphElement(fake, s, q, target),
            err("invalid_argument"),
          );
        for (const sel of [
          new vm.SelectionModel(),
          new vm.SelectionModel({ snapshotId: "other" }),
        ]) {
          c.models.push(sel);
          assert.throws(
            () => vm.selectFoldedGraphElement(g, sel, q, target),
            err("snapshot_mismatch"),
          );
        }
        await using(async (d) =>
          assert.throws(
            () => vm.selectFoldedGraphElement(d.graph, d.selection, q, target),
            err("stale_graph"),
          ),
        );
        s.dispose();
        assert.throws(() => choose(q, target), err("disposed"));
        assert.equal(reads, 0);
      }
      if (item.id === "F23") {
        for (const action of ["stale", "graph-dispose", "selection-dispose"])
          for (const throws of [false, true])
            await using(async (d) => {
              const q = vm.createFoldedGraphProjection(d.graph, fullOptions(d.graph)),
                t = shownNode(q, "B-x").target,
                selected = d.selection.current,
                cause = { action, throws },
                target = { ...t };
              Object.defineProperty(target, "id", {
                get() {
                  if (action === "stale") d.source.clear().catch(() => {});
                  else if (action === "graph-dispose") d.graph.dispose();
                  else d.selection.dispose();
                  if (throws) throw cause;
                  return t.id;
                },
              });
              assert.throws(
                () => vm.selectFoldedGraphElement(d.graph, d.selection, q, target),
                err(action === "stale" ? "stale_graph" : "disposed"),
              );
              if (action !== "selection-dispose") assert.equal(d.selection.current, selected);
              await tick();
            });
      }
      if (item.id === "F24") {
        const q = make(fullOptions(g));
        for (const target of [
          shownNode(q, "B-none").target,
          shownNode(q, "no-target").target,
          shownEdge(q, "nil-loop").target,
        ]) {
          assert.throws(() => choose(q, target), err("not_selectable"));
          assert.equal(s.current, selection);
        }
        const raw = new vm.SelectionError("invalid_selection", "B93 upstream rejection");
        s.select = () => {
          throw raw;
        };
        try {
          assert.throws(
            () => choose(q, shownNode(q, "B-x").target),
            (e) => e === raw,
          );
        } finally {
          delete s.select;
        }
        assert.equal(s.current, selection);
        const cause = { B93: "listener" },
          off = s.subscribe(() => {
            throw cause;
          });
        try {
          assert.throws(
            () => choose(q, shownNode(q, "B-x").target),
            (e) => e instanceof AggregateError && e.errors.includes(cause),
          );
          assert.deepEqual(s.current.items, shownNode(q, "B-x").items);
        } finally {
          off();
        }
      }
    }, item.id === "F01");
  });
