import assert from "node:assert/strict";
import {
  using,
  invoke,
  begin,
  second,
  finish,
  success,
  failure,
  local,
  deep,
  span,
  read,
  point,
  hashA,
  hashB,
  tick,
  opaque,
  vm,
} from "./harness.mjs";
import {
  mixedText,
  mixedBoundaries,
  bomText,
  bomBoundaries,
  sourcePoint,
  displayPoint,
} from "./positions.mjs";
export const cases = [];
export function add(id, group, input, expected, run, basis = "DESIGN §6.10") {
  assert.equal(
    cases.some((c) => c.id === id),
    false,
    "unique B id",
  );
  cases.push({ id, group, input, expected, basis, run });
}
for (const [name, text, table] of [
  ["mixed", mixedText, mixedBoundaries],
  ["bom", bomText, bomBoundaries],
]) {
  const ranges = table.slice(1).map((end, i) => [table[i], end]);
  ranges.push([table[0], table.at(-1)]);
  for (let i = 0; i < table.length; i++) ranges.push([table[i], table[i]]);
  for (const [i, [start, end]] of ranges.entries())
    add(
      `SD-P-${name}-${i}`,
      "coordinates",
      { text, start: sourcePoint(start), end: sourcePoint(end) },
      {
        status: "exact",
        range: { start: displayPoint(start), end: displayPoint(end) },
      },
      () =>
        using(async (c) => {
          const t = await second(
            c,
            await begin(c),
            span(sourcePoint(start), sourcePoint(end)),
          );
          await finish(c, t, read(text));
          assert.deepEqual(c.m.state.data.location, {
            status: "exact",
            range: { start: displayPoint(start), end: displayPoint(end) },
          });
          assert.equal(c.m.state.data.content.result.text, text);
          const range = c.m.state.data.location.range;
          // Independent byte slicing checks the hand literal ranges without a projection algorithm.
          assert.equal(
            text.slice(range.start.offset, range.end.offset),
            Buffer.from(text).subarray(start[0], end[0]).toString("utf8"),
          );
        }),
      "§6.10.3 byte/UTF-16/CRLF/half-open literals",
    );
}
add(
  "SD-P-empty",
  "coordinates",
  { text: "", start: point(0), end: point(0) },
  "exact empty EOF (0,1,1), not pending",
  () =>
    using(async (c) => {
      await finish(
        c,
        await second(c, await begin(c), span(point(0), point(0))),
        read(""),
      );
      assert.deepEqual(c.m.state.data.location, {
        status: "exact",
        range: { start: point(0), end: point(0) },
      });
    }),
);
const invalidPoints = [
  ["bmp-byte1", point(4)],
  ["bmp-byte2", point(5)],
  ["emoji-byte1", point(7)],
  ["emoji-byte2", point(8)],
  ["emoji-byte3", point(9)],
  ["combining-interior", point(12)],
  ["crlf-interior", point(14)],
  ["past-eof", point(20, 4, 2)],
  ["wrong-byte-column", point(6, 1, 5)],
  ["wrong-line", point(15, 1, 1)],
  ["wrong-line-column", point(15, 2, 2)],
  ["wrong-eof-column", point(19, 4, 2)],
];
for (const [name, bad] of invalidPoints)
  for (const endpoint of ["start", "end"])
    add(
      `SD-P-invalid-${endpoint}-${name}`,
      "coordinates",
      { text: mixedText, endpoint, bad },
      "SourceDocumentError inconsistent_reply; failed/source; empty frozen data; no repair",
      () =>
        using(async (c) => {
          const a = endpoint === "start" ? bad : point(0),
            b = endpoint === "end" ? bad : point(19, 4, 1);
          const t = await second(c, await begin(c), span(a, b));
          c.wire.ok(t.r, read(mixedText));
          local(await failure(t.o, "inconsistent_reply"), "inconsistent_reply");
          assert.equal(c.m.state.status, "failed");
          assert.equal(c.m.state.error.origin, "source");
          assert.deepEqual(c.m.state.error.data, {});
          assert.equal(Object.hasOwn(c.m.state, "data"), false);
          deep(c.m.state);
        }),
    );
