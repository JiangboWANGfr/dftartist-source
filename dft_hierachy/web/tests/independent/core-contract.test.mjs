// B-only DESIGN5.2/5.5/5.6 public SDK->owned Node->real Core oracles.
// Literal names/counts/maps come from sdk_core.sv, never from A integration tests.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
const fixture = fileURLToPath(
  new URL("../../../core/tests/fixtures/m4/sdk_core.sv", import.meta.url),
);
const source = await readFile(fixture, "utf8");
const digest = (text) => createHash("sha256").update(text).digest("hex");
const complete = (reply) => {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
};
const bounds = { timeout: 10000 }; // Harness guard, not cancellation/latency SLA.
const names = (items) => items.map((x) => x.name);
const allSignals = [
  "clk",
  "rst_n",
  "d",
  "y",
  "q",
  "mid",
  "alpha",
  "Alpha",
  "alpha_tail",
];
const seen = new Set();
const scopedError = (code) => (error) => {
  assert.ok(error instanceof HierError);
  assert.equal(error.origin, "core");
  assert.equal(error.code, code);
  assert.ok(error.message.length);
  assert.ok(error.data && typeof error.data === "object");
  return true;
};
async function session(path = fixture, extra = []) {
  assert.ok(process.env.HIER_BIN, "HIER_BIN must be this verifier's real Core");
  const raw = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", ...extra, path],
  });
  raw.exited.catch(() => {});
  const transport = {
    send: (value) => {
      if (value.method !== "cancel") seen.add(value.method);
      raw.send(value);
    },
    onMessage: (handler) => raw.onMessage(handler),
    onClose: (handler) => raw.onClose(handler),
    close: () => raw.close(),
  };
  let client;
  try {
    client = new HierClient(transport);
  } catch (error) {
    raw.close();
    await raw.exited.catch(() => {});
    throw error;
  }
  let readyIndex = false,
    resolveIndex;
  const index = new Promise((resolve) => (resolveIndex = resolve));
  const off = client.onIndexReady(() => {
    readyIndex = true;
    resolveIndex();
  });
  try {
    const snapshot = await client.ready;
    if (snapshot.indexState === "ready") {
      readyIndex = true;
      resolveIndex();
    }
    return {
      client,
      snapshot,
      raw,
      async indexed(query) {
        let reply = await query();
        if (reply.completeness.status === "partial") {
          assert.deepEqual(
            reply.completeness.reasons.map((x) => x.code),
            ["indexing"],
          );
          if (!readyIndex) await index;
          reply = await query();
        }
        return complete(reply);
      },
      async close() {
        off();
        client.dispose();
        const exit = await raw.exited;
        assert.equal(exit.code, 0);
        assert.equal(exit.signal, null);
      },
    };
  } catch (error) {
    off();
    client.dispose();
    await raw.exited.catch(() => {});
    throw error;
  }
}
let ctx, root, child, defLeaf, signals, processFF;
before(async () => {
  ctx = await session();
  const roots = complete(await ctx.client.roots());
  assert.deepEqual(names(roots), ["b_m4_top"]);
  root = roots[0];
  const kids = complete(await ctx.client.children(root.ref)).items;
  assert.deepEqual(names(kids), ["u", "v"]);
  child = kids[0];
  const ss = complete(await ctx.client.signals(root.ref)).items;
  assert.deepEqual(names(ss), allSignals);
  signals = Object.fromEntries(ss.map((x) => [x.name, x.ref]));
  const defs = complete(await ctx.client.definitions()).items;
  assert.deepEqual(names(defs), ["b_m4_leaf", "b_m4_top"]);
  defLeaf = defs[0];
  const ps = complete(await ctx.client.procs(root.ref)).items;
  assert.equal(ps.length, 5);
  assert.equal(ps.filter((x) => x.kind === "assign").length, 4);
  assert.equal(ps.filter((x) => x.kind === "always_ff").length, 1);
  processFF = ps.find((x) => x.kind === "always_ff");
}, bounds);
after(async () => {
  if (ctx) await ctx.close();
});
const c = () => ctx.client;
const slice = (name) => ({ ref: signals[name], bits: { lsb: 0, width: 4 } });
const point = (name) => ({ slice: slice(name) });
const cases = [
  [
    "design.info",
    async () => {
      const s = complete(await c().info());
      assert.equal(s.schemaVersion, 7);
      assert.equal(s.snapshotId, ctx.snapshot.snapshotId);
      assert.equal(s.inputHash, ctx.snapshot.inputHash);
      assert.equal(s.openedAt, ctx.snapshot.openedAt);
      assert.deepEqual(names(s.tops), ["b_m4_top"]);
      assert.deepEqual(s.topCandidates, [root.ref]);
    },
  ],
  [
    "design.diagnostics",
    async () => {
      const d = complete(await c().diagnostics({ maxItems: 0 }));
      assert.equal(d.errorCount, 0);
      assert.deepEqual(d.items, []);
      assert.equal(d.truncated, d.warningCount > 0);
    },
  ],
  [
    "design.checkInputs",
    async () =>
      assert.deepEqual(complete(await c().checkInputs()), {
        changed: [],
        complete: true,
      }),
  ],
  [
    "inst.roots",
    async () => {
      const r = complete(await c().roots());
      assert.deepEqual(names(r), ["b_m4_top"]);
      assert.equal(r[0].childCount, 2);
    },
  ],
  [
    "inst.children",
    async () => {
      const p = complete(await c().children(root.ref, { limit: 1 }));
      assert.deepEqual(names(p.items), ["u"]);
      assert.ok(p.next);
      const last = complete(
        await c().children(root.ref, { cursor: p.next, limit: 7 }),
      );
      assert.deepEqual(names(last.items), ["v"]);
      assert.ok(!Object.hasOwn(last, "next"));
    },
  ],
  [
    "inst.ancestors",
    async () =>
      assert.deepEqual(
        complete(await c().ancestors(child.ref)).map((x) => x.ref),
        [root.ref],
      ),
  ],
  [
    "inst.get",
    async () => {
      const x = complete(await c().instance(child.ref));
      assert.deepEqual(x.path, ["b_m4_top", "u"]);
      assert.equal(x.defName, "b_m4_leaf");
      assert.equal(x.hasParamOverrides, true);
    },
  ],
  [
    "inst.ports",
    async () => {
      const ps = complete(await c().ports(root.ref));
      assert.deepEqual(names(ps), ["clk", "rst_n", "d", "y", "q"]);
      assert.deepEqual(
        ps.map((x) => x.direction),
        ["in", "in", "in", "out", "out"],
      );
      assert.deepEqual(
        ps.map((x) => x.width),
        [1, 1, 4, 4, 4],
      );
    },
  ],
  [
    "inst.params",
    async () => {
      const ps = complete(await c().params(child.ref));
      assert.equal(ps.length, 1);
      assert.equal(ps[0].name, "W");
      assert.equal(ps[0].value, "4");
      assert.equal(ps[0].isOverridden, true);
    },
  ],
  [
    "inst.signals",
    async () => {
      const p = complete(
        await c().signals(root.ref, { filter: { text: "alpha" } }),
      );
      assert.deepEqual(names(p.items), ["alpha", "alpha_tail"]);
    },
  ],
  [
    "def.list",
    async () =>
      assert.deepEqual(names(complete(await c().definitions()).items), [
        "b_m4_leaf",
        "b_m4_top",
      ]),
  ],
  [
    "def.instances",
    async () => {
      const p = await ctx.indexed(() => c().instancesOf(defLeaf.ref));
      assert.deepEqual(names(p.items), ["u", "v"]);
    },
  ],
  [
    "search",
    async () => {
      const p = await ctx.indexed(() =>
        c().search({ text: "alpha", kinds: ["signal"], scope: root.ref }),
      );
      assert.deepEqual(names(p.items), ["alpha", "alpha_tail"]);
    },
  ],
  [
    "path.resolve",
    async () =>
      assert.deepEqual(complete(await c().resolvePath("b_m4_top/u")), [
        child.ref,
      ]),
  ],
  [
    "conn.bindings",
    async () => {
      const p = complete(await c().bindings(root.ref));
      assert.equal(p.inst, root.ref);
      assert.equal(p.bindings.length, 4);
      const bs = p.bindings.filter((x) => x.inst === child.ref);
      assert.deepEqual(
        bs.map((x) => x.port),
        ["a", "y"],
      );
      assert.deepEqual(
        bs.map((x) => x.direction),
        ["in", "out"],
      );
      assert.ok(bs.every((x) => x.width === 4));
    },
  ],
  [
    "conn.drivers",
    async () => {
      const es = complete(
        await c().drivers({ slice: slice("alpha"), reach: "local" }),
      );
      assert.equal(es.length, 1);
      assert.equal(es[0].kind, "process");
      assert.deepEqual(es[0].at, slice("alpha"));
      assert.deepEqual(es[0].queried, { lsb: 0, width: 4 });
    },
  ],
  [
    "conn.loads",
    async () => {
      const es = complete(
        await c().loads({ slice: slice("alpha"), reach: "local" }),
      );
      assert.equal(es.length, 1);
      assert.equal(es[0].kind, "process");
      assert.deepEqual(es[0].at, slice("alpha"));
    },
  ],
  [
    "conn.step",
    async () => {
      const s = complete(
        await c().step({ from: slice("Alpha"), direction: "back" }),
      );
      assert.equal(s.hops.length, 1);
      assert.equal(s.hops[0].kind, "process");
      assert.deepEqual(s.hops[0].from, slice("Alpha"));
      assert.ok(
        s.hops[0].next.some(
          (x) => x.slice.ref === signals.alpha && x.role === "data",
        ),
      );
      assert.equal(s.hasConservative, false);
    },
  ],
  [
    "trace.cone",
    async () => {
      const g = complete(
        await c().cone({
          start: point("Alpha"),
          direction: "back",
          policy: "combinational",
        }),
      );
      assert.ok(g.nodes.some((x) => x.point?.slice.ref === signals.Alpha));
      assert.ok(g.nodes.some((x) => x.point?.slice.ref === signals.alpha));
      assert.ok(g.edges.length >= 2);
      assert.equal(g.hasConservative, false);
    },
  ],
  [
    "trace.paths",
    async () => {
      const g = complete(
        await c().paths({ from: point("alpha"), to: point("Alpha") }),
      );
      assert.ok(g.nodes.some((x) => x.point?.slice.ref === signals.alpha));
      assert.ok(g.nodes.some((x) => x.point?.slice.ref === signals.Alpha));
      assert.ok(g.edges.length >= 1);
      assert.equal(g.hasConservative, false);
    },
  ],
  [
    "seq.registers",
    async () => {
      const p = await ctx.indexed(() => c().registers(root.ref));
      assert.equal(p.items.length, 1);
      const r = p.items[0];
      assert.equal(r.signal, signals.q);
      assert.deepEqual(r.bits, { lsb: 0, width: 4 });
      assert.equal(r.clock.signal, signals.clk);
      assert.equal(r.clock.edge, "posedge");
      assert.ok(!Object.hasOwn(r.clock, "type"));
      assert.equal(r.async.length, 1);
      assert.equal(r.async[0].signal, signals.rst_n);
      assert.equal(r.async[0].edge, "negedge");
      assert.ok(Object.hasOwn(r.async[0], "type"));
    },
  ],
  [
    "proc.list",
    async () => {
      const p = complete(await c().procs(root.ref));
      assert.equal(p.items.length, 5);
      assert.equal(p.items.filter((x) => x.kind === "assign").length, 4);
    },
  ],
  [
    "proc.get",
    async () => {
      const p = complete(await c().proc(processFF.ref));
      assert.equal(p.kind, "always_ff");
      assert.equal(p.inst, root.ref);
      assert.equal(p.writes.length, 1);
      assert.deepEqual(p.writes[0].target, slice("q"));
      assert.ok(
        p.writes[0].deps.some(
          (x) => x.signal === signals.d && x.role === "data",
        ),
      );
    },
  ],
  [
    "obj.get",
    async () => {
      const o = complete(await c().object(signals.alpha));
      assert.equal(o.kind, "signal");
      assert.equal(o.name, "alpha");
      assert.equal(o.inst, root.ref);
      assert.equal(o.ref, signals.alpha);
    },
  ],
  [
    "obj.source",
    async () => {
      const s = complete(await c().source(root.ref, "definition"));
      const start = Buffer.byteLength(
        source.slice(0, source.indexOf("module b_m4_top")),
      );
      const end = Buffer.byteLength(
        source.slice(0, source.lastIndexOf("endmodule") + 9),
      );
      assert.equal(s.start.offset, start);
      assert.equal(s.end.offset, end);
      assert.equal(s.contentHash, digest(source));
    },
  ],
  [
    "source.resolve",
    async () => {
      const span = complete(await c().source(root.ref, "definition"));
      const p = await ctx.indexed(() =>
        c().resolveSource({
          file: span.file,
          line: span.start.line,
          col: span.start.column,
        }),
      );
      assert.ok(
        p.items.some((x) => x.ref === root.ref && x.kind === "definition"),
      );
      assert.ok(
        p.items.some((x) => x.ref === root.def && x.kind === "definition"),
      );
    },
  ],
  [
    "source.read",
    async () => {
      const s = complete(await c().source(root.ref, "definition"));
      const read = complete(await c().readSource(s.file));
      assert.equal(read.text, source);
      assert.equal(read.contentHash, digest(source));
      assert.equal(read.matchesSnapshot, true);
    },
  ],
];
for (const [method, run] of cases) test("B Core27: " + method, bounds, run);
test("B Core27: every public method made a real wire request", bounds, () =>
  assert.deepEqual([...seen].sort(), cases.map((x) => x[0]).sort()),
);
test(
  "B Core signals: literal case-sensitive pages and cursor query binding",
  bounds,
  async () => {
    const first = complete(
      await c().signals(root.ref, { filter: { text: "alpha" }, limit: 1 }),
    );
    assert.deepEqual(names(first.items), ["alpha"]);
    assert.ok(first.next);
    const last = complete(
      await c().signals(root.ref, {
        filter: { text: "alpha" },
        cursor: first.next,
        limit: 9,
      }),
    );
    assert.deepEqual(names(last.items), ["alpha_tail"]);
    assert.ok(!Object.hasOwn(last, "next"));
    await assert.rejects(
      c().signals(root.ref, { filter: { text: "Alpha" }, cursor: first.next }),
      scopedError("bad_request"),
    );
    assert.deepEqual(
      names(
        complete(await c().signals(root.ref, { filter: { text: "Alpha" } }))
          .items,
      ),
      ["Alpha"],
    );
    assert.deepEqual(
      complete(await c().signals(root.ref, { filter: { text: "alpha.*" } }))
        .items,
      [],
    );
  },
);
test(
  "B Core signals: missing/empty/default filter preserve original declaration order",
  bounds,
  async () => {
    for (const options of [{}, { filter: {} }, { filter: { text: "" } }])
      assert.deepEqual(
        names(complete(await c().signals(root.ref, options)).items),
        allSignals,
      );
  },
);
test(
  "B Core: errors preserve origin/code/data and do not poison later success",
  bounds,
  async () => {
    await assert.rejects(c().instance("i:999"), scopedError("not_found"));
    await assert.rejects(c().instance("i:0..1"), scopedError("bad_request"));
    assert.deepEqual(names(complete(await c().roots())), ["b_m4_top"]);
  },
);
test(
  "B Core metadata: same captured input across sharing modes, unique session identity and UTC date",
  bounds,
  async () => {
    const one = await session();
    let per;
    try {
      per = await session(fixture, ["--per-instance-bodies"]);
      assert.notEqual(one.snapshot.snapshotId, ctx.snapshot.snapshotId);
      assert.notEqual(per.snapshot.snapshotId, one.snapshot.snapshotId);
      assert.equal(one.snapshot.inputHash, ctx.snapshot.inputHash);
      assert.equal(per.snapshot.inputHash, one.snapshot.inputHash);
      for (const s of [one.snapshot, per.snapshot]) {
        assert.match(s.inputHash, /^[0-9a-f]{64}$/);
        assert.equal(s.inputHashComplete, true);
        assert.match(s.openedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        assert.equal(new Date(s.openedAt).toISOString(), s.openedAt);
      }
      assert.equal(one.snapshot.bodySharing, "fast");
      assert.equal(per.snapshot.bodySharing, "per-instance");
    } finally {
      await one.close();
      if (per) await per.close();
    }
  },
);
test(
  "B Core metadata: explicit tops are not auto candidates",
  bounds,
  async () => {
    const explicit = await session(fixture, ["--top", "b_m4_top"]);
    try {
      assert.deepEqual(names(explicit.snapshot.tops), ["b_m4_top"]);
      assert.deepEqual(explicit.snapshot.topCandidates, []);
    } finally {
      await explicit.close();
    }
  },
);
test(
  "B Core metadata: disk change cannot rewrite captured hash/source; new snapshot captures new input",
  bounds,
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "hier-b-sdk-core-"));
    const path = join(folder, "input.sv");
    let old, fresh;
    try {
      await writeFile(path, source);
      old = await session(path);
      const span = complete(
        await old.client.source(old.snapshot.tops[0].ref, "definition"),
      );
      const beforeHash = old.snapshot.inputHash;
      const changed = source + "// B independent post-open mutation\n";
      await writeFile(path, changed);
      const read = complete(await old.client.readSource(span.file));
      assert.equal(read.text, changed);
      assert.equal(read.contentHash, digest(changed));
      assert.equal(read.matchesSnapshot, false);
      assert.deepEqual(complete(await old.client.checkInputs()), {
        changed: [span.file],
        complete: true,
      });
      assert.equal(complete(await old.client.info()).inputHash, beforeHash);
      assert.equal(
        complete(
          await old.client.source(old.snapshot.tops[0].ref, "definition"),
        ).contentHash,
        digest(source),
      );
      fresh = await session(path);
      assert.notEqual(fresh.snapshot.inputHash, beforeHash);
    } finally {
      if (old) await old.close();
      if (fresh) await fresh.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
