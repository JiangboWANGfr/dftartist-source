// Agent B independent DESIGN 6.9; no product implementation/prototype oracle.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { snapshotProbe } from "./harness.mjs";
import {
  context,
  using,
  invoke,
  success,
  failure,
  begin,
  second,
  finish,
  info,
  ports,
  params,
  tick,
  deep,
  local,
  vm,
  HierError,
  closeWith,
  opaque,
} from "./harness.mjs";
export const cases = [];
export const add = (
  id,
  group,
  input,
  expected,
  run,
  basis = "DESIGN 6.9.1-5; 6.6.6",
) => cases.push({ id, group, input, expected, basis, run });
add(
  "IP-C01",
  "construct",
  "ready real SDK; no model work yet",
  "idle/null, fixed snapshot, zero SDK methods/new subscriptions or notifications",
  () =>
    using(
      async (c) => {
        // The ready SDK owns existing subscriptions; its order is not a model contract.
        const before = {
          registrations: [...c.wire.registrations],
          messages: [...c.wire.messages],
          closes: [...c.wire.closes],
          queries: c.wire.queries.length,
        };
        c.m = c.newModel();
        c.m.subscribe(() => c.events.push(c.m.state));
        assert.deepEqual(c.m.state, { status: "idle", target: null });
        deep(c.m.state);
        assert.equal(c.m.snapshotId, c.snap.snapshotId);
        assert.equal(c.m.disposed, false);
        assert.equal(c.calls.length, 0);
        assert.equal(c.events.length, 0);
        assert.equal(c.indexRegistrations, 0);
        assert.equal(c.wire.queries.length, before.queries);
        assert.deepEqual(c.wire.registrations, before.registrations);
        assert.equal(c.wire.messages.size, before.messages.length);
        assert.equal(c.wire.closes.size, before.closes.length);
        for (const token of before.messages)
          assert.ok(c.wire.messages.has(token), "SDK message owner unchanged");
        for (const token of before.closes)
          assert.ok(c.wire.closes.has(token), "SDK close owner unchanged");
      },
      { withModel: false },
    ),
);
add(
  "IP-C02",
  "construct",
  "SDK not ready",
  "constructor throws original snapshot error; no query or half-published model",
  () =>
    using(
      async (c) => {
        const probe = snapshotProbe(c.client);
        try {
          assert.throws(
            () => c.newModel(),
            (error) => {
              assert.equal(probe.errors.length, 1);
              return Object.is(error, probe.errors[0]);
            },
          );
          assert.equal(c.calls.length, 0);
        } finally {
          probe.restore();
        }
      },
      { withModel: false, ready: false },
    ),
);
add(
  "IP-C03",
  "construct",
  "SDK disposed after ready",
  "model keeps fixed snapshot; load rejects SDK failure, no private-state guessing",
  () =>
    using(
      async (c) => {
        c.client.dispose();
        const m = c.newModel();
        c.m = m;
        const e = await failure(invoke(c, "load", "B-ip-A"));
        assert.ok(e instanceof HierError);
        assert.equal(c.m.state.status, "failed");
        assert.equal(c.m.snapshotId, c.snap.snapshotId);
      },
      { withModel: false },
    ),
);
const badInputs = [
  "undefined",
  "null",
  "zero",
  "false",
  "empty",
  "object",
  "array",
  "boxed",
  "bigint",
  "symbol",
  "function",
  "proxy",
];
function bad(kind, counts) {
  if (kind === "array") return [];
  if (kind === "boxed") return new String("B-ip-A");
  if (kind === "bigint") return 1n;
  if (kind === "symbol") return Symbol("B ref");
  if (kind === "function") return () => {};
  return opaque(kind, counts);
}
for (const kind of badInputs)
  add(
    "IP-I-" + kind,
    "input",
    `${kind} while valid task pending`,
    "invalid_argument Promise; no coerce/read, no task cancellation/state/SDK change",
    () =>
      using(async (c) => {
        const task = await begin(c),
          before = c.m.state,
          n = c.calls.length,
          counts = { probes: 0 };
        local(
          await failure(invoke(c, "load", bad(kind, counts))),
          "invalid_argument",
        );
        assert.equal(c.m.state, before);
        assert.equal(c.calls.length, n);
        assert.equal(c.wire.cancels.length, 0);
        assert.equal(counts.probes, 0);
        await finish(c, task);
      }),
  );
