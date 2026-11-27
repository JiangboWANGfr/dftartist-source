// Agent B frozen oracle for DESIGN §6.5 at proposal 52ae57c.
// Public surface only. No A consumer, implementation, private hooks or timing races.
// Selection history is navigation, not planning-edit/design undo.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as viewmodel from "@hier/viewmodel";

const MAX = Number.MAX_SAFE_INTEGER;
const SNAP = "B snapshot α/0";
const OTHER = "B snapshot α/1";
const A = { items: [{ ref: "B object A" }], origin: "tree" };
const B = {
  items: [{ ref: "B object B", bits: { lsb: 2, width: 3 }, side: "inside" }],
  origin: "graph",
};
const C = { items: [{ def: "B definition C" }], origin: "source" };
const EMPTY = { items: [], origin: "external" };
// Immutable hand-written fixtures cannot be corrupted by one failing test and
// accidentally turn later expectations into the implementation's actual values.
for (const value of [A, B, C, EMPTY]) {
  for (const item of value.items) {
    if (item.bits) Object.freeze(item.bits);
    Object.freeze(item);
  }
  Object.freeze(value.items);
  Object.freeze(value);
}
const withSnapshot = (value, snapshotId = SNAP) => ({ ...value, snapshotId });
const clone = (value) => structuredClone(value);

function model(t, options) {
  assert.equal(
    typeof viewmodel.SelectionModel,
    "function",
    "M5 must export SelectionModel",
  );
  const m = new viewmodel.SelectionModel(options);
  t.after(() => m.dispose());
  return m;
}

function localError(code) {
  return (error) => {
    assert.equal(
      typeof viewmodel.SelectionError,
      "function",
      "M5 must export SelectionError",
    );
    assert.ok(error instanceof Error);
    assert.ok(error instanceof viewmodel.SelectionError);
    assert.equal(error.code, code);
    assert.equal(typeof error.message, "string");
    assert.ok(error.message.length > 0, "diagnostic message must be nonempty");
    return true;
  };
}

function deepFrozen(value) {
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") deepFrozen(child);
  }
}

// Reject while a forward branch exists. Check public navigation afterwards so
// a silently truncated/partially inserted record cannot pass a current-only check.
function rejectAtomically(t, input, code = "invalid_selection", bound = false) {
  const m = model(t, bound ? { snapshotId: SNAP } : undefined);
  const a = bound ? withSnapshot(A) : A;
  const b = bound ? withSnapshot(B) : B;
  const empty = bound ? withSnapshot(EMPTY) : EMPTY;
  m.select(clone(a));
  m.select(clone(b));
  m.back();
  const seen = [];
  m.subscribe((value) => seen.push(clone(value)));
  assert.throws(() => m.select(input()), localError(code));
  assert.deepEqual(m.current, a);
  assert.equal(m.canGoBack, true);
  assert.equal(m.canGoForward, true);
  assert.deepEqual(seen, []);
  m.forward();
  assert.deepEqual(m.current, b);
  m.back();
  assert.deepEqual(m.current, a);
  m.back();
  assert.deepEqual(m.current, empty);
  assert.equal(m.canGoBack, false);
  assert.deepEqual(seen, [b, a, empty]);
}

test("S01: public SelectionError covers every documented local code", () => {
  assert.equal(
    typeof viewmodel.SelectionError,
    "function",
    "M5 must export SelectionError",
  );
  for (const code of [
    "invalid_options",
    "invalid_selection",
    "snapshot_mismatch",
    "disposed",
    "reentrant_change",
  ]) {
    const error = new viewmodel.SelectionError(code, "B diagnostic");
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.message, "B diagnostic");
  }
});

for (const [name, options, expected] of [
  ["no-arg", undefined, EMPTY],
  ["empty options", {}, EMPTY],
  ["bound", { snapshotId: SNAP }, withSnapshot(EMPTY)],
]) {
  test(`S01: ${name} initial empty state has no notification replay`, (t) => {
    const m = model(t, options);
    assert.deepEqual(m.current, expected);
    assert.equal(m.snapshotId, options?.snapshotId);
    assert.equal(m.canGoBack, false);
    assert.equal(m.canGoForward, false);
    assert.equal(m.disposed, false);
    deepFrozen(m.current);
    const seen = [];
    m.subscribe((s) => seen.push(s));
    m.back();
    m.forward();
    assert.deepEqual(seen, []);
    assert.deepEqual(m.current, expected);
  });
}

test("S01: old no-arg Slice shape is preserved exactly through back/forward", (t) => {
  const m = model(t);
  const a = {
    items: [{ ref: "s:0:0", bits: { lsb: 0, width: 1 } }],
    origin: "tree",
  };
  const b = {
    items: [{ ref: "s:0.1:0", bits: { lsb: 0, width: 1 } }],
    origin: "graph",
  };
  m.select(a);
  m.select(b);
  m.back();
  assert.deepEqual(m.current, a);
  m.forward();
  assert.deepEqual(m.current, b);
});