for (const matches of [true, false])
  add(
    `SD-V-reversed-${matches}`,
    "versions",
    { start: point(3), end: point(1), matches },
    "reversed offsets rejected even changed (before text coordinate validation)",
    () =>
      using(async (c) => {
        const t = await second(c, await begin(c), span(point(3), point(1)));
        c.wire.ok(t.r, read("", matches ? hashA : hashB, matches));
        await failure(t.o, "inconsistent_reply");
      }),
  );
for (const [equal, matches] of [
  [true, false],
  [false, true],
])
  add(
    `SD-V-contradiction-${equal}-${matches}`,
    "versions",
    { hashEqual: equal, matchesSnapshot: matches },
    "inconsistent_reply; never guess which Core fact is right",
    () =>
      using(async (c) => {
        const t = await second(c, await begin(c));
        c.wire.ok(t.r, read("abc", equal ? hashA : hashB, matches));
        await failure(t.o, "inconsistent_reply");
      }),
  );
for (const text of ["", "x", "完全不同😀\r\n"])
  add(
    `SD-V-changed-${text.length}`,
    "versions",
    { text, oldStart: point(500, 80, 90), oldEnd: point(900, 100, 70) },
    "success changed without range; do not validate old coordinates against new text",
    () =>
      using(async (c) => {
        const t = await second(
          c,
          await begin(c),
          span(point(500, 80, 90), point(900, 100, 70)),
        );
        await finish(c, t, read(text, hashB, false));
        assert.deepEqual(c.m.state.data.location, { status: "changed" });
        assert.equal(Object.hasOwn(c.m.state.data.location, "range"), false);
        assert.equal(c.m.state.data.source.result.start.offset, 500);
        assert.equal(c.m.state.data.content.result.text, text);
      }),
  );
add(
  "SD-V-do-not-rehash",
  "versions",
  "matching valid hash facts intentionally not hash(text)",
  "exact success; Core facts are authority, not rehashed in L6",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      assert.equal(c.m.state.data.location.status, "exact");
      assert.equal(c.m.state.data.content.result.contentHash, hashA);
    }),
);
for (const text of ["", "\n", "\r", "\r\n"]) {
  const n = Buffer.byteLength(text),
    last = n ? point(n, 2, 1) : point(0);
  add(
    `SD-P-eof-${JSON.stringify(text)}`,
    "coordinates",
    { text, start: last, end: last },
    "EOF empty range after single newline sequence is new empty line",
    () =>
      using(async (c) => {
        await finish(
          c,
          await second(c, await begin(c), span(last, last)),
          read(text),
        );
        assert.deepEqual(c.m.state.data.location, {
          status: "exact",
          range: { start: last, end: last },
        });
      }),
  );
}
// Input validator values follow public Schema: ObjectRef/DefRef are nonempty text, not encoded ids.
const badValues = [
  ["empty", () => ""],
  ["null", () => null],
  ["undefined", () => undefined],
  ["number", () => 1],
  ["boolean", () => false],
  ["array", () => []],
  ["boxed", () => new String("B-ref")],
  ["symbol", () => Symbol("B")],
  ["bigint", () => 1n],
  ["opaque", (counts) => opaque(counts)],
];
for (const field of ["ref", "kind"])
  for (const [name, make] of badValues)
    add(
      `SD-I-${field}-${name}`,
      "input",
      `${field}=${name} during valid first-stage task`,
      "async invalid_argument, zero coercion/probes, old task/state unchanged",
      () =>
        using(async (c) => {
          const t = await begin(c),
            before = c.m.state,
            calls = c.calls.length,
            counts = { probes: 0 },
            bad = make(counts);
          const error = await failure(
            invoke(
              c,
              "load",
              field === "ref" ? bad : "B-ref",
              field === "kind" ? bad : "definition",
            ),
            "invalid_argument",
          );
          local(error, "invalid_argument");
          assert.equal(c.m.state, before);
          assert.equal(c.calls.length, calls);
          assert.equal(counts.probes, 0);
          assert.equal(t.o.done, false);
          await finish(c, t);
        }),
    );
