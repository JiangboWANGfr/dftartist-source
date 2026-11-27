// B's source-derived KAT, executed against real public SDK/Node/Core.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { product, HierClient, vm, capability, deep } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
const { createProcessTransport } = await import(
  pathToFileURL(path.join(product, "web/packages/client/dist/node/index.js"))
    .href
);
const fixture = path.join(import.meta.dirname, "b_object_connections.sv"),
  mode = process.argv[2] ?? "model";
assert.ok(["sdk", "model"].includes(mode));
const full = (r) => {
  assert.deepEqual(r.completeness, { status: "complete", reasons: [] });
  return r.result;
};
const bin = process.env.HIER_BIN;
const sessions = [];
const activeCloses = new Set();
async function real(fn) {
  assert.ok(bin, "B own HIER_BIN required");
  const transport = createProcessTransport({
    command: bin,
    args: ["serve", fixture],
  });
  transport.exited.catch(() => {});
  const client = new HierClient(transport, { cacheEntries: 0 });
  client.ready.catch(() => {});
  let m, settle;
  const indexed = new Promise((r) => {
      settle = r;
    }),
    off = client.onIndexReady(settle);
  const record = { closed: false, indexOff: false };
  sessions.push(record);
  let closing;
  const close = () =>
    (closing ??= Promise.resolve().then(async () => {
      const errors = [];
      for (const release of [
        () => m?.dispose(),
        () => {
          off();
          record.indexOff = true;
        },
        () => client.dispose(),
      ]) {
        try {
          release();
        } catch (e) {
          errors.push(e);
        }
      }
      try {
        record.exit = await transport.exited;
        record.closed = true;
        assert.deepEqual(record.exit, { code: 0, signal: null });
      } catch (e) {
        errors.push(e);
      } finally {
        activeCloses.delete(close);
      }
      if (errors.length) throw new AggregateError(errors, "B Core cleanup");
    }));
  activeCloses.add(close);
  try {
    const snap = await client.ready;
    if (snap.indexState === "ready") settle();
    await indexed;
    if (mode === "model") m = new vm.ObjectConnectionsModel(client);
    const c = {
      client,
      m,
      async ref(name, kind = "port") {
        const refs = full(await client.resolvePath("b_oc_top/" + name));
        // DESIGN 5.5.5: a port and its internal signal are distinct same-name candidates.
        // Select the declared kind via public metadata; never parse opaque refs/order.
        const matches = [];
        for (const ref of refs) {
          if (full(await client.object(ref)).kind === kind) matches.push(ref);
        }
        assert.equal(matches.length, 1, name + ":" + kind);
        return matches[0];
      },
      async query(t) {
        if (m) {
          await m.load(t);
          assert.equal(m.state.status, "success");
          deep(m.state);
          return m.state.data;
        }
        return {
          object: await client.object(t.slice.ref),
          drivers: await client.drivers(t),
          loads: await client.loads(t),
        };
      },
    };
    await fn(c);
    m?.dispose();
    assert.ok(
      full(await client.roots()).some((x) => x.name === "b_oc_top"),
      "model does not close borrowed client",
    );
  } finally {
    await close();
  }
}
export const coreCases = [
  {
    id: "OC-CORE-port",
    input: "own lane.d[2:1] wired to source[5:4]; local vs hier outside",
    expected:
      "queried stays [1,2]; outside context is parent: local own_port and hier top_port both source endpoint [4,2]",
    run: () =>
      real(async (c) => {
        const d = await c.ref("lane/d"),
          source = await c.ref("source"),
          t = {
            slice: { ref: d, bits: { lsb: 1, width: 2 } },
            reach: "local",
            side: "outside",
          };
        const a = await c.query(t),
          b = await c.query({ ...t, reach: "hier" });
        assert.equal(a.object.result.ref, d);
        const own = full(a.drivers),
          top = full(b.drivers);
        assert.equal(own.length, 1);
        assert.equal(own[0].kind, "own_port");
        assert.equal(own[0].ref, source);
        assert.deepEqual(own[0].queried, { lsb: 1, width: 2 });
        assert.deepEqual(own[0].bits, { lsb: 4, width: 2 });
        assert.equal(top.length, 1);
        assert.equal(top[0].kind, "top_port");
        assert.equal(top[0].ref, source);
        assert.deepEqual(top[0].queried, { lsb: 1, width: 2 });
        assert.deepEqual(top[0].bits, { lsb: 4, width: 2 });
        // Outside begins in the parent body (DESIGN 4.3/5.5.2). The contract does
        // not define whether the initial pin-to-parent mapping is itself a via
        // route, so do not invent a nonempty-route oracle for this query.
        // Exact original via retention is tested in OC-atomic; actual traversed
        // child-body routes are checked by OC-CORE-signal below.
      }),
  },
  {
    id: "OC-CORE-signal",
    input: "routed[3:2] driven by lane.q; signal has no side",
    expected:
      "local module_pin, hier process with distinct process ref and signal at, original endpoint coordinates",
    run: () =>
      real(async (c) => {
        const ref = await c.ref("routed", "signal"),
          pin = await c.ref("lane/q"),
          t = { slice: { ref, bits: { lsb: 2, width: 2 } }, reach: "local" },
          a = await c.query(t),
          b = await c.query({ ...t, reach: "hier" });
        assert.equal(a.object.result.kind, "signal");
        const local = full(a.drivers),
          hier = full(b.drivers);
        assert.equal(local.length, 1);
        assert.equal(local[0].kind, "module_pin");
        assert.equal(local[0].ref, pin);
        assert.equal(hier.length, 1);
        const p = hier[0];
        assert.equal(p.kind, "process");
        assert.equal(full(await c.client.object(p.ref)).kind, "process");
        assert.notEqual(p.ref, p.at.ref);
        assert.deepEqual(p.bits, p.at.bits);
        assert.deepEqual(p.queried, { lsb: 2, width: 2 });
        assert.ok(p.via.length > 0);
      }),
  },
  {
    id: "OC-CORE-constant",
    input: "sink.c outside const 4'b01zx, slice [2:1]; unconnected spare",
    expected: "exact four-state const 2'b1z; explicit unconnected endpoint",
    run: () =>
      real(async (c) => {
        const ref = await c.ref("sink/c"),
          a = await c.query({
            slice: { ref, bits: { lsb: 1, width: 2 } },
            reach: "hier",
            side: "outside",
          }),
          d = full(a.drivers);
        assert.equal(d.length, 1);
        assert.equal(d[0].kind, "const");
        assert.equal(d[0].value, "2'b1z");
        assert.deepEqual(d[0].queried, { lsb: 1, width: 2 });
        assert.equal("bits" in d[0], false);
        const spare = await c.ref("sink/spare"),
          b = await c.query({
            slice: { ref: spare },
            reach: "hier",
            side: "outside",
          });
        assert.equal(full(b.drivers)[0].kind, "unconnected");
      }),
  },
  {
    id: "OC-CORE-partial",
    input: "sink interface port versus unused ordinary input loads",
    expected:
      "interface empty partial reason retained; ordinary empty complete different; success is not complete",
    run: () =>
      real(async (c) => {
        const bus = await c.ref("sink/bus"),
          a = await c.query({
            slice: { ref: bus },
            reach: "hier",
            side: "inside",
          });
        for (const r of [a.drivers, a.loads]) {
          assert.equal(r.completeness.status, "partial");
          assert.ok(
            r.completeness.reasons.some((x) => x.code === "interface_port"),
          );
          assert.deepEqual(r.result, []);
        }
        const spare = await c.ref("sink/spare"),
          b = await c.query({
            slice: { ref: spare },
            reach: "local",
            side: "inside",
          });
        assert.deepEqual(full(b.loads), []);
      }),
  },
  {
    id: "OC-CORE-domain",
    input:
      "missing port side; top outside; signal side; out-of-range bits; instance ref",
    expected:
      "Core bad_request preserved; subsequent valid query and own session cleanup",
    run: () =>
      real(async (c) => {
        const port = await c.ref("lane/d"),
          top = await c.ref("source"),
          signal = await c.ref("routed", "signal"),
          inst = await c.ref("lane", "instance");
        const bad = [
          { slice: { ref: port }, reach: "hier" },
          { slice: { ref: top }, reach: "hier", side: "outside" },
          { slice: { ref: signal }, reach: "local", side: "inside" },
          {
            slice: { ref: port, bits: { lsb: 4, width: 2 } },
            reach: "local",
            side: "inside",
          },
          { slice: { ref: inst }, reach: "local" },
        ];
        for (const t of bad) {
          if (c.m) {
            await assert.rejects(c.m.load(t), {
              code: "bad_request",
              origin: "core",
            });
            assert.equal(c.m.state.status, "failed");
            assert.equal(c.m.state.error.code, "bad_request");
            assert.equal(c.m.state.error.origin, "core");
          } else
            for (const method of ["drivers", "loads"])
              await assert.rejects(c.client[method](t), {
                code: "bad_request",
                origin: "core",
              });
        }
        const ok = await c.query({
          slice: { ref: port },
          reach: "hier",
          side: "outside",
        });
        assert.equal(full(ok.drivers)[0].kind, "top_port");
      }),
  },
].map((c) => ({
  ...c,
  basis:
    "DESIGN 6.20.2–5; own b_object_connections.sv; DESIGN 5.5 connection endpoint semantics",
}));
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      { count: coreCases.length, cases: coreCases.map(({ run, ...c }) => c) },
      null,
      2,
    ),
  );
