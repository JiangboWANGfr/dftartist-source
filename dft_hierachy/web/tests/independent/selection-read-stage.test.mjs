// Agent B independent oracle: DESIGN §6.5.2 C-70 at fixed 61a7ffe.
// Public caller getters/Proxies only; no product hook, source-derived oracle or sleep.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as viewmodel from "@hier/viewmodel";

const S = "B C70 snapshot";
const OTHER = "B C70 other snapshot";
const NONE = Symbol("no thrown cause expected");
const EMPTY = Object.freeze({
  snapshotId: S,
  origin: "external",
  items: Object.freeze([]),
});
const A = Object.freeze({
  snapshotId: S,
  origin: "tree",
  items: Object.freeze([Object.freeze({ ref: "B C70 A" })]),
});
const B = Object.freeze({
  snapshotId: S,
  origin: "graph",
  items: Object.freeze([Object.freeze({ ref: "B C70 B" })]),
});
const C = Object.freeze({
  snapshotId: S,
  origin: "source",
  items: Object.freeze([Object.freeze({ ref: "B C70 C" })]),
});
const choice = (items, origin = "source") => ({ snapshotId: S, origin, items });

function model(t, options = { snapshotId: S }) {
  assert.equal(
    typeof viewmodel.SelectionModel,
    "function",
    "M5 must export SelectionModel",
  );
  const m = new viewmodel.SelectionModel(options);
  t.after(() => m.dispose());
  return m;
}
function local(code, ...causes) {
  const hasCause = causes.length === 1 && causes[0] !== NONE;
  return (error) => {
    assert.equal(
      typeof viewmodel.SelectionError,
      "function",
      "M5 must export SelectionError",
    );
    assert.ok(error instanceof Error);
    assert.ok(error instanceof viewmodel.SelectionError);
    assert.equal(error.code, code);
    assert.ok(typeof error.message === "string" && error.message.length > 0);
    assert.equal(error instanceof AggregateError, false);
    if (hasCause) {
      assert.ok(
        Object.hasOwn(error, "cause"),
        "an undefined thrown value must still be preserved as cause",
      );
      assert.equal(error.cause, causes[0]);
    }
    return true;
  };
}
function seed(m) {
  m.select(A);
  m.select(B);
  m.back();
}
function unchangedAndUsable(m, seen) {
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoBack, true);
  assert.equal(m.canGoForward, true);
  assert.deepEqual(seen, []);
  m.forward();
  assert.deepEqual(m.current, B);
  m.back();
  assert.deepEqual(m.current, A);
  m.select(C);
  assert.deepEqual(m.current, C);
  assert.deepEqual(seen, [B, A, C]);
}
function getter(target, key, read) {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get: read,
  });
  return target;
}
function probeFault(target, key, effect) {
  // Either allowed existence-probe strategy encounters the same public side effect.
  // Do not constrain the product to "in" versus own-descriptor + prototype lookup.
  return new Proxy(target, {
    has(object, property) {
      if (property === key) effect();
      return Reflect.has(object, property);
    },
    getOwnPropertyDescriptor(object, property) {
      if (property === key) effect();
      return Reflect.getOwnPropertyDescriptor(object, property);
    },
  });
}