for (const origin of ["tree", "graph", "source", "props", "external"]) {
  test(`S02: origin ${origin} is preserved on an actual navigation`, (t) => {
    const m = model(t);
    const value = { items: [{ ref: "B/origin/" + origin }], origin };
    m.select(value);
    assert.deepEqual(m.current, value);
  });
}

for (const [name, item] of [
  ["instance without fictional width", { ref: "i:0.2:0" }],
  ["port without bits", { ref: "p:0.2:1" }],
  ["signal without bits", { ref: "s:0.2:2" }],
  ["process without bits", { ref: "x:0.2:3" }],
  ["register without bits", { ref: "r:0.2:4" }],
  ["definition", { def: "d:23" }],
  ["opaque object punctuation", { ref: "B opaque/with.dot:α" }],
  ["opaque definition punctuation", { def: "B def/with.dot:α" }],
  ["untrimmed whitespace", { ref: " " }],
  ["embedded NUL", { def: "B\u0000def" }],
  ["zero width", { ref: "B zero", bits: { lsb: 0, width: 0 } }],
  [
    "safe integer independent maxima",
    { ref: "B maximum", bits: { lsb: MAX, width: MAX } },
  ],
  [
    "inside does not infer object kind",
    { ref: "B opaque non-port", side: "inside" },
  ],
  [
    "outside does not infer object kind",
    { ref: "B another opaque", side: "outside" },
  ],
]) {
  test(`S02: accepts ${name} using primitive rules only`, (t) => {
    const m = model(t);
    const value = { items: [item], origin: "external" };
    m.select(clone(value));
    assert.deepEqual(m.current, value);
  });
}

test("S02: ordered exact de-dup preserves ref/def/bit presence/side and Unicode differences", (t) => {
  const m = model(t);
  const distinct = [
    { ref: "B same" },
    { def: "B same" },
    { ref: "B same", bits: { lsb: 0, width: 0 } },
    { ref: "B same", bits: { lsb: 0, width: 1 } },
    { ref: "B same", bits: { lsb: 1, width: 1 } },
    { ref: "B same", side: "inside" },
    { ref: "B same", side: "outside" },
    { ref: "B same", bits: { lsb: 0, width: 1 }, side: "inside" },
    { ref: "B same", bits: { lsb: 0, width: 1 }, side: "outside" },
    { ref: "B é" },
    { ref: "B e\u0301" },
    { ref: "B same/other-occurrence" },
  ];
  m.select({
    items: [
      distinct[0],
      distinct[1],
      clone(distinct[0]),
      ...distinct.slice(2),
      clone(distinct[1]),
    ],
    origin: "tree",
  });
  assert.deepEqual(m.current, { items: distinct, origin: "tree" });
  assert.equal(m.current.items[0].ref, "B same");
});