else {
  const sha = (file) =>
      createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    r = {
      mode,
      product,
      fixture,
      fixtureSHA256: sha(fixture),
      binary: bin,
      binarySHA256: bin ? sha(bin) : null,
      plannedCases: coreCases.length,
      executedCases: 0,
      blockedCases: coreCases.length,
      skippedCases: 0,
      results: [],
      sessions,
    };
  try {
    if (mode === "model") capability();
    for (const c of coreCases) {
      let timer,
        timedOut = false;
      const work = Promise.resolve().then(() => c.run());
      try {
        await Promise.race([
          work,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(Error("B Core watchdog " + c.id));
            }, 20000);
          }),
        ]);
        r.results.push({ id: c.id, pass: true });
      } catch (e) {
        r.results.push({ id: c.id, pass: false, error: describeFailure(e) });
      } finally {
        clearTimeout(timer);
        const cleanup = await Promise.allSettled(
          [...activeCloses].map((close) => close()),
        );
        for (const done of cleanup)
          if (done.status === "rejected")
            r.results.push({
              id: c.id + "-cleanup",
              pass: false,
              error: describeFailure(done.reason),
            });
      }
      r.executedCases++;
      r.blockedCases--;
      if (timedOut) {
        let drainTimer;
        try {
          r.watchdogCaseSettled = await Promise.race([
            work.then(
              () => true,
              () => true,
            ),
            new Promise((resolve) => {
              drainTimer = setTimeout(() => resolve(false), 1000);
            }),
          ]);
        } finally {
          clearTimeout(drainTimer);
        }
        throw Error(
          "B Core runner stops after watchdog; remaining cases blocked",
        );
      }
    }
    assert.equal(r.results.filter((x) => !x.pass).length, 0);
    r.exitCode = 0;
  } catch (e) {
    r.exitCode = 1;
    r.error = describeFailure(e);
  }
  process.exitCode = r.exitCode;
  const output = JSON.stringify(r, null, 2);
  if (r.watchdogCaseSettled === false)
    process.stdout.write(output + "\n", () => process.exit(1));
  else console.log(output);
}