test("G01: deterministic field/index order, one Get per path, no missing/extension/map/iterator reads", (t) => {
  const m = model(t);
  const reads = [];
  const known = (value, name, allowed) =>
    new Proxy(value, {
      get(object, key, receiver) {
        assert.ok(allowed.includes(key), "unexpected Get " + String(key));
        assert.ok(
          Reflect.has(object, key),
          "missing declared fields must not be Get",
        );
        reads.push(name + "." + String(key));
        return Reflect.get(object, key, receiver);
      },
      ownKeys() {
        throw new Error("B no input enumeration");
      },
    });
  let refReads = 0,
    lsbReads = 0,
    widthReads = 0;
  const rawBits = {};
  getter(rawBits, "lsb", () => {
    assert.equal(++lsbReads, 1);
    return 2;
  });
  getter(rawBits, "width", () => {
    assert.equal(++widthReads, 1);
    return 3;
  });
  const bits = known(rawBits, "items.0.bits", ["lsb", "width"]);
  const rawItem = { bits, side: "inside" };
  getter(rawItem, "ref", () => {
    assert.equal(++refReads, 1);
    return "B first sample";
  });
  const item = known(rawItem, "items.0", ["ref", "def", "bits", "side"]);
  const def = known({ def: "B C70 definition" }, "items.1", [
    "ref",
    "def",
    "bits",
    "side",
  ]);
  const items = known([item, def], "items", ["length", "0", "1"]);
  const input = known({ snapshotId: S, origin: "graph", items }, "selection", [
    "snapshotId",
    "origin",
    "items",
  ]);
  m.select(input);
  assert.deepEqual(m.current, {
    snapshotId: S,
    origin: "graph",
    items: [
      { ref: "B first sample", bits: { lsb: 2, width: 3 }, side: "inside" },
      { def: "B C70 definition" },
    ],
  });
  assert.deepEqual(reads, [
    "selection.snapshotId",
    "selection.origin",
    "selection.items",
    "items.length",
    "items.0",
    "items.0.ref",
    "items.0.bits",
    "items.0.bits.lsb",
    "items.0.bits.width",
    "items.0.side",
    "items.1",
    "items.1.def",
  ]);
  assert.ok(Object.isFrozen(m.current));
  assert.ok(Object.isFrozen(m.current.items));
  assert.ok(Object.isFrozen(m.current.items[0]));
  assert.ok(Object.isFrozen(m.current.items[0].bits));
});

test("G01: inherited declared getters are accepted at selection, item and bits levels", (t) => {
  const m = model(t);
  const seen = [];
  const bits = Object.create(
    getter(
      getter({}, "lsb", () => {
        seen.push("lsb");
        return 4;
      }),
      "width",
      () => {
        seen.push("width");
        return 0;
      },
    ),
  );
  const item = Object.create(
    getter(
      getter(
        getter({}, "ref", () => {
          seen.push("ref");
          return "B inherited";
        }),
        "bits",
        () => {
          seen.push("bits");
          return bits;
        },
      ),
      "side",
      () => {
        seen.push("side");
        return "outside";
      },
    ),
  );
  const proto = {};
  getter(proto, "snapshotId", () => {
    seen.push("snapshot");
    return S;
  });
  getter(proto, "origin", () => {
    seen.push("origin");
    return "props";
  });
  getter(proto, "items", () => {
    seen.push("items");
    return [item];
  });
  m.select(Object.create(proto));
  assert.deepEqual(
    m.current,
    choice(
      [{ ref: "B inherited", bits: { lsb: 4, width: 0 }, side: "outside" }],
      "props",
    ),
  );
  assert.deepEqual(seen, [
    "snapshot",
    "origin",
    "items",
    "ref",
    "bits",
    "lsb",
    "width",
    "side",
  ]);
});

test("G01: a shared item in two input paths is sampled once on each path, not once per object", (t) => {
  const m = model(t);
  let reads = 0;
  const item = getter({}, "ref", () =>
    ++reads === 1 ? "B occurrence one" : "B occurrence two",
  );
  m.select(choice([item, item]));
  assert.equal(reads, 2);
  assert.deepEqual(
    m.current,
    choice([{ ref: "B occurrence one" }, { ref: "B occurrence two" }]),
  );
});

test("G01: inherited array index is sampled without using caller map or iterator", (t) => {
  const m = model(t);
  const items = new Array(1),
    proto = Object.create(Array.prototype);
  let indexReads = 0;
  getter(proto, "0", () => {
    ++indexReads;
    return { def: "B inherited array definition" };
  });
  Object.setPrototypeOf(items, proto);
  const fail = () => {
    throw new Error("B iterator/map/toJSON must not run");
  };
  getter(items, Symbol.iterator, fail);
  getter(items, "map", fail);
  getter(items, "toJSON", fail);
  m.select(choice(items));
  assert.equal(indexReads, 1);
  assert.deepEqual(
    m.current,
    choice([{ def: "B inherited array definition" }]),
  );
});

