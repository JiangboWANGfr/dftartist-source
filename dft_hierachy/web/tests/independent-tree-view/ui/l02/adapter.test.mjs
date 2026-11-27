// Only actual SDK/L6 and original B public Transport, never fake models/views.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  installCommandFault,
  rawInput,
  rawKinds,
} from "./public-command-fault.mjs";
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? ".");
const fixture = path.join(product, "web/tests/independent-tree/harness.mjs");
const original = new URL(
  "../../../independent-tree/harness.mjs",
  import.meta.url,
);
const sha = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
assert.equal(
  sha(fixture),
  sha(original),
  "unchanged B public Transport fixture",
);
const { model, vm, guard } = await import(pathToFileURL(fixture).href);
function selection(c) {
  const s = new vm.SelectionModel({ snapshotId: c.tree.snapshotId });
  c.models.push(s);
  return s;
}
const payload = (c) => ({
  snapshotId: c.tree.snapshotId,
  origin: "tree",
  items: [{ ref: c.roots[0].ref }],
});
async function context(t) {
  const c = await model(t);
  // Registered after the harness cleanup; inspect only after SDK disposal.
  t.after(() => {
    assert.equal(c.wire.messages.size, 0);
    assert.equal(c.wire.closes.size, 0);
    assert.equal(c.wire.closed, true);
  });
  return c;
}
async function intercepted(c, command, f) {
  if (command === "select") {
    try {
      c.s.select(payload(c));
      return { rejected: false };
    } catch (error) {
      return { rejected: true, error };
    }
  }
  const promise = c.tree.loadRoots();
  const outcome = promise.then(
    () => ({ rejected: false }),
    (error) => ({ rejected: true, error }),
  );
  assert.equal(promise, f.calls[0].boundaryPromise);
  assert.notEqual(
    promise,
    f.calls[0].originalPromise,
    "explicit new boundary Promise",
  );
  c.wire.ok(await c.wire.next("inst.roots"), c.roots);
  return outcome;
}
for (const command of ["select", "loadRoots"])
  for (const kind of rawKinds)
    test(
      `L02 adapter ${command}/${kind}: direct identity, real commit, exact restore`,
      guard,
      async (t) => {
        const c = await context(t);
        c.s = selection(c);
        const { raw, probes } = rawInput(kind);
        const target = command === "select" ? c.s : c.tree;
        const descriptor = Object.getOwnPropertyDescriptor(target, command);
        const f = installCommandFault(target, command, raw);
        try {
          const outcome = await intercepted(c, command, f);
          assert.equal(outcome.rejected, true);
          assert.equal(Object.is(outcome.error, raw), true);
          assert.equal(f.calls.length, 1);
          assert.equal(f.calls[0].delegateSucceeded, true);
          assert.equal(f.calls[0].injected, true);
          assert.equal(f.calls[0].inCall, false);
          assert.equal(f.calls[0].checkpoint, true);
          if (command === "select") {
            assert.deepEqual(c.s.current, payload(c));
            assert.equal(c.s.canGoBack, true);
            assert.equal(c.wire.queries.length, 0);
          } else {
            assert.equal(c.tree.rootState.status, "success");
            assert.equal(c.tree.rows[0].instance.ref, c.roots[0].ref);
            assert.equal(c.wire.queries.length, 1);
          }
          assert.equal(probes.count, 0);
        } finally {
          f.restore();
          await f.settle();
          assert.deepEqual(
            Object.getOwnPropertyDescriptor(target, command),
            descriptor,
          );
        }
      },
    );
for (const command of ["select", "loadRoots"])
  test(
    `L02 adapter ${command}: retain real delegate failure, never inject over it`,
    guard,
    async (t) => {
      const c = await context(t);
      c.s = selection(c);
      const marker = Object.freeze({ B: "real listener failure" });
      const target = command === "select" ? c.s : c.tree;
      if (command === "select")
        c.s.subscribe(() => {
          throw marker;
        });
      const { raw, probes } = rawInput("proxy");
      const f = installCommandFault(target, command, raw);
      try {
        let outcome;
        if (command === "select") {
          try {
            c.s.select(payload(c));
          } catch (error) {
            outcome = error;
          }
          assert.ok(outcome instanceof AggregateError);
          assert.equal(Object.is(outcome.errors[0], marker), true);
          assert.deepEqual(c.s.current, payload(c));
        } else {
          const p = c.tree.loadRoots();
          const observed = p.then(
            () => ({ failed: false }),
            (error) => ({ failed: true, error }),
          );
          c.wire.fail(await c.wire.next("inst.roots"));
          const result = await observed;
          assert.equal(result.failed, true);
          outcome = result.error;
          assert.equal(outcome.code, "not_found");
          assert.equal(outcome.origin, "core");
          assert.equal(c.tree.rootState.status, "failed");
        }
        assert.equal(Object.is(outcome, f.calls[0].originalError), true);
        assert.equal(f.calls[0].delegateFailed, true);
        assert.equal(f.calls[0].injected, false);
        assert.equal(probes.count, 0);
      } finally {
        f.restore();
        await f.settle();
      }
    },
  );
for (const command of ["select", "loadRoots"])
  test(
    `L02 adapter ${command}: failing caller finally restores descriptor and settles`,
    guard,
    async (t) => {
      const c = await context(t);
      c.s = selection(c);
      const target = command === "select" ? c.s : c.tree;
      const own = Object.getOwnPropertyDescriptor(target, command);
      const delegate = target[command];
      const f = installCommandFault(target, command, undefined);
      const marker = Object.freeze({ B: "caller assertion failure" });
      try {
        await intercepted(c, command, f);
        throw marker;
      } catch (error) {
        assert.equal(Object.is(error, marker), true);
      } finally {
        f.restore();
        await f.settle();
      }
      assert.deepEqual(Object.getOwnPropertyDescriptor(target, command), own);
      assert.equal(target[command], delegate);
    },
  );
test(
  "L02 adapter refuses other commands without mutating a real model",
  guard,
  async (t) => {
    const c = await context(t),
      before = Object.getOwnPropertyDescriptors(c.tree);
    assert.throws(() => installCommandFault(c.tree, "reload", null), TypeError);
    assert.deepEqual(Object.getOwnPropertyDescriptors(c.tree), before);
  },
);
test(
  "L02 adapter restores an existing own descriptor exactly and idempotently",
  guard,
  async (t) => {
    const c = await context(t);
    c.s = selection(c);
    const original = c.s.select;
    Object.defineProperty(c.s, "select", {
      value: original,
      writable: false,
      enumerable: true,
      configurable: true,
    });
    const own = Object.getOwnPropertyDescriptor(c.s, "select");
    const f = installCommandFault(c.s, "select", false);
    try {
      const result = await intercepted(c, "select", f);
      assert.equal(result.rejected, true);
      assert.equal(Object.is(result.error, false), true);
    } finally {
      f.restore();
      f.restore();
      await f.settle();
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(c.s, "select"), own);
  },
);