for (const ref of [" ", "d:definition", "opaque/点.0"])
  add(
    "IP-I-text-" + encodeURIComponent(ref),
    "input",
    `nonempty opaque ref ${JSON.stringify(ref)}`,
    "do not parse ref; inst.get decides existence; retain Core not_found identity",
    () =>
      using(async (c) => {
        const t = await begin(c, ref);
        c.wire.fail(t.q);
        const e = await failure(t.o, "not_found", "core");
        assert.equal(e, c.calls[0].error);
        assert.equal(c.m.state.status, "failed");
        assert.equal(c.calls.length, 1);
      }),
  );
for (const order of ["ports", "params"])
  add(
    "IP-D-order-" + order,
    "data",
    `get then both secondaries; ${order} first`,
    "SDK order/same signal; pending identity until third reply; original Reply identities, full fields/extensions/frozen values",
    () =>
      using(async (c) => {
        const t = await second(c, await begin(c));
        assert.deepEqual(
          c.calls.map((x) => x.method),
          ["instance", "ports", "params"],
        );
        assert.ok(c.calls[0].args[1] instanceof AbortSignal);
        assert.equal(c.calls[0].args[1], c.calls[1].args[1]);
        assert.equal(c.calls[1].args[1], c.calls[2].args[1]);
        await finish(c, t, { order });
        assert.deepEqual(
          c.events.map((s) => s.status),
          ["pending", "success"],
        );
        for (const [name, method] of [
          ["instance", "instance"],
          ["ports", "ports"],
          ["params", "params"],
        ])
          assert.equal(
            c.m.state.data[name],
            c.calls.find((x) => x.method === method).reply,
          );
        assert.deepEqual(c.m.state.data.ports.result, ports());
        assert.deepEqual(c.m.state.data.params.result, params());
        deep(c.m.state);
      }),
  );
add(
  "IP-D-empty",
  "data",
  "empty ports/params; normal instance",
  "success with original empty arrays, not pending/failed",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), { portValues: [], paramValues: [] });
      assert.deepEqual(c.m.state.data.ports.result, []);
      assert.deepEqual(c.m.state.data.params.result, []);
    }),
);
add(
  "IP-D-width-zero",
  "data",
  "normal scalar-shaped port with width=0; interface no width",
  "preserve zero and absence, never fill width=1; same names remain separate",
  () =>
    using(async (c) => {
      await finish(c, await begin(c), { portValues: ports(0) });
      const p = c.m.state.data.ports.result;
      assert.equal(p[0].width, 0);
      assert.equal(p[1].name, p[0].name);
      assert.notEqual(p[0].ref, p[1].ref);
      assert.equal(Object.hasOwn(p[2], "width"), false);
      assert.equal(p[3].kind, "multi");
    }),
);
add(
  "IP-D-inconsistent",
  "data",
  "inst.get ref differs from target",
  "inconsistent_reply before ports/params; failed diagnostic origin properties",
  () =>
    using(async (c) => {
      const t = await begin(c);
      c.wire.ok(t.q, info("B-wrong"));
      local(await failure(t.o), "inconsistent_reply");
      assert.equal(c.calls.length, 1);
      assert.equal(c.m.state.error.origin, "properties");
      assert.deepEqual(c.m.state.error.data, {});
    }),
);
for (const stage of ["instance", "ports", "params"])
  add(
    "IP-D-partial-" + stage,
    "data",
    `${stage} returns illegal partial`,
    "real SDK protocol_error/client, failed state, never partial success",
    () =>
      using(async (c) => {
        let t = await begin(c),
          q = t.q,
          value = info();
        if (stage !== "instance") {
          t = await second(c, t);
          q = stage === "ports" ? t.p : t.n;
          value = stage === "ports" ? ports() : params();
        }
        c.wire.ok(q, value, {
          status: "partial",
          reasons: [{ code: "indexing" }],
        });
        await failure(t.o, "protocol_error", "client");
        assert.equal(c.m.state.status, "failed");
        assert.equal(Object.hasOwn(c.m.state, "data"), false);
      }),
  );