test("G01: projection ignores every extension getter and caller serialization callback", (t) => {
  const m = model(t);
  const fail = () => {
    throw new Error("B extension is not selection state");
  };
  const bits = { lsb: 0, width: 1 },
    item = { ref: "B extension", bits },
    input = choice([item]);
  for (const target of [bits, item, input, input.items]) {
    getter(target, "extension", fail);
    getter(target, "toJSON", fail);
    getter(target, Symbol.iterator, fail);
  }
  m.select(input);
  assert.deepEqual(
    m.current,
    choice([{ ref: "B extension", bits: { lsb: 0, width: 1 } }]),
  );
});

const navigationCases = [
  ["same-identity select", true, (m) => m.select(A)],
  ["changed-identity select", true, (m) => m.select(B)],
  ["movable back", true, (m) => m.back()],
  ["movable forward", true, (m) => m.forward()],
  ["boundary back", false, (m) => m.back()],
  ["boundary forward", false, (m) => m.forward()],
];
for (const [name, seeded, navigate] of navigationCases) {
  test(
    "G02: caught " + name + " is reentrant_change and outer input may commit",
    (t) => {
      const m = model(t);
      if (seeded) seed(m);
      const seen = [];
      m.subscribe((s) => seen.push(s));
      const input = choice([]);
      getter(input, "items", () => {
        assert.deepEqual(m.current, seeded ? A : EMPTY);
        assert.equal(m.disposed, false);
        assert.throws(() => navigate(m), local("reentrant_change"));
        return [{ ref: "B C70 C" }];
      });
      m.select(input);
      assert.deepEqual(m.current, C);
      assert.deepEqual(seen, [C]);
      m.back();
      assert.deepEqual(m.current, seeded ? A : EMPTY);
      assert.equal(m.canGoForward, true);
    },
  );
  test(
    "G02: uncaught " +
      name +
      " becomes invalid_selection/cause; lock is released",
    (t) => {
      const m = model(t);
      if (seeded) seed(m);
      const seen = [];
      m.subscribe((s) => seen.push(s));
      let nested;
      const input = choice([]);
      getter(input, "items", () => {
        try {
          navigate(m);
        } catch (error) {
          nested = error;
          throw error;
        }
        assert.fail("input-period navigation must not be accepted");
      });
      assert.throws(
        () => m.select(input),
        (error) => {
          assert.ok(local("reentrant_change")(nested));
          return local("invalid_selection", nested)(error);
        },
      );
      if (seeded) unchangedAndUsable(m, seen);
      else {
        assert.deepEqual(m.current, EMPTY);
        assert.deepEqual(seen, []);
        m.select(C);
        assert.deepEqual(m.current, C);
        assert.deepEqual(seen, [C]);
      }
    },
  );
}

const thrownCases = [
  ["Error", () => new Error("B getter fault")],
  ["string", () => "B thrown string"],
  ["number", () => 17],
  ["null", () => null],
  ["undefined", () => undefined],
  ["object", () => ({ B: "thrown object" })],
  ["symbol", () => Symbol("B thrown")],
];
for (const [name, makeValue] of thrownCases) {
  test(
    "G03: getter throws " +
      name +
      " retained by exact Error.cause without a commit",
    (t) => {
      const m = model(t);
      seed(m);
      const seen = [];
      m.subscribe((s) => seen.push(s));
      const cause = makeValue(),
        input = choice([]);
      getter(input, "origin", () => {
        throw cause;
      });
      let later = 0;
      getter(input, "items", () => {
        ++later;
        return C.items;
      });
      assert.throws(() => m.select(input), local("invalid_selection", cause));
      assert.equal(later, 0);
      unchangedAndUsable(m, seen);
    },
  );
}