for (const bad of [
  "Definition",
  "unknown",
  " definition ",
  "instantiation\u0000",
])
  add(
    `SD-I-kind-enum-${JSON.stringify(bad)}`,
    "input",
    bad,
    "SourceKind exact enum, preserve idle identity",
    () =>
      using(async (c) => {
        const before = c.m.state;
        await failure(invoke(c, "load", "B", bad), "invalid_argument");
        assert.equal(c.m.state, before);
        assert.equal(c.calls.length, 0);
      }),
  );
add(
  "SD-I-ref-before-kind",
  "input",
  "invalid ref and opaque kind",
  "reject invalid_argument without inspecting/coercing kind",
  () =>
    using(async (c) => {
      const counts = { probes: 0 };
      await failure(invoke(c, "load", "", opaque(counts)), "invalid_argument");
      assert.equal(counts.probes, 0);
    }),
);
for (const [ref, kind] of [
  ["d:opaque", "definition"],
  ["i:does-not-prove-instance", "statement"],
  [" arbitrary ref ", "instantiation"],
])
  add(
    `SD-I-opaque-${kind}`,
    "input",
    { ref, kind },
    "nonempty primitive ref passed unchanged; Core decides applicability, no prefix interpretation/fallback",
    () =>
      using(async (c) => {
        const t = await begin(c, ref, kind);
        c.wire.fail(t.q);
        const e = await failure(t.o, "not_found");
        assert.equal(e, c.calls[0].error);
        assert.equal(c.calls.length, 1);
        assert.equal(c.m.state.error.origin, "core");
      }),
  );
add(
  "SD-I-constructor-ready",
  "ownership",
  "ready real SDK; construction",
  "fixed snapshot/idle, zero SDK queries/index registrations/transport registrations",
  () =>
    using(
      async (c) => {
        const q = c.wire.queries.length,
          reg = [c.wire.messages.size, c.wire.closes.size];
        const m = c.newModel();
        assert.equal(m.snapshotId, c.client.snapshot.snapshotId);
        assert.deepEqual(m.state, { status: "idle", target: null });
        assert.equal(m.disposed, false);
        deep(m.state);
        assert.equal(c.wire.queries.length, q);
        assert.equal(c.registrations, 0);
        assert.deepEqual([c.wire.messages.size, c.wire.closes.size], reg);
      },
      { withModel: false },
    ),
);
add(
  "SD-I-constructor-unready",
  "ownership",
  "unready real SDK snapshot getter",
  "constructor synchronously throws exact getter error, no requests",
  () =>
    using(
      async (c) => {
        let proto = c.client,
          d;
        while (!d && proto) {
          d = Object.getOwnPropertyDescriptor(proto, "snapshot");
          proto = Object.getPrototypeOf(proto);
        }
        let seen;
        Object.defineProperty(c.client, "snapshot", {
          configurable: true,
          get() {
            try {
              return Reflect.apply(d.get, this, []);
            } catch (e) {
              seen = e;
              throw e;
            }
          },
        });
        let caught;
        try {
          c.newModel();
        } catch (e) {
          caught = e;
        }
        assert.ok(caught);
        assert.equal(caught, seen);
        assert.equal(c.wire.queries.length, 0);
        assert.equal(c.registrations, 0);
      },
      { withModel: false, ready: false },
    ),
);
add(
  "SD-Q-sequential-original",
  "query",
  "source/file vs path; delayed second reply; extensions",
  "pending→success only; same task signal; original SDK Replies/completeness retained; data has exactly3 fields",
  () =>
    using(async (c) => {
      const t = await begin(c, "B-definition", "definition");
      assert.equal(c.calls.length, 1);
      assert.equal(c.events.length, 1);
      const u = await second(c, t);
      assert.equal(c.calls.length, 2);
      assert.equal(c.calls[1].args[0], u.span.file);
      assert.notEqual(c.calls[1].args[0], u.span.path);
      assert.ok(c.calls[0].args[2] instanceof AbortSignal);
      assert.equal(c.calls[0].args[2], c.calls[1].args[1]);
      assert.equal(c.events.length, 1);
      await finish(c, u);
      const d = c.m.state.data;
      assert.deepEqual(Object.keys(d).sort(), [
        "content",
        "location",
        "source",
      ]);
      assert.equal(d.source, c.calls[0].reply);
      assert.equal(d.content, c.calls[1].reply);
      assert.equal(d.source.completeness, c.calls[0].reply.completeness);
      assert.deepEqual(d.source.result.B_span_extension, { kept: ["原文", 7] });
      assert.deepEqual(d.content.result.B_read_extension, {
        kept: [false, "尾"],
      });
      assert.equal(Object.hasOwn(d.content.result, "file"), false);
      assert.deepEqual(
        c.events.map((e) => e.status),
        ["pending", "success"],
      );
    }),
);
for (const stage of ["source", "readSource"])
  for (const code of ["not_found", "unsupported", "cancelled", "internal"])
    add(
      `SD-Q-error-${stage}-${code}`,
      "query",
      { stage, code },
      "exact SDK HierError rejected; own frozen diagnostic; cancelled only for SDK cancelled; no fallback",
      () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "readSource") t = await second(c, t);
          c.wire.fail(t.r ?? t.q, code);
          const e = await failure(t.o, code);
          assert.equal(e, c.calls.find((call) => call.method === stage).error);
          assert.equal(
            c.m.state.status,
            code === "cancelled" ? "cancelled" : "failed",
          );
          assert.equal(c.m.state.error.code, code);
          assert.equal(c.m.state.error.origin, "core");
          assert.deepEqual(c.m.state.error.data, e.data);
          assert.notEqual(c.m.state.error.data, e.data);
          assert.equal(Object.hasOwn(c.m.state.error, "dataIssue"), false);
          deep(c.m.state);
          assert.equal(c.calls.length, stage === "source" ? 1 : 2);
        }),
    );