add(
  "IP-T-join",
  "tasks",
  "three load calls same pending target",
  "one SDK triple, every caller once; no Promise identity requirement",
  () =>
    using(async (c) => {
      const t = await begin(c),
        a = invoke(c, "load", t.target),
        b = invoke(c, "load", t.target);
      assert.equal(c.calls.length, 1);
      await finish(c, t);
      await success(a);
      await success(b);
      assert.deepEqual(
        c.events.map((s) => s.status),
        ["pending", "success"],
      );
    }),
);
add(
  "IP-T-success-noop",
  "tasks",
  "load same success target",
  "same state identity; zero queries/notifications",
  () =>
    using(async (c) => {
      await finish(c, await begin(c));
      const state = c.m.state,
        n = c.calls.length,
        e = c.events.length;
      await success(invoke(c, "load", "B-ip-A"));
      assert.equal(c.m.state, state);
      assert.equal(c.calls.length, n);
      assert.equal(c.events.length, e);
    }),
);
for (const stage of ["get", "secondaries"])
  for (const action of ["replace", "reload"])
    add(
      `IP-T-${action}-${stage}`,
      "tasks",
      `${action} during ${stage}; old late reply`,
      "old waiters cancelled, new pending only; late old response cannot publish or overwrite target",
      () =>
        using(async (c) => {
          let old = await begin(c);
          if (stage === "secondaries") old = await second(c, old);
          const joined = invoke(c, "load", "B-ip-A"),
            target = action === "replace" ? "B-ip-B" : "B-ip-A";
          const o = invoke(
            c,
            action === "replace" ? "load" : "reload",
            ...(action === "replace" ? [target] : []),
          );
          local(await failure(old.o), "cancelled");
          local(await failure(joined), "cancelled");
          assert.deepEqual(
            c.events.map((s) => s.status),
            ["pending", "pending"],
          );
          const q = await c.wire.next(
            "inst.get",
            (x) => x.params.inst === target,
          );
          const state = c.m.state;
          if (old.p) {
            c.wire.ok(old.p, ports(19));
            c.wire.ok(old.n, params());
          } else c.wire.ok(old.q, info("B-ip-A", 19));
          await tick();
          assert.equal(c.m.state, state);
          await finish(c, { o, q, target });
          assert.equal(c.m.state.target, target);
        }),
    );