test("G03: a caller-thrown SelectionError is wrapped, not mistaken for a model guard failure", (t) => {
  const m = model(t);
  seed(m);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  const cause = new viewmodel.SelectionError(
    "disposed",
    "B caller-owned error",
  );
  const input = getter(choice([]), "origin", () => {
    throw cause;
  });
  assert.throws(() => m.select(input), local("invalid_selection", cause));
  assert.equal(m.disposed, false);
  unchangedAndUsable(m, seen);
});

test("G03: existence-probe exception is wrapped before Get and stops later projection", (t) => {
  const m = model(t);
  seed(m);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  const cause = new Error("B property probe"),
    target = choice([]);
  let originReads = 0,
    itemReads = 0;
  getter(target, "origin", () => {
    ++originReads;
    return "source";
  });
  getter(target, "items", () => {
    ++itemReads;
    return C.items;
  });
  assert.throws(
    () =>
      m.select(
        probeFault(target, "origin", () => {
          throw cause;
        }),
      ),
    local("invalid_selection", cause),
  );
  assert.equal(originReads, 0);
  assert.equal(itemReads, 0);
  unchangedAndUsable(m, seen);
});

for (const [name, input] of [
  [
    "invalid origin before later read",
    () => ({ snapshotId: S, origin: "invalid", items: [] }),
  ],
  [
    "snapshot mismatch before later read",
    () => ({ snapshotId: OTHER, origin: "source", items: [] }),
  ],
  [
    "invalid snapshot primitive before later read",
    () => ({ snapshotId: "", origin: "source", items: [] }),
  ],
]) {
  test(
    "G03: " + name + " cannot outrank a subsequent declared getter throw",
    (t) => {
      const m = model(t);
      seed(m);
      const seen = [];
      m.subscribe((s) => seen.push(s));
      const cause = new Error("B later declared getter"),
        value = input();
      getter(value, "items", () => {
        throw cause;
      });
      assert.throws(() => m.select(value), local("invalid_selection", cause));
      unchangedAndUsable(m, seen);
    },
  );
}

test("G03: invalid ref primitive is validated after a later declared side getter is captured", (t) => {
  const m = model(t);
  seed(m);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  const cause = new Error("B side getter"),
    item = { ref: "" };
  getter(item, "side", () => {
    throw cause;
  });
  assert.throws(
    () => m.select(choice([item])),
    local("invalid_selection", cause),
  );
  unchangedAndUsable(m, seen);
});

for (const [name, makeValue] of thrownCases) {
  test(
    "G04: dispose plus getter-thrown " +
      name +
      " returns disposed with original cause",
    (t) => {
      const m = model(t);
      seed(m);
      const old = m.current,
        cause = makeValue();
      const seen = [];
      const unsubscribe = m.subscribe((s) => seen.push(s));
      const input = choice([]);
      let later = 0;
      getter(input, "origin", () => {
        m.dispose();
        assert.equal(m.disposed, true);
        assert.deepEqual(m.current, EMPTY);
        assert.throws(() => m.select(C), local("disposed"));
        throw cause;
      });
      getter(input, "items", () => {
        ++later;
        return C.items;
      });
      assert.throws(() => m.select(input), local("disposed", cause));
      assert.equal(later, 0);
      assert.deepEqual(seen, []);
      assert.deepEqual(m.current, EMPTY);
      assert.deepEqual(old, A);
      assert.ok(Object.isFrozen(old));
      assert.equal(m.canGoBack, false);
      assert.equal(m.canGoForward, false);
      unsubscribe();
      unsubscribe();
      m.dispose();
    },
  );
}

for (const [name, value] of [
  ["valid", "source"],
  ["invalid", "bad"],
  ["undefined-present", undefined],
]) {
  test(
    "G04: disposal during getter returning " +
      name +
      " wins and stops subsequent fields",
    (t) => {
      const m = model(t),
        input = choice([]);
      let later = 0;
      const seen = [];
      m.subscribe((s) => seen.push(s));
      getter(input, "origin", () => {
        m.dispose();
        return value;
      });
      getter(input, "items", () => {
        ++later;
        return C.items;
      });
      assert.throws(() => m.select(input), local("disposed"));
      assert.equal(later, 0);
      assert.deepEqual(seen, []);
      assert.deepEqual(m.current, EMPTY);
    },
  );
}