const malformedSelections = [
  ["undefined selection", () => undefined],
  ["null selection", () => null],
  ["boolean selection", () => false],
  ["string selection", () => "B"],
  ["numeric selection", () => 7],
  ["empty object", () => ({})],
  ["missing items", () => ({ origin: "tree" })],
  ["missing origin", () => ({ items: [] })],
  ["undefined origin", () => ({ items: [], origin: undefined })],
  ["null origin", () => ({ items: [], origin: null })],
  ["unknown origin", () => ({ items: [], origin: "panel" })],
  ["wrong-case origin", () => ({ items: [], origin: "Tree" })],
  ["null items", () => ({ items: null, origin: "tree" })],
  ["undefined items", () => ({ items: undefined, origin: "tree" })],
  ["non-array items", () => ({ items: {}, origin: "tree" })],
  ["null item", () => ({ items: [null], origin: "tree" })],
  ["undefined item", () => ({ items: [undefined], origin: "tree" })],
  ["primitive item", () => ({ items: ["B"], origin: "tree" })],
  ["item missing address", () => ({ items: [{}], origin: "tree" })],
  [
    "both addresses",
    () => ({ items: [{ ref: "B", def: "B" }], origin: "tree" }),
  ],
  ["empty ref", () => ({ items: [{ ref: "" }], origin: "tree" })],
  ["null ref", () => ({ items: [{ ref: null }], origin: "tree" })],
  ["undefined ref", () => ({ items: [{ ref: undefined }], origin: "tree" })],
  ["numeric ref", () => ({ items: [{ ref: 1 }], origin: "tree" })],
  ["empty def", () => ({ items: [{ def: "" }], origin: "tree" })],
  ["null def", () => ({ items: [{ def: null }], origin: "tree" })],
  ["undefined def", () => ({ items: [{ def: undefined }], origin: "tree" })],
  ["numeric def", () => ({ items: [{ def: 1 }], origin: "tree" })],
  [
    "object also undefined def",
    () => ({ items: [{ ref: "B", def: undefined }], origin: "tree" }),
  ],
  [
    "definition also undefined ref",
    () => ({ items: [{ def: "B", ref: undefined }], origin: "tree" }),
  ],
  [
    "definition bits",
    () => ({
      items: [{ def: "B", bits: { lsb: 0, width: 1 } }],
      origin: "tree",
    }),
  ],
  [
    "definition undefined bits",
    () => ({ items: [{ def: "B", bits: undefined }], origin: "tree" }),
  ],
  [
    "definition side",
    () => ({ items: [{ def: "B", side: "inside" }], origin: "tree" }),
  ],
  [
    "definition undefined side",
    () => ({ items: [{ def: "B", side: undefined }], origin: "tree" }),
  ],
  [
    "undefined bits",
    () => ({ items: [{ ref: "B", bits: undefined }], origin: "tree" }),
  ],
  ["null bits", () => ({ items: [{ ref: "B", bits: null }], origin: "tree" })],
  [
    "primitive bits",
    () => ({ items: [{ ref: "B", bits: 1 }], origin: "tree" }),
  ],
  [
    "missing lsb",
    () => ({ items: [{ ref: "B", bits: { width: 1 } }], origin: "tree" }),
  ],
  [
    "missing width",
    () => ({ items: [{ ref: "B", bits: { lsb: 0 } }], origin: "tree" }),
  ],
  [
    "undefined side",
    () => ({ items: [{ ref: "B", side: undefined }], origin: "tree" }),
  ],
  ["null side", () => ({ items: [{ ref: "B", side: null }], origin: "tree" })],
  [
    "wrong side",
    () => ({ items: [{ ref: "B", side: "outer" }], origin: "tree" }),
  ],
  [
    "wrong-case side",
    () => ({ items: [{ ref: "B", side: "Inside" }], origin: "tree" }),
  ],
  [
    "late invalid item after valid A",
    () => ({ items: [{ ref: "B object A" }, { def: "" }], origin: "source" }),
  ],
  [
    "invalid origin even with current identity",
    () => ({ items: [{ ref: "B object A" }], origin: "invalid" }),
  ],
];
for (const field of ["lsb", "width"]) {
  for (const [name, value] of [
    ["negative", -1],
    ["fraction", 0.5],
    ["unsafe", MAX + 1],
    ["NaN", NaN],
    ["infinity", Infinity],
    ["negative infinity", -Infinity],
    ["string", "1"],
    ["null", null],
    ["undefined", undefined],
  ]) {
    malformedSelections.push([
      field + " " + name,
      () => ({
        items: [{ ref: "B", bits: { lsb: 0, width: 1, [field]: value } }],
        origin: "tree",
      }),
    ]);
  }
}
for (const [name, input] of malformedSelections) {
  test(`S03: ${name} rejects atomically without destroying forward`, (t) =>
    rejectAtomically(t, input));
}

const malformedOptions = [
  ["null", null],
  ["boolean", false],
  ["number", 1],
  ["string", "B"],
  ["snapshot empty", { snapshotId: "" }],
  ["snapshot null", { snapshotId: null }],
  ["snapshot undefined-present", { snapshotId: undefined }],
  ["snapshot numeric", { snapshotId: 2 }],
];
for (const [name, value] of [
  ["zero", 0],
  ["negative", -1],
  ["fraction", 1.5],
  ["unsafe", MAX + 1],
  ["NaN", NaN],
  ["infinity", Infinity],
  ["string", "2"],
  ["null", null],
  ["undefined-present", undefined],
])
  malformedOptions.push(["limit " + name, { historyLimit: value }]);
for (const [name, input] of malformedOptions) {
  test(`S04: constructor rejects ${name} as invalid_options`, () => {
    assert.equal(
      typeof viewmodel.SelectionModel,
      "function",
      "M5 must export SelectionModel",
    );
    assert.throws(
      () => new viewmodel.SelectionModel(input),
      localError("invalid_options"),
    );
  });
}

