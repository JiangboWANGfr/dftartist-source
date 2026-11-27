import test from "node:test";
import assert from "node:assert/strict";
import { vm, deep } from "../independent-graph-session/harness.mjs";
import { modelCases } from "./cases.mjs";
const S = "B90:snapshot",
  X = "B90:opaque/<&>",
  Y = "B90:opaque/child";
const mark = (ref = X, badge = "B90 badge") => ({ ref, mark: { badge } });
const error = (code) => (e) => {
  assert(e instanceof vm.AnnotationError);
  assert.equal(e.code, code);
  return true;
};
for (const c of modelCases)
  test(c.id + " " + c.inputExpected, () => {
    for (const n of ["AnnotationLayer", "AnnotationError", "resolveObjectAnnotations"])
      assert.equal(typeof vm[n], "function", "missing production export " + n);
    const owned = [];
    const layer = (id = "L", snapshotId = S) => {
      const a = new vm.AnnotationLayer({ snapshotId, id, label: "label " + id });
      owned.push(a);
      return a;
    };
    const resolve = (refs, layers, snapshotId = S) =>
      vm.resolveObjectAnnotations(snapshotId, refs, layers);
    try {
      if (c.id === "A01") {
        const o = { snapshotId: S, id: "  L  ", label: "  label  " },
          a = new vm.AnnotationLayer(o);
        owned.push(a);
        o.id = "changed";
        assert.deepEqual(a.state, {
          snapshotId: S,
          id: "  L  ",
          label: "  label  ",
          revision: 0,
          status: "active",
          marks: [],
        });
        assert.equal(a.disposed, false);
        deep(a.state);
        assert.equal(a.state, a.state);
      }
      if (c.id === "A02") {
        const a = layer(),
          old = a.state,
          m = { color: "#aB12Ef", badge: "", tooltip: "<img onerror=x>\n尾", severity: "warn" };
        const entry = Object.assign(Object.create(null), {
          ref: X,
          mark: Object.assign(Object.create(null), m),
        });
        a.set([entry, { ref: Y, mark: {} }]);
        entry.ref = "mutated";
        entry.mark.badge = "mutated";
        assert.deepEqual(JSON.parse(JSON.stringify(a.state.marks)), [
          { ref: X, mark: m },
          { ref: Y, mark: {} },
        ]);
        assert.equal(a.state.revision, 1);
        assert.deepEqual(old.marks, []);
        deep(a.state);
        deep(old);
        const b = layer("space", " ");
        b.set([mark(" ")]);
        assert.equal(b.state.marks[0].ref, " ");
      }
      if (c.id === "A03") {
        const a = layer(),
          states = [];
        a.subscribe(() => states.push(a.state));
        a.set([mark()]);
        const first = a.state;
        a.set([mark()]);
        a.clear();
        a.clear();
        assert.equal(a.state.revision, 4);
        assert.equal(states.length, 4);
        assert.notEqual(states[0], states[1]);
        assert.equal(first.revision, 1);
        assert.equal(first.marks.length, 1);
      }
      if (c.id === "A04") {
        const o = { snapshotId: S, id: "L", label: "label" };
        for (const bad of [
          null,
          [],
          new Date(),
          {},
          { ...o, snapshotId: "" },
          { ...o, id: " " },
          { ...o, label: "" },
          { ...o, id: undefined },
          { ...o, extra: 1 },
          { ...o, [Symbol("x")]: 1 },
          Object.create(o),
        ])
          assert.throws(() => new vm.AnnotationLayer(bad), error("invalid_argument"));
      }
      if (c.id === "A05") {
        const a = layer();
        a.set([mark()]);
        const old = a.state;
        let calls = 0;
        a.subscribe(() => calls++);
        const hole = new Array(1),
          extra = [];
        extra.x = 1;
        const sym = [];
        sym[Symbol("x")] = 1;
        for (const bad of [
          null,
          {},
          new Map(),
          hole,
          extra,
          sym,
          [null],
          [{}],
          [{ ref: "", mark: {} }],
          [{ ref: X, mark: undefined }],
          [{ ref: X, mark: { color: "red" } }],
          [{ ref: X, mark: { color: "#fff" } }],
          [{ ref: X, mark: { color: "url(x)" } }],
          [{ ref: X, mark: { badge: undefined } }],
          [{ ref: X, mark: {}, extra: 1 }],
          [{ ref: X, mark: {}, [Symbol("extra")]: 1 }],
          [{ ref: 7, mark: {} }],
          [{ ref: X, mark: { severity: "fatal" } }],
          [{ ref: X, mark: { bits: {} } }],
          [{ ref: X, mark: [], extra: 1 }],
          [{ ref: X, mark: new Date() }],
          [{ ref: X, mark: { [Symbol("x")]: 1 } }],
          [mark(), mark()],
          [mark(Y), { ref: X, mark: { tooltip: 3 } }],
        ]) {
          assert.throws(() => a.set(bad), error("invalid_argument"));
          assert.equal(a.state, old);
          assert.equal(calls, 0);
        }
      }
      if (c.id === "A06") {
        const a = layer(),
          reads = {};
        const get = (key, value) => ({
          enumerable: true,
          get() {
            reads[key] = (reads[key] ?? 0) + 1;
            return value;
          },
        });
        const m = Object.create(null, { badge: get("badge", "once") }),
          e = Object.create(null, { ref: get("ref", X), mark: get("mark", m) });
        const input = new Proxy([e], {
          get(t, k, r) {
            if (k === Symbol.iterator || k === "toJSON")
              throw Error("not a serialization/iterator API");
            if (k === "0" || k === "length") reads[k] = (reads[k] ?? 0) + 1;
            return Reflect.get(t, k, r);
          },
        });
        a.set(input);
        assert.deepEqual(reads, { length: 1, 0: 1, ref: 1, mark: 1, badge: 1 });
        assert.equal(a.state.marks[0].mark.badge, "once");
      }
      if (c.id === "A07") {
        const a = layer(),
          old = a.state,
          raw = { B: "getter" };
        const e = {
          ref: X,
          get mark() {
            throw raw;
          },
        };
        assert.throws(
          () => a.set([mark(Y), e]),
          (e) => {
            error("invalid_argument")(e);
            assert.equal(e.cause, raw);
            return true;
          },
        );
        assert.equal(a.state, old);
      }
      if (c.id === "A08") {
        const a = layer(),
          b = layer("B");
        let reads = 0;
        a.set([
          {
            ref: X,
            get mark() {
              assert.throws(
                () =>
                  a.set(
                    new Proxy([], {
                      get() {
                        reads++;
                        throw 1;
                      },
                    }),
                  ),
                error("reentrant_change"),
              );
              assert.throws(() => a.clear(), error("reentrant_change"));
              b.clear();
              return {};
            },
          },
        ]);
        assert.equal(reads, 0);
        assert.equal(a.state.revision, 1);
        assert.equal(b.state.revision, 1);
      }
      if (c.id === "A09") {
        for (const throws of [false, true]) {
          const a = layer("L" + throws);
          a.set([mark()]);
          const old = a.state;
          assert.throws(
            () =>
              a.set([
                {
                  ref: X,
                  get mark() {
                    a.dispose();
                    if (throws) throw "raw";
                    return {};
                  },
                },
              ]),
            error("disposed"),
          );
          assert.equal(a.state.status, "disposed");
          assert.equal(a.state.revision, 1);
          assert.deepEqual(a.state.marks, []);
          assert.equal(old.marks.length, 1);
        }
      }
      if (c.id === "A10") {
        const a = layer(),
          out = [];
        let offB,
          first = true;
        const duplicate = () => out.push("D");
        a.subscribe(() => {
          out.push("A");
          if (first) {
            first = false;
            offB();
            a.subscribe(() => out.push("C"));
          }
        });
        offB = a.subscribe(() => out.push("B"));
        const off = a.subscribe(duplicate);
        a.subscribe(duplicate);
        assert.deepEqual(out, []);
        a.clear();
        assert.deepEqual(out, ["A", "D", "D"]);
        off();
        off();
        out.length = 0;
        a.clear();
        assert.deepEqual(out, ["A", "D", "C"]);
      }
      if (c.id === "A11") {
        const a = layer(),
          raw = { B: "listener" },
          seen = [];
        a.subscribe(() => {
          seen.push(a.state);
          throw raw;
        });
        a.subscribe(() => {
          throw undefined;
        });
        a.subscribe(() => seen.push(a.state));
        assert.throws(
          () => a.set([mark()]),
          (e) => {
            assert(e instanceof AggregateError);
            assert.deepEqual(e.errors, [raw, undefined]);
            assert.equal(e.errors[0], raw);
            return true;
          },
        );
        assert.equal(a.state.revision, 1);
        assert.equal(a.state.marks.length, 1);
        assert.equal(seen.length, 2);
        assert.equal(seen[0], a.state);
      }
      if (c.id === "A12") {
        const a = layer(),
          b = layer("B");
        let reads = 0;
        a.subscribe(() => {
          assert.throws(
            () =>
              a.set(
                new Proxy([], {
                  get() {
                    reads++;
                    throw 0;
                  },
                }),
              ),
            error("reentrant_change"),
          );
          assert.throws(() => a.clear(), error("reentrant_change"));
          b.set([mark(Y)]);
        });
        a.clear();
        assert.equal(reads, 0);
        assert.equal(b.state.revision, 1);
      }
      if (c.id === "A13") {
        const a = layer(),
          raw = { B: "earlier" };
        let later = 0;
        a.subscribe(() => {
          throw raw;
        });
        a.subscribe(() => a.dispose());
        a.subscribe(() => later++);
        assert.throws(
          () => a.clear(),
          (e) => {
            assert(e instanceof AggregateError);
            assert.deepEqual(e.errors, [raw]);
            return true;
          },
        );
        assert.equal(later, 0);
        assert.equal(a.state.status, "disposed");
        assert.equal(a.state.revision, 1);
      }
      if (c.id === "A14") {
        const a = layer();
        a.set([mark()]);
        const old = a.state;
        let notices = 0,
          reads = 0;
        const off = a.subscribe(() => notices++);
        a.dispose();
        const end = a.state;
        a.dispose();
        assert.equal(a.state, end);
        deep(end);
        assert.equal(end.revision, 1);
        assert.equal(end.snapshotId, S);
        assert.equal(end.id, "L");
        assert.deepEqual(end.marks, []);
        assert.equal(old.marks.length, 1);
        assert.equal(notices, 0);
        assert.throws(
          () =>
            a.set(
              new Proxy([], {
                get() {
                  reads++;
                  throw 0;
                },
              }),
            ),
          error("disposed"),
        );
        assert.throws(() => a.clear(), error("disposed"));
        assert.throws(() => a.subscribe(null), error("disposed"));
        assert.equal(reads, 0);
        off();
        off();
      }
      if (c.id === "A15") {
        const a = layer();
        for (const x of [null, {}, 1, "listener", undefined])
          assert.throws(() => a.subscribe(x), error("invalid_argument"));
        let n = 0;
        const off = a.subscribe(() => n++);
        off();
        off();
        a.clear();
        assert.equal(n, 0);
      }
      if (c.id === "A16") {
        const a = layer("A"),
          b = layer("B");
        a.set([mark(Y, "Ay"), mark(X, "Ax")]);
        b.set([mark(X, "Bx"), mark(Y, "By")]);
        const r = resolve([X, Y, X, "unknown"], [b, a]);
        assert.deepEqual(
          r.map((x) => [x.layer.id, x.entry.ref]),
          [
            ["B", X],
            ["B", Y],
            ["A", X],
            ["A", Y],
          ],
        );
        assert.equal(r[0].layer, b.state);
        assert.equal(r[0].entry, b.state.marks[0]);
        assert.equal(r[2].entry, a.state.marks[1]);
        deep(r);
        const old = r;
        a.clear();
        assert.equal(old[2].entry.mark.badge, "Ax");
        assert.notEqual(resolve([X], [b]), resolve([X], [b]));
      }
      if (c.id === "A17") {
        const a = layer(),
          other = layer("other", "another-snapshot");
        const extra = [];
        extra.x = 1;
        for (const [snap, refs, layers] of [
          ["", [], []],
          [S, null, []],
          [S, [undefined], []],
          [S, new Array(1), []],
          [S, extra, []],
          [S, [], null],
          [S, [], new Array(1)],
          [S, [], [{}]],
        ])
          assert.throws(
            () => vm.resolveObjectAnnotations(snap, refs, layers),
            error("invalid_argument"),
          );
        assert.throws(() => resolve([], [a, other]), error("snapshot_mismatch"));
      }
      if (c.id === "A18") {
        const a = layer(),
          b = layer();
        for (const layers of [
          [a, a],
          [a, b],
          [{}],
          [Object.create(vm.AnnotationLayer.prototype)],
          [new Proxy(a, {})],
        ])
          assert.throws(() => resolve([X], layers), error("invalid_argument"));
        a.set([mark()]);
        const state = a.state;
        Object.defineProperty(a, "state", {
          configurable: true,
          get() {
            throw Error("must read own brand");
          },
        });
        assert.equal(resolve([X], [a])[0].layer, state);
        delete a.state;
      }
      if (c.id === "A19") {
        const a = layer();
        a.set([mark()]);
        a.dispose();
        a.subscribe = () => {
          throw Error("no subscribe in pure query");
        };
        assert.deepEqual(resolve([X], [a]), []);
        assert.throws(() => resolve([], [a], "other-snapshot"), error("snapshot_mismatch"));
      }
      if (c.id === "A20") {
        const a = layer("A"),
          b = layer("B");
        a.set([mark(X, "old")]);
        b.set([mark(X, "B")]);
        let n = 0;
        const layers = [a, b];
        Object.defineProperty(layers, 1, {
          get() {
            n++;
            a.set([mark(X, "latest")]);
            return b;
          },
        });
        const r = resolve([X], layers);
        assert.equal(n, 1);
        assert.equal(r[0].layer, a.state);
        assert.equal(r[0].entry.mark.badge, "latest");
        assert.equal(r[1].layer, b.state);
      }
      if (c.id === "A21") {
        const a = layer();
        a.set([mark()]);
        const reads = {};
        const arr = (tag, value) =>
          new Proxy([value], {
            get(t, k, r) {
              if (k === "length" || k === "0") reads[tag + k] = (reads[tag + k] ?? 0) + 1;
              return Reflect.get(t, k, r);
            },
          });
        deep(resolve(arr("refs", X), arr("layers", a)));
        assert.deepEqual(reads, { refslength: 1, refs0: 1, layerslength: 1, layers0: 1 });
        const raw = { B: "resolver" };
        const refs = [X];
        Object.defineProperty(refs, 0, {
          get() {
            throw raw;
          },
        });
        assert.throws(
          () => resolve(refs, [a]),
          (e) => {
            error("invalid_argument")(e);
            assert.equal(e.cause, raw);
            return true;
          },
        );
      }
      if (c.id === "A22") {
        const a = layer();
        a.set([mark("parent"), mark("parent.child"), mark("opaque[#7]")]);
        const state = a.state;
        assert.deepEqual(resolve(["parent.child.signal", "opaque"], [a]), []);
        assert.deepEqual(
          resolve(["parent.child"], [a]).map((x) => x.entry.ref),
          ["parent.child"],
        );
        assert.throws(
          () => resolve([{ ref: "parent", bits: { lsb: 0, width: 1 } }], [a]),
          error("invalid_argument"),
        );
        assert.equal(a.state, state);
      }
    } finally {
      for (const a of owned.reverse()) a.dispose();
    }
  });