for (const throwAfter of [false, true]) {
  test(
    "G04: disposal during existence probe " +
      (throwAfter ? "plus throw" : "plus return") +
      " precedes Get and validation",
    (t) => {
      const m = model(t),
        target = choice([]);
      const cause = new Error("B probe after disposal");
      let gets = 0;
      getter(target, "snapshotId", () => {
        ++gets;
        return OTHER;
      });
      const input = probeFault(target, "snapshotId", () => {
        m.dispose();
        if (throwAfter) throw cause;
      });
      assert.throws(
        () => m.select(input),
        local("disposed", throwAfter ? cause : NONE),
      );
      assert.equal(gets, 0);
      assert.deepEqual(m.current, EMPTY);
    },
  );
}

test("G04: post-dispose entry never probes or reads the supplied input", (t) => {
  const m = model(t);
  m.dispose();
  let access = 0;
  const input = new Proxy(
    {},
    {
      has() {
        ++access;
        throw new Error("B must not probe");
      },
      getOwnPropertyDescriptor() {
        ++access;
        throw new Error("B must not probe");
      },
      get() {
        ++access;
        throw new Error("B must not Get");
      },
      ownKeys() {
        ++access;
        throw new Error("B must not enumerate");
      },
    },
  );
  assert.throws(() => m.select(input), local("disposed"));
  assert.equal(access, 0);
});

test("G05: constructor captures inherited getters once, in snapshot/limit order, before validation", (t) => {
  const reads = [];
  let snapshotReads = 0,
    limitReads = 0;
  const proto = {};
  getter(proto, "snapshotId", () => {
    reads.push("snapshot");
    assert.equal(++snapshotReads, 1);
    return S;
  });
  getter(proto, "historyLimit", () => {
    reads.push("limit");
    assert.equal(++limitReads, 1);
    return 1;
  });
  const options = Object.create(proto);
  getter(options, "extension", () => {
    throw new Error("B options extension");
  });
  getter(options, "toJSON", () => {
    throw new Error("B options toJSON");
  });
  const m = model(t, options);
  assert.deepEqual(reads, ["snapshot", "limit"]);
  m.select(A);
  m.select(B);
  assert.equal(m.snapshotId, S);
  assert.equal(m.canGoBack, false);
  assert.deepEqual(m.current, B);
});

for (const [name, makeValue] of thrownCases) {
  test(
    "G05: constructor getter throws " +
      name +
      " as invalid_options/cause and stops later fields",
    () => {
      assert.equal(
        typeof viewmodel.SelectionModel,
        "function",
        "M5 must export SelectionModel",
      );
      const cause = makeValue(),
        options = {};
      let later = 0;
      getter(options, "snapshotId", () => {
        throw cause;
      });
      getter(options, "historyLimit", () => {
        ++later;
        return 1;
      });
      assert.throws(
        () => new viewmodel.SelectionModel(options),
        local("invalid_options", cause),
      );
      assert.equal(later, 0);
    },
  );
}

test("G05: constructor existence-probe error is invalid_options/cause, no getter is invoked", () => {
  assert.equal(
    typeof viewmodel.SelectionModel,
    "function",
    "M5 must export SelectionModel",
  );
  const cause = new Error("B option probe"),
    options = {};
  let gets = 0;
  getter(options, "snapshotId", () => {
    ++gets;
    return S;
  });
  const input = probeFault(options, "snapshotId", () => {
    throw cause;
  });
  assert.throws(
    () => new viewmodel.SelectionModel(input),
    local("invalid_options", cause),
  );
  assert.equal(gets, 0);
});