for (const [name, input, code, bound] of [
  ["bound missing snapshot", () => EMPTY, "snapshot_mismatch", true],
  [
    "bound other snapshot empty",
    () => withSnapshot(EMPTY, OTHER),
    "snapshot_mismatch",
    true,
  ],
  [
    "bound other snapshot same target",
    () => withSnapshot(A, OTHER),
    "snapshot_mismatch",
    true,
  ],
  [
    "unbound receives snapshot empty",
    () => withSnapshot(EMPTY),
    "snapshot_mismatch",
    false,
  ],
  [
    "bound invalid snapshot empty",
    () => withSnapshot(EMPTY, ""),
    "invalid_selection",
    true,
  ],
  [
    "bound invalid snapshot null",
    () => withSnapshot(EMPTY, null),
    "invalid_selection",
    true,
  ],
  [
    "bound invalid snapshot number",
    () => withSnapshot(EMPTY, 1),
    "invalid_selection",
    true,
  ],
  [
    "unbound invalid snapshot empty",
    () => withSnapshot(EMPTY, ""),
    "invalid_selection",
    false,
  ],
  [
    "malformed selection before snapshot mismatch",
    () => ({ items: [{ ref: "" }], origin: "tree", snapshotId: OTHER }),
    "invalid_selection",
    true,
  ],
]) {
  test(`S04: ${name}`, (t) => rejectAtomically(t, input, code, bound));
}

test("S04: explicit undefined snapshot is invalid rather than absent", (t) => {
  rejectAtomically(
    t,
    () => ({ ...EMPTY, snapshotId: undefined }),
    "invalid_selection",
    true,
  );
});

test("S04: bound empty selection preserves its snapshot through all history states", (t) => {
  const m = model(t, { snapshotId: SNAP });
  const a = withSnapshot(A),
    empty = withSnapshot(EMPTY);
  const seen = [];
  m.subscribe((s) => seen.push(clone(s)));
  m.select(a);
  m.select({ ...empty, origin: "props" });
  m.back();
  m.forward();
  assert.deepEqual(seen, [
    a,
    { ...empty, origin: "props" },
    a,
    { ...empty, origin: "props" },
  ]);
  m.back();
  m.back();
  assert.deepEqual(m.current, empty);
  assert.equal(m.snapshotId, SNAP);
});

test("S04: constructor snapshots options before caller mutation", (t) => {
  const options = { snapshotId: SNAP, historyLimit: 1 };
  const m = model(t, options);
  options.snapshotId = OTHER;
  options.historyLimit = 128;
  m.select(withSnapshot(A));
  m.select(withSnapshot(B));
  assert.equal(m.snapshotId, SNAP);
  assert.equal(m.canGoBack, false);
  assert.deepEqual(m.current, withSnapshot(B));
});

test("S04: maximum safe history limit is valid without inventing an allocation budget", (t) => {
  const m = model(t, { historyLimit: MAX });
  m.select(A);
  m.select(B);
  m.back();
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoBack, true);
  assert.equal(m.canGoForward, true);
});

test("S05: initial empty identity echo keeps external origin and no history", (t) => {
  const m = model(t);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  m.select({ items: [], origin: "tree" });
  assert.deepEqual(m.current, EMPTY);
  assert.equal(m.canGoBack, false);
  assert.equal(m.canGoForward, false);
  assert.deepEqual(seen, []);
});

test("S05: same target from another origin is a no-op and retains forward", (t) => {
  const m = model(t);
  m.select(A);
  m.select(B);
  m.back();
  const seen = [];
  m.subscribe((s) => seen.push(clone(s)));
  m.select({ items: [clone(A.items[0]), clone(A.items[0])], origin: "source" });
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoForward, true);
  assert.deepEqual(seen, []);
  m.forward();
  assert.deepEqual(m.current, B);
  m.back();
  m.back();
  assert.deepEqual(m.current, EMPTY);
  assert.equal(m.canGoBack, false);
});

test("S05: a changed target forks history and removes only the old forward branch", (t) => {
  const m = model(t);
  m.select(A);
  m.select(B);
  m.back();
  m.select(C);
  assert.deepEqual(m.current, C);
  assert.equal(m.canGoForward, false);
  m.forward();
  assert.deepEqual(m.current, C);
  m.back();
  assert.deepEqual(m.current, A);
  m.back();
  assert.deepEqual(m.current, EMPTY);
  m.forward();
  m.forward();
  assert.deepEqual(m.current, C);
});

test("S05: ordered multi-selection reordering is a new navigation", (t) => {
  const m = model(t);
  const first = {
    items: [{ ref: "B primary" }, { def: "B secondary" }],
    origin: "tree",
  };
  const second = {
    items: [{ def: "B secondary" }, { ref: "B primary" }],
    origin: "props",
  };
  m.select(first);
  m.select(second);
  m.back();
  assert.deepEqual(m.current, first);
  m.forward();
  assert.deepEqual(m.current, second);
});

test("S05: absent bits and side are distinct from each explicit value", (t) => {
  const m = model(t);
  const states = [
    A,
    {
      items: [{ ref: "B object A", bits: { lsb: 0, width: 0 } }],
      origin: "graph",
    },
    { items: [{ ref: "B object A", side: "inside" }], origin: "source" },
    { items: [{ ref: "B object A", side: "outside" }], origin: "props" },
  ];
  for (const state of states) m.select(state);
  for (const expected of [states[2], states[1], states[0], EMPTY]) {
    m.back();
    assert.deepEqual(m.current, expected);
  }
});