add(
  "IP-T-reload-cache",
  "tasks",
  "successful model with SDK complete cache warmed; reload",
  "three new SDK calls but only uncached inst.get wire; same original data facts",
  () =>
    using(
      async (c) => {
        await finish(c, await begin(c));
        const old = c.m.state,
          n = c.calls.length,
          w = c.wire.queries.length,
          o = invoke(c, "reload");
        assert.equal(c.m.state.status, "pending");
        assert.equal(Object.hasOwn(c.m.state, "data"), false);
        c.wire.ok(await c.wire.next("inst.get"), info());
        await success(o);
        assert.equal(c.calls.length, n + 3);
        assert.equal(c.wire.queries.length, w + 1);
        assert.deepEqual(c.m.state.data, old.data);
        deep(old);
      },
      { cacheEntries: 8 },
    ),
);
for (const stage of ["get", "secondaries"])
  for (const command of ["cancel", "clear", "dispose"])
    add(
      `IP-L-${command}-${stage}`,
      "lifecycle",
      `${command} during ${stage} and then late success`,
      "old waiter correct local error; cancel/clear ownership, idle/cancelled/fixed snapshot; no late publication or SDK disposal",
      () =>
        using(async (c) => {
          let t = await begin(c);
          if (stage === "secondaries") t = await second(c, t);
          const snap = c.m.snapshotId;
          if (command === "dispose") c.m.dispose();
          else await success(invoke(c, command));
          local(
            await failure(t.o),
            command === "dispose" ? "disposed" : "cancelled",
          );
          const state = c.m.state,
            n = c.events.length;
          assert.equal(
            state.status,
            command === "cancel" ? "cancelled" : "idle",
          );
          if (t.p) {
            c.wire.ok(t.p, ports());
            c.wire.ok(t.n, params());
          } else c.wire.ok(t.q, info());
          await tick();
          assert.equal(c.m.state, state);
          assert.equal(c.events.length, n);
          assert.equal(c.m.snapshotId, snap);
          assert.equal(c.wire.closed, false);
        }),
    );
for (const state of ["idle", "success", "failed", "cancelled"])
  for (const command of ["cancel", "clear", "reload"])
    add(
      `IP-L-noop-${state}-${command}`,
      "lifecycle",
      `${command} in ${state}`,
      "no-op where defined; clear idle, reload target starts get, stable state on no-op",
      () =>
        using(async (c) => {
          if (state !== "idle") {
            const t = await begin(c);
            if (state === "success") await finish(c, t);
            else if (state === "failed") {
              c.wire.fail(t.q);
              await failure(t.o);
            } else {
              await success(invoke(c, "cancel"));
              await failure(t.o);
            }
          }
          const before = c.m.state,
            n = c.calls.length,
            e = c.events.length;
          if (command === "reload" && state !== "idle") {
            const o = invoke(c, "reload"),
              q = await c.wire.next("inst.get");
            await finish(c, { o, q, target: "B-ip-A" });
          } else {
            await success(invoke(c, command));
            if (command === "clear" && state !== "idle")
              assert.deepEqual(c.m.state, { status: "idle", target: null });
            else {
              assert.equal(c.m.state, before);
              assert.equal(c.events.length, e);
            }
            assert.equal(c.calls.length, n);
          }
        }),
    );
for (const retryState of ["failed", "cancelled"])
  add(
    "IP-T-retry-" + retryState,
    "tasks",
    `${retryState} same target retries`,
    "new task/get rather than join/no-op; stale error omitted",
    () =>
      using(async (c) => {
        const t = await begin(c);
        if (retryState === "failed") c.wire.fail(t.q);
        else await success(invoke(c, "cancel"));
        await failure(t.o);
        const retry = await begin(c);
        assert.equal(Object.hasOwn(c.m.state, "error"), false);
        await finish(c, retry);
      }),
  );
for (const first of ["ports", "params"])
  add(
    "IP-E-first-" + first,
    "errors",
    `${first} fails before other secondary`,
    "first original HierError is final cause; abort rest, late replies cannot change it",
    () =>
      using(async (c) => {
        const t = await second(c, await begin(c));
        const q = first === "ports" ? t.p : t.n,
          other = first === "ports" ? t.n : t.p;
        c.wire.fail(q, "bad_request", "B first");
        const e = await failure(t.o, "bad_request", "core");
        assert.equal(e, c.calls.find((x) => x.method === first).error);
        const state = c.m.state;
        c.wire.fail(other, "not_found", "B late");
        await tick();
        assert.equal(c.m.state, state);
        assert.equal(c.m.state.error.message, "B first");
        assert.equal(c.m.state.status, "failed");
        assert.ok(c.wire.cancels.length >= 1);
      }),
  );