test("G05: options are fully captured before invalid snapshot primitive is checked", () => {
  assert.equal(
    typeof viewmodel.SelectionModel,
    "function",
    "M5 must export SelectionModel",
  );
  const cause = new Error("B limit capture"),
    options = { snapshotId: "" };
  getter(options, "historyLimit", () => {
    throw cause;
  });
  assert.throws(
    () => new viewmodel.SelectionModel(options),
    local("invalid_options", cause),
  );
});

test("G05: constructor input side effects are not rolled back when a later option throws", (t) => {
  const old = model(t);
  seed(old);
  const cause = new Error("B later option");
  let sideEffect = 0;
  const options = {};
  getter(options, "snapshotId", () => {
    ++sideEffect;
    old.dispose();
    return S;
  });
  getter(options, "historyLimit", () => {
    throw cause;
  });
  assert.throws(
    () => new viewmodel.SelectionModel(options),
    local("invalid_options", cause),
  );
  assert.equal(sideEffect, 1);
  assert.equal(old.disposed, true);
  assert.deepEqual(old.current, EMPTY);
});

test("G06: notification echo has input protection, then restores the still-active notification guard", (t) => {
  const m = model(t),
    seen = [],
    added = [];
  let reads = 0;
  const first = m.subscribe((state) => {
    assert.deepEqual(state, A);
    const item = getter({}, "ref", () => {
      ++reads;
      assert.throws(() => m.select(A), local("reentrant_change"));
      assert.throws(() => m.forward(), local("reentrant_change")); // input-period boundary is not allowed
      m.subscribe((s) => added.push(s));
      return "B C70 A";
    });
    m.select(choice([item], "props"));
    assert.deepEqual(m.current, A); // echo origin must not overwrite tree
    assert.throws(() => m.select(B), local("reentrant_change"));
    assert.throws(() => m.back(), local("reentrant_change"));
    m.forward(); // now back in notification phase, so boundary no-op is allowed
    seen.push("first");
  });
  const peer = m.subscribe((state) => {
    assert.deepEqual(state, A);
    seen.push("peer");
  });
  m.select(A);
  assert.equal(reads, 1);
  assert.deepEqual(seen, ["first", "peer"]);
  assert.deepEqual(added, []); // added during an existing publication is next round only
  first();
  peer();
  m.select(B);
  assert.deepEqual(added, [B]);
  m.back();
  assert.deepEqual(m.current, A);
  m.back();
  assert.deepEqual(m.current, EMPTY);
});

test("G06: caught input getter failure during publication does not release the outer notification guard", (t) => {
  const m = model(t),
    seen = [],
    cause = new Error("B observer input read");
  const first = m.subscribe(() => {
    const input = getter(choice([]), "origin", () => {
      throw cause;
    });
    assert.throws(() => m.select(input), local("invalid_selection", cause));
    assert.throws(() => m.select(B), local("reentrant_change"));
    assert.throws(() => m.back(), local("reentrant_change"));
    seen.push("first");
  });
  const peer = m.subscribe((s) => {
    assert.deepEqual(s, A);
    seen.push("peer");
  });
  m.select(A);
  assert.deepEqual(seen, ["first", "peer"]);
  assert.deepEqual(m.current, A);
  first();
  peer();
  m.select(B);
  assert.deepEqual(m.current, B);
});

for (const [name, input, code] of [
  [
    "invalid structure",
    { snapshotId: OTHER, origin: "source", items: [{ ref: "" }] },
    "invalid_selection",
  ],
  [
    "different snapshot",
    { snapshotId: OTHER, origin: "source", items: [{ ref: "B other" }] },
    "snapshot_mismatch",
  ],
]) {
  test(
    "G06: " +
      name +
      " takes precedence over changed-identity notification reentrancy",
    (t) => {
      const m = model(t);
      let calls = 0;
      m.subscribe(() => {
        ++calls;
        assert.throws(() => m.select(input), local(code));
      });
      m.select(A);
      assert.equal(calls, 1);
      assert.deepEqual(m.current, A);
      assert.equal(m.canGoBack, true);
    },
  );
}

