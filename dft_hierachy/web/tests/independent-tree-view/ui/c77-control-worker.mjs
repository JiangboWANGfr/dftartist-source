// B independent negative controls. No UI, global rejection listener or C probe.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const mode = process.argv[2],
  turn = () => new Promise((resolve) => setImmediate(resolve));
assert.equal(process.listenerCount("unhandledRejection"), 0);
assert.equal(process.listenerCount("uncaughtException"), 0);
if (mode === "raw-missing-consumer" || mode === "raw-with-consumer") {
  const raw = new Error("B-C77-own-raw-rejection");
  let same = false;
  const p = Promise.reject(raw);
  if (mode === "raw-with-consumer")
    p.catch((error) => {
      same = error === raw;
    });
  console.log(
    JSON.stringify({
      mode,
      globalRejectionListeners: 0,
      consumer: mode === "raw-with-consumer",
    }),
  );
  await turn();
  await turn();
  assert.equal(same, true);
  console.log(JSON.stringify({ mode, consumerSawOriginal: true }));
} else {
  assert.ok(
    ["real-L6-no-view", "real-L6-plus-B-observer-no-view"].includes(mode),
  );
  const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
  const harness = path.join(product, "web/tests/independent-tree/harness.mjs");
  const own = path.resolve(
    import.meta.dirname,
    "../../independent-tree/harness.mjs",
  );
  const sha = (f) =>
    createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  assert.equal(sha(harness), sha(own), "original B public fixture bytes");
  const { model } = await import(pathToFileURL(harness));
  const cleanup = [],
    ctx = await model({ after: (f) => cleanup.push(f) });
  let originalPromise;
  const original = ctx.tree.loadRoots;
  ctx.tree.loadRoots = function (...args) {
    originalPromise = Reflect.apply(original, this, args);
    return originalPromise;
  };
  ctx.calls = [];
  let observerSha;
  if (mode === "real-L6-plus-B-observer-no-view") {
    const text = fs.readFileSync(
      path.join(import.meta.dirname, "../c76/browser/fixture.jsx"),
      "utf8",
    );
    const fragment = text
      .slice(
        text.indexOf("function observe("),
        text.indexOf("async function makeContext("),
      )
      .trimEnd();
    observerSha = createHash("sha256").update(fragment).digest("hex");
    const observe = Function("return (" + fragment + ")")();
    observe(ctx, ctx.tree, ["loadRoots"]);
  }
  const returned = ctx.tree.loadRoots();
  assert.equal(returned, originalPromise, "no replacement Promise");
  const request = await ctx.wire.next("inst.roots");
  ctx.wire.fail(request, "not_found", "B C77 independent failure", {});
  // Deliberately no consumer catch/then/await on returned. Cross two turns, not a timed sleep.
  await turn();
  await turn();
  assert.equal(ctx.tree.rootState.status, "failed");
  assert.equal(ctx.tree.disposed, false);
  assert.equal(ctx.wire.closed, false);
  if (observerSha) {
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].failed, true);
    assert.equal(ctx.calls[0].checkpoint, true);
  }
  console.log(
    JSON.stringify({
      mode,
      root: "failed",
      modelAlive: true,
      wireOpen: true,
      consumerHandler: false,
      originalPromiseIdentity: true,
      Bobserver: ctx.calls.length,
      observerSha,
      globalRejectionListeners: 0,
      conclusion: "exit0 cannot prove a view registered a handler",
    }),
  );
  for (const f of cleanup) await f();
}