for (const code of ["not_found", "bad_request", "cancelled"])
  add(
    "IP-E-sdk-" + code,
    "errors",
    `real SDK Core ${code}`,
    "original HierError identity, own frozen diagnostic, cancelled classification only when appropriate",
    () =>
      using(async (c) => {
        const t = await begin(c);
        c.wire.fail(t.q, code, "B diagnostic", { nested: { value: 8 } });
        const e = await failure(t.o, code, "core");
        assert.equal(e, c.calls[0].error);
        assert.equal(
          c.m.state.status,
          code === "cancelled" ? "cancelled" : "failed",
        );
        assert.notEqual(c.m.state.error.data, e.data);
        assert.deepEqual(c.m.state.error.data, e.data);
        deep(c.m.state);
        assert.equal(Object.isFrozen(e), false);
      }),
  );
for (const shared of ["get", "ports", "params"])
  add(
    "IP-O-shared-" + shared,
    "ownership",
    `direct SDK consumer shares ${shared}; model cancels`,
    "independent subscription survives, no transport close or cancellation of shared request",
    () =>
      using(async (c) => {
        const method = shared === "get" ? "instance" : shared;
        const direct = c.client[method]("B-ip-A"),
          observed = direct.then(
            (value) => ({ ok: true, value }),
            (error) => ({ ok: false, error }),
          );
        const q = await c.wire.next(
          shared === "get" ? "inst.get" : "inst." + shared,
        );
        let t;
        if (shared === "get")
          t = { o: invoke(c, "load", "B-ip-A"), q, target: "B-ip-A" };
        else {
          t = await begin(c);
          c.wire.ok(t.q, info());
          await c.wire.next(shared === "ports" ? "inst.params" : "inst.ports");
          await tick();
          assert.deepEqual(
            c.calls.slice(1).map((x) => x.method),
            ["instance", "ports", "params"],
          );
        }
        await success(invoke(c, "cancel"));
        await failure(t.o);
        assert.equal(
          c.wire.cancels.some((x) => x.params.target === q.id),
          false,
        );
        c.wire.ok(
          q,
          shared === "get" ? info() : shared === "ports" ? ports() : params(),
        );
        const result = await observed;
        assert.equal(result.ok, true);
        assert.equal(c.wire.closed, false);
      }),
  );
add(
  "IP-O-two-models",
  "ownership",
  "two models share SDK task; dispose first",
  "second remains alive and succeeds, SDK survives, no borrowed Selection changes",
  () =>
    using(async (c) => {
      const other = c.newModel(),
        first = await begin(c),
        b = { ...c, m: other };
      const o = invoke(b, "load", "B-ip-A");
      c.m.dispose();
      local(await failure(first.o), "disposed");
      c.wire.ok(first.q, info());
      const p = await c.wire.next("inst.ports"),
        n = await c.wire.next("inst.params");
      c.wire.ok(p, ports());
      c.wire.ok(n, params());
      await success(o);
      assert.equal(other.state.status, "success");
      assert.equal(c.wire.closed, false);
    }),
);
add(
  "IP-N-subscriptions",
  "notifications",
  "duplicate listener, unsubscribe later listener, add during batch",
  "registration order and independent tokens, no replay, removed skipped, new starts next batch",
  () =>
    using(async (c) => {
      const seen = [];
      let added = false,
        offLater;
      const listener = () => seen.push("duplicate");
      const offFirst = c.m.subscribe(() => {
        seen.push("first");
        offLater?.();
        if (!added) {
          added = true;
          c.m.subscribe(() => seen.push("added"));
        }
      });
      c.m.subscribe(listener);
      const offDuplicate = c.m.subscribe(listener);
      offLater = c.m.subscribe(() => seen.push("removed"));
      assert.deepEqual(seen, []);
      const t = await begin(c);
      assert.deepEqual(seen, ["first", "duplicate", "duplicate"]);
      seen.length = 0;
      offDuplicate();
      offDuplicate();
      await finish(c, t);
      assert.deepEqual(seen, ["first", "duplicate", "added"]);
      offFirst();
    }),
);
for (const value of [undefined, null, 0, false, "", {}])
  add(
    "IP-N-invalid-" + String(typeof value) + "-" + String(value),
    "notifications",
    `subscribe non-function ${typeof value}`,
    "synchronous InstancePropertiesError invalid_argument, no notification/state/query",
    () =>
      using(async (c) => {
        const before = c.m.state;
        assert.throws(
          () => c.m.subscribe(value),
          (e) => {
            local(e, "invalid_argument");
            return true;
          },
        );
        assert.equal(c.m.state, before);
        assert.equal(c.calls.length, 0);
      }),
  );