test("G06: uncaught input read error becomes the listener's AggregateError entry, not a new publication", (t) => {
  const m = model(t),
    cause = new Error("B observer read"),
    seen = [];
  const unsubscribe = m.subscribe(() => {
    m.select(
      getter(choice([]), "origin", () => {
        throw cause;
      }),
    );
  });
  const peer = m.subscribe((s) => seen.push(s));
  assert.throws(
    () => m.select(A),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 1);
      return local("invalid_selection", cause)(error.errors[0]);
    },
  );
  assert.deepEqual(seen, [A]);
  assert.deepEqual(m.current, A);
  unsubscribe();
  peer();
  m.select(B);
  assert.deepEqual(m.current, B);
});

test("G06: getter disposal during notification immediately stops peers, even when disposed is caught", (t) => {
  const m = model(t),
    seen = [];
  m.subscribe(() => {
    const input = getter(choice([]), "items", () => {
      m.dispose();
      return A.items;
    });
    assert.throws(() => m.select(input), local("disposed"));
    seen.push("disposed");
  });
  m.subscribe(() => seen.push("must not run"));
  m.select(A);
  assert.deepEqual(seen, ["disposed"]);
  assert.equal(m.disposed, true);
  assert.deepEqual(m.current, EMPTY);
});

test("G06: disposal plus getter error in a listener keeps previous exception and original cause in order", (t) => {
  const m = model(t),
    first = new Error("B prior observer"),
    cause = new Error("B disposer getter"),
    seen = [];
  m.subscribe(() => {
    seen.push("first");
    throw first;
  });
  m.subscribe(() => {
    seen.push("dispose");
    const input = getter(choice([]), "items", () => {
      m.dispose();
      throw cause;
    });
    m.select(input);
  });
  m.subscribe(() => seen.push("must not run"));
  assert.throws(
    () => m.select(A),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.equal(error.errors[0], first);
      return local("disposed", cause)(error.errors[1]);
    },
  );
  assert.deepEqual(seen, ["first", "dispose"]);
  assert.equal(m.disposed, true);
  assert.deepEqual(m.current, EMPTY);
});

test("G07: subscriber added in input capture receives that later commit, and reads see pre-commit state", (t) => {
  const m = model(t);
  seed(m);
  const oldSeen = [],
    newSeen = [];
  m.subscribe((s) => oldSeen.push(s));
  const input = getter(choice([]), "items", () => {
    assert.deepEqual(m.current, A);
    assert.equal(m.snapshotId, S);
    assert.equal(m.canGoBack, true);
    assert.equal(m.canGoForward, true);
    m.subscribe((s) => newSeen.push(s));
    return C.items;
  });
  m.select(input);
  assert.deepEqual(oldSeen, [C]);
  assert.deepEqual(newSeen, [C]);
});

test("G07: failed capture preserves its legal subscription changes and external side effects", (t) => {
  const m = model(t);
  seed(m);
  const oldSeen = [],
    newSeen = [],
    cause = new Error("B after subscription");
  let external = 0;
  const remove = m.subscribe((s) => oldSeen.push(s));
  const input = getter(choice([]), "origin", () => {
    ++external;
    remove();
    remove();
    m.subscribe((s) => newSeen.push(s));
    throw cause;
  });
  assert.throws(() => m.select(input), local("invalid_selection", cause));
  assert.equal(external, 1);
  assert.deepEqual(oldSeen, []);
  assert.deepEqual(newSeen, []);
  unchangedAndUsable(m, newSeen);
  assert.deepEqual(oldSeen, []);
});

test("G07: input-period subscribe/unsubscribe may be transient, with no phantom notification", (t) => {
  const m = model(t),
    seen = [];
  const input = getter(choice([]), "items", () => {
    const remove = m.subscribe((s) => seen.push(s));
    remove();
    remove();
    assert.throws(() => m.subscribe(null), TypeError);
    return C.items;
  });
  m.select(input);
  assert.deepEqual(m.current, C);
  assert.deepEqual(seen, []);
});