test("S05: limit one accepts navigation but never permits history movement", (t) => {
  const m = model(t, { historyLimit: 1 });
  const seen = [];
  m.subscribe((s) => seen.push(clone(s)));
  for (const state of [A, B, C]) {
    m.select(state);
    assert.equal(m.canGoBack, false);
    assert.equal(m.canGoForward, false);
    m.back();
    m.forward();
    assert.deepEqual(m.current, state);
  }
  assert.deepEqual(seen, [A, B, C]);
});

test("S05: limit two counts the initial empty item then evicts from the oldest end", (t) => {
  const m = model(t, { historyLimit: 2 });
  m.select(A);
  m.back();
  assert.deepEqual(m.current, EMPTY);
  m.forward();
  m.select(B);
  m.back();
  assert.deepEqual(m.current, A);
  m.back();
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoBack, false);
  m.forward();
  assert.deepEqual(m.current, B);
});

test("S05: limit three and a fork at an evicted boundary retain the right records", (t) => {
  const m = model(t, { historyLimit: 3 });
  const d = { items: [{ ref: "B object D" }], origin: "external" };
  m.select(A);
  m.select(B);
  m.select(C);
  m.back();
  m.back();
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoBack, false);
  m.select(d);
  assert.equal(m.canGoForward, false);
  m.back();
  assert.deepEqual(m.current, A);
  m.forward();
  assert.deepEqual(m.current, d);
  m.select(B);
  m.select(C);
  m.back();
  m.back();
  assert.deepEqual(m.current, d);
  assert.equal(m.canGoBack, false);
});

test("S05: default 128 includes current and evicts the initial state after 128 navigations", (t) => {
  const m = model(t);
  const states = Array.from({ length: 128 }, (_, n) => ({
    items: [{ ref: "B capacity " + (n + 1) }],
    origin: n % 2 ? "graph" : "tree",
  }));
  for (const state of states) m.select(state);
  for (let n = 126; n >= 0; --n) {
    m.back();
    assert.deepEqual(m.current, states[n]);
  }
  assert.equal(m.canGoBack, false);
  m.back();
  assert.deepEqual(m.current, states[0]);
  for (let n = 1; n < 128; ++n) {
    m.forward();
    assert.deepEqual(m.current, states[n]);
  }
  assert.equal(m.canGoForward, false);
});

test("S05: repeated boundary operations do not notify or duplicate navigation records", (t) => {
  const m = model(t);
  const seen = [];
  m.subscribe((s) => seen.push(clone(s)));
  m.back();
  m.back();
  m.forward();
  m.forward();
  m.select(A);
  m.forward();
  m.forward();
  m.back();
  m.back();
  m.back();
  m.forward();
  m.forward();
  assert.deepEqual(seen, [A, EMPTY, A]);
  assert.deepEqual(m.current, A);
});

test("S06: caller input and every published level are detached and deeply frozen", (t) => {
  const m = model(t, { snapshotId: SNAP });
  const input = withSnapshot(B);
  input.items = clone(B.items);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  m.select(input);
  const published = m.current;
  deepFrozen(published);
  assert.notEqual(published, input);
  assert.notEqual(published.items, input.items);
  assert.notEqual(published.items[0], input.items[0]);
  assert.notEqual(published.items[0].bits, input.items[0].bits);
  input.items[0].ref = "B mutated";
  input.items[0].bits.width = 99;
  input.items[0].side = "outside";
  input.items.push({ def: "B added" });
  input.origin = "external";
  input.snapshotId = OTHER;
  assert.deepEqual(published, withSnapshot(B));
  assert.deepEqual(seen[0], withSnapshot(B));
  assert.throws(() => {
    published.items.push({ ref: "B forbidden" });
  }, TypeError);
  assert.throws(() => {
    published.items[0].bits.lsb = 99;
  }, TypeError);
  assert.throws(() => {
    published.items[0].ref = "B forbidden";
  }, TypeError);
  assert.throws(() => {
    published.origin = "external";
  }, TypeError);
  m.select(withSnapshot(A));
  m.back();
  assert.deepEqual(m.current, withSnapshot(B));
  m.dispose();
  assert.deepEqual(published, withSnapshot(B));
  deepFrozen(published);
});

test("S06: already frozen input is accepted without mutating caller-owned values", (t) => {
  const m = model(t);
  const input = Object.freeze({
    items: Object.freeze([
      Object.freeze({
        ref: "B frozen",
        bits: Object.freeze({ lsb: 2, width: 4 }),
      }),
    ]),
    origin: "tree",
  });
  m.select(input);
  assert.deepEqual(m.current, input);
  assert.notEqual(m.current, input);
  assert.notEqual(m.current.items, input.items);
});