for (const kind of [
  "undefined",
  "null",
  "zero",
  "false",
  "empty",
  "object",
  "proxy",
])
  for (const phase of ["pending", "success"])
    add(
      `IP-N-throw-${phase}-${kind}`,
      "notifications",
      `${phase} listener throws ${kind}; joined callers`,
      "original thrown value in AggregateError for all waiters, commit survives, following listener still runs, raw zero probes",
      () =>
        using(async (c) => {
          const counts = { probes: 0 },
            marker = opaque(kind, counts);
          let after = 0;
          c.m.subscribe(() => {
            if (c.m.state.status === phase) throw marker;
          });
          c.m.subscribe(() => after++);
          const t = await begin(c),
            joined = invoke(c, "load", "B-ip-A");
          const x = await second(c, t);
          c.wire.ok(x.p, ports());
          c.wire.ok(x.n, params());
          for (const o of [t.o, joined]) {
            const e = await failure(o);
            assert.ok(e instanceof AggregateError);
            assert.equal(e.errors.length, 1);
            assert.equal(Object.is(e.errors[0], marker), true);
          }
          assert.equal(c.m.state.status, "success");
          assert.equal(Object.hasOwn(c.m.state, "error"), false);
          assert.equal(after, 2);
          assert.equal(counts.probes, 0);
        }),
    );
add(
  "IP-N-order-cause",
  "notifications",
  "pending and failed notifications throw, joined waiters, Core fails",
  "errors in chronological order; AggregateError.cause is original query error; failed state remains factual",
  () =>
    using(async (c) => {
      const a = { B: "pending" },
        b = { B: "failed" };
      c.m.subscribe(() => {
        throw c.m.state.status === "pending" ? a : b;
      });
      const t = await begin(c),
        joined = invoke(c, "load", "B-ip-A");
      c.wire.fail(t.q);
      for (const o of [t.o, joined]) {
        const e = await failure(o);
        assert.ok(e instanceof AggregateError);
        assert.deepEqual(e.errors, [a, b]);
        assert.equal(e.cause, c.calls[0].error);
      }
      assert.equal(c.m.state.status, "failed");
    }),
);
for (const command of ["cancel", "clear"])
  add(
    "IP-N-own-" + command,
    "notifications",
    `${command} notification throws; earlier pending throw`,
    "action notification belongs only to action Promise; old load keeps only its earlier notifications and cancelled cause",
    () =>
      using(async (c) => {
        const a = { B: "pending" },
          b = { B: "action" };
        c.m.subscribe(() => {
          throw c.m.state.status === "pending" ? a : b;
        });
        const t = await begin(c),
          action = invoke(c, command);
        const e = await failure(action);
        assert.ok(e instanceof AggregateError);
        assert.deepEqual(e.errors, [b]);
        const old = await failure(t.o);
        assert.ok(old instanceof AggregateError);
        assert.deepEqual(old.errors, [a]);
        local(old.cause, "cancelled");
      }),
  );