test("G07: input navigation guard is per model, not global, and other model side effect is not rolled back", (t) => {
  const m = model(t),
    other = model(t),
    cause = new Error("B after other model");
  const input = getter(choice([]), "items", () => {
    other.select(B);
    throw cause;
  });
  assert.throws(() => m.select(input), local("invalid_selection", cause));
  assert.deepEqual(m.current, EMPTY);
  assert.deepEqual(other.current, B);
  m.select(C);
  assert.deepEqual(m.current, C);
});

const badContainers = [
  ["selection array", "selection", () => []],
  ["selection function", "selection", () => function BRecord() {}],
  ["item array", "item", () => []],
  ["item function", "item", () => function BItem() {}],
  ["item null", "item", () => null],
  ["bits array", "bits", () => []],
  ["bits function", "bits", () => function BBits() {}],
  ["bits null", "bits", () => null],
  [
    "items array-like record",
    "items",
    () => ({ length: 1, 0: { ref: "B arraylike" } }),
  ],
  ["items function", "items", () => function BItems() {}],
];
for (const [name, where, makeValue] of badContainers) {
  test(
    "G08: " +
      name +
      " is rejected as a container and prevents later input reads",
    (t) => {
      const m = model(t);
      seed(m);
      const seen = [];
      m.subscribe((s) => seen.push(s));
      const bad = makeValue();
      let forbidden = 0;
      const fail = () => {
        ++forbidden;
        throw new Error("B field after bad container");
      };
      let input;
      if (where === "selection") {
        getter(bad, "origin", fail);
        getter(bad, "items", fail);
        input = bad;
      } else if (where === "item") {
        if (bad !== null) getter(bad, "ref", fail);
        const items = [bad];
        getter(items, "1", fail);
        input = choice(items);
      } else if (where === "bits") {
        if (bad !== null) {
          getter(bad, "lsb", fail);
          getter(bad, "width", fail);
        }
        const item = { ref: "B bad bits", bits: bad };
        getter(item, "side", fail);
        input = choice([item]);
      } else {
        getter(bad, "0", fail);
        input = choice(bad);
      }
      assert.throws(() => m.select(input), local("invalid_selection"));
      assert.equal(forbidden, 0);
      unchangedAndUsable(m, seen);
    },
  );
}
for (const [name, makeValue] of [
  ["array", () => []],
  ["function", () => function BOptions() {}],
]) {
  test(
    "G08: " + name + " constructor options reject before any declared getter",
    () => {
      assert.equal(
        typeof viewmodel.SelectionModel,
        "function",
        "M5 must export SelectionModel",
      );
      const input = makeValue();
      let reads = 0;
      getter(input, "snapshotId", () => {
        ++reads;
        return S;
      });
      getter(input, "historyLimit", () => {
        ++reads;
        return 1;
      });
      assert.throws(
        () => new viewmodel.SelectionModel(input),
        local("invalid_options"),
      );
      assert.equal(reads, 0);
    },
  );
}

test("G08: inherited undefined is a present invalid field, not omission", (t) => {
  const m = model(t);
  seed(m);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  const proto = getter({}, "side", () => undefined),
    item = Object.create(proto);
  item.ref = "B inherited undefined";
  assert.throws(() => m.select(choice([item])), local("invalid_selection"));
  unchangedAndUsable(m, seen);
});

test("G08: undefined from inherited options getter is invalid_options rather than unbound mode", () => {
  assert.equal(
    typeof viewmodel.SelectionModel,
    "function",
    "M5 must export SelectionModel",
  );
  const options = Object.create(getter({}, "snapshotId", () => undefined));
  assert.throws(
    () => new viewmodel.SelectionModel(options),
    local("invalid_options"),
  );
});

test("G08: sparse item is invalid and stops before the next array index", (t) => {
  const m = model(t);
  seed(m);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  const items = new Array(2);
  let later = 0;
  getter(items, "1", () => {
    ++later;
    return C.items[0];
  });
  assert.throws(() => m.select(choice(items)), local("invalid_selection"));
  assert.equal(later, 0);
  unchangedAndUsable(m, seen);
});