test("S06: unknown extension fields are not read, traversed, copied or identity keys", (t) => {
  const m = model(t);
  const fail = () => {
    throw new Error("B extension getter must not be read");
  };
  const bits = { lsb: 2, width: 3 };
  const item = { ref: "B object B", bits, side: "inside" };
  const input = { items: [item], origin: "graph" };
  for (const object of [input, input.items, item, bits]) {
    Object.defineProperty(object, "B_extension", {
      enumerable: true,
      get: fail,
    });
    object.B_cycle = object;
  }
  m.select(input);
  assert.deepEqual(m.current, B);
  deepFrozen(m.current);
  const seen = [];
  m.subscribe((s) => seen.push(s));
  m.select({ ...clone(B), origin: "source", B_extension: "different" });
  assert.deepEqual(m.current, B);
  assert.deepEqual(seen, []);
});

test("S06: definition extension metadata is not copied or interpreted as occurrences", (t) => {
  const m = model(t);
  m.select({
    items: [
      {
        def: "B definition C",
        instances: ["B object A", "B object B"],
        label: "B label",
      },
    ],
    origin: "source",
  });
  assert.deepEqual(m.current, C);
});

test("S07: subscribers see committed state synchronously in registration order", (t) => {
  const m = model(t);
  const seen = [];
  for (const label of ["tree", "graph", "source"]) {
    m.subscribe((s) => {
      assert.deepEqual(s, A);
      assert.deepEqual(m.current, A);
      assert.equal(m.canGoBack, true);
      assert.equal(m.canGoForward, false);
      deepFrozen(s);
      seen.push(label);
    });
  }
  m.select(A);
  assert.deepEqual(seen, ["tree", "graph", "source"]);
});

test("S07: duplicate callback registrations and independent idempotent unsubscribe", (t) => {
  const m = model(t);
  const seen = [];
  const callback = (s) => seen.push(clone(s));
  const first = m.subscribe(callback),
    second = m.subscribe(callback);
  m.select(A);
  assert.deepEqual(seen, [A, A]);
  first();
  first();
  m.select(B);
  assert.deepEqual(seen, [A, A, B]);
  second();
  second();
  m.select(C);
  assert.deepEqual(seen, [A, A, B]);
});

test("S07: notification cancellation and addition use a fixed registration set", (t) => {
  const m = model(t);
  const seen = [];
  let cancelSecond;
  let added = false;
  m.subscribe(() => {
    seen.push("first");
    cancelSecond();
    if (!added) {
      added = true;
      m.subscribe(() => seen.push("late"));
    }
  });
  cancelSecond = m.subscribe(() => seen.push("second"));
  m.subscribe(() => seen.push("third"));
  m.select(A);
  assert.deepEqual(seen, ["first", "third"]);
  seen.length = 0;
  m.select(B);
  assert.deepEqual(seen, ["first", "third", "late"]);
});

test("S07: an observer can unsubscribe itself without suppressing its peers", (t) => {
  const m = model(t);
  const seen = [];
  let unsubscribe;
  unsubscribe = m.subscribe(() => {
    seen.push("self");
    unsubscribe();
    unsubscribe();
  });
  m.subscribe(() => seen.push("peer"));
  m.select(A);
  m.select(B);
  assert.deepEqual(seen, ["self", "peer", "peer"]);
});

for (const [name, listener] of [
  ["undefined", undefined],
  ["null", null],
  ["object", {}],
  ["number", 1],
  ["string", "B"],
]) {
  test(`S07: nonfunction ${name} is rejected with TypeError and does not register`, (t) => {
    const m = model(t);
    assert.throws(() => m.subscribe(listener), TypeError);
    const seen = [];
    m.subscribe((s) => seen.push(clone(s)));
    m.select(A);
    assert.deepEqual(seen, [A]);
  });
}

test("S08: observer errors are aggregated in order, peers still run and commit is retained", (t) => {
  const m = model(t);
  const first = new Error("B observer one"),
    second = { B: "observer two" };
  const seen = [];
  const removeFirst = m.subscribe(() => {
    seen.push("first");
    throw first;
  });
  m.subscribe((s) => {
    seen.push("middle");
    assert.deepEqual(s, A);
  });
  const removeSecond = m.subscribe(() => {
    seen.push("second");
    throw second;
  });
  assert.throws(
    () => m.select(A),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [first, second]);
      assert.equal(error.errors[0], first);
      assert.equal(error.errors[1], second);
      return true;
    },
  );
  assert.deepEqual(seen, ["first", "middle", "second"]);
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoBack, true);
  removeFirst();
  removeSecond();
  // The middle listener expects A; unsubscribe it by ending this model after
  // checking current/history flags. A separate test checks back/forward faults.
});