for (const phase of ["pending", "success"])
  for (const name of ["load", "reload", "cancel", "clear"])
    add(
      `IP-N-reentrant-${phase}-${name}`,
      "notifications",
      `${name} in ${phase} notification; poison argument`,
      "reentrant_change Promise before parameter access or no-op; current task unchanged",
      () =>
        using(async (c) => {
          const counts = { probes: 0 },
            poison = opaque("proxy", counts),
            nested = [];
          let used = false;
          c.m.subscribe(() => {
            if (c.m.state.status === phase && !used) {
              used = true;
              nested.push(
                invoke(c, name, ...(name === "load" ? [poison] : [])),
              );
            }
          });
          await finish(c, await begin(c));
          assert.equal(nested.length, 1);
          local(await failure(nested[0]), "reentrant_change");
          assert.equal(counts.probes, 0);
          assert.equal(c.calls.length, 3);
          assert.equal(c.m.state.status, "success");
        }),
    );
add(
  "IP-N-not-await",
  "notifications",
  "listener returns owned unresolved Promise",
  "model task settles while listener Promise remains pending; callback owns later rejection",
  () =>
    using(async (c) => {
      let release;
      const owned = new Promise((resolve) => {
        release = resolve;
      });
      c.m.subscribe(() => owned);
      const t = await second(c, await begin(c));
      try {
        c.wire.ok(t.p, ports());
        c.wire.ok(t.n, params());
        await tick();
        await tick();
        assert.equal(t.o.done, true, "must not await listener work");
        await success(t.o);
      } finally {
        release();
      }
    }),
);
for (const phase of ["pending", "success"])
  for (const throwAfter of [false, true])
    add(
      `IP-L-dispose-in-${phase}-${throwAfter}`,
      "lifecycle",
      `dispose in ${phase} listener; later throw=${throwAfter}`,
      "dispose wins; no later listeners/query; state idle no disposal notification, old committed values frozen",
      () =>
        using(async (c) => {
          let later = 0,
            old;
          c.m.subscribe(() => {
            if (c.m.state.status === phase) {
              old = c.m.state;
              c.m.dispose();
              if (throwAfter) throw undefined;
            }
          });
          c.m.subscribe(() => later++);
          if (phase === "pending") {
            const o = invoke(c, "load", "B-ip-A");
            local(await failure(o), "disposed");
            assert.equal(c.calls.length, 0);
            assert.equal(later, 0);
          } else {
            const t = await second(c, await begin(c));
            c.wire.ok(t.p, ports());
            c.wire.ok(t.n, params());
            local(await failure(t.o), "disposed");
            assert.equal(later, 1);
          }
          assert.deepEqual(c.m.state, { status: "idle", target: null });
          assert.equal(c.m.disposed, true);
          deep(old);
          assert.equal(c.wire.closed, false);
        }),
    );
for (const command of ["load", "reload", "cancel", "clear"])
  add(
    "IP-L-after-dispose-" + command,
    "lifecycle",
    `disposed ${command}, invalid load value`,
    "disposed wins, asynchronous error, no poison access/query/state mutation",
    () =>
      using(async (c) => {
        c.m.dispose();
        c.m.dispose();
        const counts = { probes: 0 },
          before = c.m.state;
        local(
          await failure(
            invoke(
              c,
              command,
              ...(command === "load" ? [opaque("proxy", counts)] : []),
            ),
          ),
          "disposed",
        );
        assert.equal(counts.probes, 0);
        assert.equal(c.m.state, before);
        assert.equal(c.calls.length, 0);
      }),
  );
for (const mode of ["failure", "cancel", "dispose", "observer"])
  add(
    "IP-P-unhandled-" + mode,
    "promises",
    `plain Node unobserved load rejection ${mode}`,
    "natural child exit0 without global rejection listeners; no claim of future L7 view-owned consumption",
    () => {
      const child = spawnSync(
        process.execPath,
        [
          "--unhandled-rejections=strict",
          fileURLToPath(new URL("./unhandled-worker.mjs", import.meta.url)),
          mode,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, NODE_OPTIONS: "" },
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        },
      );
      assert.equal(child.error, undefined);
      assert.equal(child.signal, null);
      assert.equal(child.status, 0, child.stdout + child.stderr);
      const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
      assert.equal(result.mode, mode);
      assert.equal(result.globalRejectionListeners, 0);
    },
  );