for (const stage of ["source", "readSource"])
  add(
    `SD-Q-partial-${stage}`,
    "query",
    { stage, completeness: { status: "partial", reasons: ["unsupported"] } },
    "SDK rejects protocol_error; never partial success",
    () =>
      using(async (c) => {
        let t = await begin(c);
        if (stage === "readSource") t = await second(c, t);
        c.wire.ok(t.r ?? t.q, stage === "source" ? span() : read(), {
          status: "partial",
          reasons: ["unsupported"],
        });
        const e = await failure(t.o, "protocol_error");
        assert.equal(e, c.calls.find((call) => call.method === stage).error);
        assert.equal(c.m.state.status, "failed");
      }),
  );
add(
  "SD-Q-old-data-stable",
  "query",
  "success then load changed target, clear, dispose",
  "new pending has no stale data/error; held old frozen document remains unchanged",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const old = c.m.state,
        serialized = JSON.stringify(old);
      const t = await begin(c, "B-new", "statement");
      assert.equal(Object.hasOwn(c.m.state, "data"), false);
      await success(invoke(c, "clear"));
      await failure(t.o, "cancelled");
      c.m.dispose();
      assert.equal(JSON.stringify(old), serialized);
      deep(old);
    }),
);
add(
  "SD-Q-idle-read-noop",
  "ownership",
  "state reads, idle reload/cancel/clear, index.ready",
  "same state identity, no query/subscription/notification/automatic refresh",
  () =>
    using(async (c) => {
      const before = c.m.state;
      for (const method of ["reload", "cancel", "clear"])
        await success(invoke(c, method));
      c.wire.emit({ event: "index", state: "ready" });
      await tick();
      assert.equal(c.m.state, before);
      assert.equal(c.calls.length, 0);
      assert.equal(c.events.length, 0);
      assert.equal(c.registrations, 0);
    }),
);