for (const direction of ["back", "forward"]) {
  test(`S08: ${direction} observer failure happens after history movement and is not rolled back`, (t) => {
    const m = model(t);
    m.select(A);
    m.select(B);
    if (direction === "forward") m.back();
    const expected = direction === "back" ? A : B;
    const fault = new Error("B history observer");
    const unsubscribe = m.subscribe((s) => {
      assert.deepEqual(s, expected);
      throw fault;
    });
    assert.throws(
      () => m[direction](),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [fault]);
        return true;
      },
    );
    assert.deepEqual(m.current, expected);
    unsubscribe();
    m[direction === "back" ? "forward" : "back"]();
    assert.deepEqual(m.current, direction === "back" ? B : A);
  });
}

test("S08: observer mutation failure is reported and cannot corrupt peers or history", (t) => {
  const m = model(t);
  let peer = 0;
  m.subscribe((s) => {
    s.items[0].bits.width = 999;
  });
  m.subscribe((s) => {
    ++peer;
    assert.deepEqual(s, B);
  });
  assert.throws(
    () => m.select(B),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 1);
      assert.ok(error.errors[0] instanceof TypeError);
      return true;
    },
  );
  assert.equal(peer, 1);
  assert.deepEqual(m.current, B);
});

test("S08: same identity echoes during notification do not recurse or change origin", (t) => {
  const m = model(t);
  const seen = [];
  m.subscribe((s) => {
    seen.push("tree");
    m.select({ ...clone(s), origin: "source" });
  });
  m.subscribe((s) => {
    seen.push("graph");
    m.select({ items: [...s.items, clone(s.items[0])], origin: "props" });
  });
  m.select(A);
  assert.deepEqual(seen, ["tree", "graph"]);
  assert.deepEqual(m.current, A);
});

test("S08: changing select during notification rejects without nested publication or a new record", (t) => {
  const m = model(t);
  const seen = [];
  const unsubscribe = m.subscribe((s) => {
    assert.deepEqual(s, A);
    assert.throws(() => m.select(B), localError("reentrant_change"));
    seen.push("first");
  });
  const unsubscribePeer = m.subscribe((s) => {
    assert.deepEqual(s, A);
    seen.push("peer");
  });
  m.select(A);
  assert.deepEqual(seen, ["first", "peer"]);
  assert.deepEqual(m.current, A);
  unsubscribe();
  unsubscribePeer();
  m.back();
  assert.deepEqual(m.current, EMPTY);
  assert.equal(m.canGoBack, false);
  m.forward();
  assert.deepEqual(m.current, A);
  assert.equal(m.canGoForward, false);
});

test("S08: movable back and forward reject reentrancy while boundary movement is no-op", (t) => {
  const m = model(t);
  m.select(A);
  m.select(B);
  const unsubscribe = m.subscribe(() => {
    assert.deepEqual(m.current, A);
    assert.throws(() => m.back(), localError("reentrant_change"));
    assert.throws(() => m.forward(), localError("reentrant_change"));
  });
  m.back();
  assert.deepEqual(m.current, A);
  unsubscribe();
  const unsubscribeBoundary = m.subscribe(() => {
    assert.deepEqual(m.current, EMPTY);
    m.back(); // oldest boundary is harmless even during publication
    assert.throws(() => m.forward(), localError("reentrant_change"));
  });
  m.back();
  assert.deepEqual(m.current, EMPTY);
  unsubscribeBoundary();
  m.forward();
  assert.deepEqual(m.current, A);
});

test("S08: limit one back/forward are harmless boundary no-ops during notifications", (t) => {
  const m = model(t, { historyLimit: 1 });
  let called = 0;
  m.subscribe(() => {
    ++called;
    m.back();
    m.forward();
  });
  m.select(A);
  assert.equal(called, 1);
  assert.deepEqual(m.current, A);
});

test("S08: uncaught reentrant error joins AggregateError and does not stop later observers", (t) => {
  const m = model(t);
  const seen = [];
  m.subscribe(() => {
    m.select(B);
  });
  m.subscribe((s) => seen.push(clone(s)));
  assert.throws(
    () => m.select(A),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 1);
      assert.ok(localError("reentrant_change")(error.errors[0]));
      return true;
    },
  );
  assert.deepEqual(seen, [A]);
  assert.deepEqual(m.current, A);
});