for (const first of ["ports", "params"])
  add(
    "IP-E-same-turn-" + first,
    "errors",
    `both secondary failures in one turn, ${first} emitted first`,
    "first handled query failure wins despite opposite SDK call order; one failed publication",
    () =>
      using(async (c) => {
        const t = await second(c, await begin(c));
        c.wire.fail(
          first === "ports" ? t.p : t.n,
          "bad_request",
          "B first same turn",
        );
        c.wire.fail(
          first === "ports" ? t.n : t.p,
          "not_found",
          "B second same turn",
        );
        const e = await failure(t.o);
        assert.equal(e, c.calls.find((x) => x.method === first).error);
        assert.equal(e.message, "B first same turn");
        assert.deepEqual(
          c.events.map((s) => s.status),
          ["pending", "failed"],
        );
      }),
  );
for (const pending of ["ports", "params"])
  for (const command of ["cancel", "clear", "dispose"])
    add(
      `IP-L-one-pending-${pending}-${command}`,
      "lifecycle",
      `${pending} still pending after other secondary completed; ${command}`,
      "no partial data; old waiter cancelled/disposed; one final state; completed secondary does not detach active task",
      () =>
        using(async (c) => {
          const t = await second(c, await begin(c));
          if (pending === "ports") c.wire.ok(t.n, params());
          else c.wire.ok(t.p, ports());
          await tick();
          assert.equal(c.m.state.status, "pending");
          assert.equal(Object.hasOwn(c.m.state, "data"), false);
          if (command === "dispose") c.m.dispose();
          else await success(invoke(c, command));
          local(
            await failure(t.o),
            command === "dispose" ? "disposed" : "cancelled",
          );
          const state = c.m.state;
          c.wire.ok(
            pending === "ports" ? t.p : t.n,
            pending === "ports" ? ports() : params(),
          );
          await tick();
          assert.equal(c.m.state, state);
        }),
    );
for (const phase of ["pending", "success"])
  add(
    "IP-L-dispose-prior-observer-" + phase,
    "lifecycle",
    `earlier pending observer error, dispose during ${phase}`,
    "disposed error retains earlier observer aggregate as cause; disposal does not lose active command",
    () =>
      using(async (c) => {
        const marker = { B: "prior observer" };
        c.m.subscribe(() => {
          if (c.m.state.status === "pending") throw marker;
        });
        c.m.subscribe(() => {
          if (c.m.state.status === phase) c.m.dispose();
        });
        let o;
        if (phase === "pending") o = invoke(c, "load", "B-ip-A");
        else {
          const t = await second(c, await begin(c));
          o = t.o;
          c.wire.ok(t.p, ports());
          c.wire.ok(t.n, params());
        }
        const e = await failure(o);
        local(e, "disposed");
        assert.ok(e.cause instanceof AggregateError);
        assert.deepEqual(e.cause.errors, [marker]);
        assert.deepEqual(c.m.state, { status: "idle", target: null });
      }),
  );
add(
  "IP-L-dispose-joined",
  "lifecycle",
  "three joined callers disposed before get response",
  "all unsettled callers exactly once disposed, no cancelled or successful exception",
  () =>
    using(async (c) => {
      const t = await begin(c),
        a = invoke(c, "load", t.target),
        b = invoke(c, "load", t.target);
      c.m.dispose();
      for (const o of [t.o, a, b]) local(await failure(o), "disposed");
      assert.deepEqual(c.m.state, { status: "idle", target: null });
    }),
);
add(
  "IP-N-other-model",
  "notifications",
  "other model clear no-op inside this model notification",
  "notification reentry guard belongs only to this model",
  () =>
    using(async (c) => {
      const other = c.newModel(),
        nested = [];
      c.m.subscribe(() => nested.push(other.clear()));
      await finish(c, await begin(c));
      await Promise.all(nested);
      assert.equal(other.state.status, "idle");
    }),
);