for (const bound of [false, true]) {
  test(`S09: ${bound ? "bound" : "unbound"} dispose resets getters without a notification and preserves published values`, (t) => {
    const m = model(t, bound ? { snapshotId: SNAP } : undefined);
    const selected = bound ? withSnapshot(B) : B;
    const empty = bound ? withSnapshot(EMPTY) : EMPTY;
    const seen = [];
    const unsubscribe = m.subscribe((s) => seen.push(clone(s)));
    m.select(selected);
    const old = m.current;
    m.dispose();
    m.dispose();
    unsubscribe();
    unsubscribe();
    assert.equal(m.disposed, true);
    assert.equal(m.snapshotId, bound ? SNAP : undefined);
    assert.equal(m.canGoBack, false);
    assert.equal(m.canGoForward, false);
    assert.deepEqual(m.current, empty);
    deepFrozen(m.current);
    assert.deepEqual(seen, [selected]);
    assert.deepEqual(old, selected);
    deepFrozen(old);
  });
}

test("S09: released checks precede malformed selection and invalid listener errors", (t) => {
  const m = model(t);
  m.dispose();
  for (const operation of [
    () => m.select(A),
    () => m.select(null),
    () => m.select({}),
    () => m.back(),
    () => m.forward(),
    () => m.subscribe(() => {}),
    () => m.subscribe(null),
  ])
    assert.throws(operation, localError("disposed"));
  assert.deepEqual(m.current, EMPTY);
});

test("S09: disposing in an observer stops the rest of the active publication", (t) => {
  const m = model(t, { snapshotId: SNAP });
  const seen = [];
  let old;
  m.subscribe((s) => {
    seen.push("first");
    old = s;
    m.dispose();
  });
  m.subscribe(() => seen.push("must not run"));
  m.select(withSnapshot(A));
  assert.deepEqual(seen, ["first"]);
  assert.equal(m.disposed, true);
  assert.deepEqual(m.current, withSnapshot(EMPTY));
  assert.deepEqual(old, withSnapshot(A));
  deepFrozen(old);
});

test("S09: dispose during notification preserves earlier and disposing-observer exceptions", (t) => {
  const m = model(t);
  const first = new Error("B before dispose"),
    second = new Error("B disposer");
  const seen = [];
  m.subscribe(() => {
    seen.push("first");
    throw first;
  });
  m.subscribe(() => {
    seen.push("dispose");
    m.dispose();
    throw second;
  });
  m.subscribe(() => seen.push("must not run"));
  assert.throws(
    () => m.select(A),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [first, second]);
      return true;
    },
  );
  assert.deepEqual(seen, ["first", "dispose"]);
  assert.deepEqual(m.current, EMPTY);
  assert.equal(m.disposed, true);
});

test("S09: disposal priority holds even inside the disposing observer", (t) => {
  const m = model(t);
  m.subscribe(() => {
    m.dispose();
    assert.throws(() => m.select(A), localError("disposed"));
    assert.throws(() => m.back(), localError("disposed"));
    assert.throws(() => m.subscribe(null), localError("disposed"));
  });
  m.select(A);
  assert.equal(m.disposed, true);
});

test("S10: four headless consumers echo one shared choice and one panel may unsubscribe", (t) => {
  const m = model(t, { snapshotId: SNAP });
  const seen = [];
  const subscriptions = [];
  for (const panel of ["tree", "graph", "source", "props"]) {
    subscriptions.push(
      m.subscribe((s) => {
        seen.push([panel, clone(s)]);
        m.select({ ...clone(s), origin: panel });
      }),
    );
  }
  const a = withSnapshot(A),
    b = withSnapshot(B);
  m.select(a);
  assert.deepEqual(seen, [
    ["tree", a],
    ["graph", a],
    ["source", a],
    ["props", a],
  ]);
  subscriptions[2]();
  seen.length = 0;
  m.select(b);
  assert.deepEqual(seen, [
    ["tree", b],
    ["graph", b],
    ["props", b],
  ]);
  assert.deepEqual(m.current, b);
});

test("S10: definition is not guessed into an occurrence; external empty clears only design navigation", (t) => {
  const m = model(t, { snapshotId: SNAP });
  const definition = withSnapshot(C),
    occurrence = withSnapshot(A);
  m.select(definition);
  assert.deepEqual(m.current, definition);
  m.select(occurrence);
  assert.deepEqual(m.current, occurrence);
  m.select(withSnapshot(EMPTY));
  assert.deepEqual(m.current, withSnapshot(EMPTY));
  m.back();
  assert.deepEqual(m.current, occurrence);
  m.back();
  assert.deepEqual(m.current, definition);
});

test("S10: queued callback to closed model fails and cannot affect its replacement", async (t) => {
  const old = model(t, { snapshotId: SNAP });
  const fresh = model(t, { snapshotId: OTHER });
  old.select(withSnapshot(A));
  const queued = Promise.resolve().then(() => old.select(withSnapshot(B)));
  old.dispose();
  fresh.select(withSnapshot(C, OTHER));
  await assert.rejects(queued, localError("disposed"));
  assert.deepEqual(old.current, withSnapshot(EMPTY));
  assert.deepEqual(fresh.current, withSnapshot(C, OTHER));
  assert.equal(fresh.disposed, false);
});
