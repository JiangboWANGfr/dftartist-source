// OS child tests original command Promise handling, never a fake model.
import assert from "node:assert/strict";
import { boot, context, Q, page, tick } from "./harness.mjs";
await boot();
const mode = process.argv[2],
  unhandled = [];
process.on("unhandledRejection", (e) => unhandled.push(e));
const c = await context();
let p, expected;
try {
  if (mode === "invalid") {
    p = c.m.load(null);
    expected = "invalid_argument";
  } else if (mode === "disposed") {
    c.m.dispose();
    p = c.m.load(Q);
    expected = "disposed";
  } else {
    if (mode === "notify")
      c.m.subscribe(() => {
        if (c.m.state.status === "success") throw "B observer";
      });
    p = c.m.load(Q);
    const q = await c.wire.next("source.resolve");
    if (mode === "cancel" || mode === "clear") {
      await c.m[mode]();
      expected = "cancelled";
    } else if (mode === "error") {
      c.wire.fail(q, "not_found");
      expected = "not_found";
    } else if (mode === "notify") {
      c.wire.ok(q, page());
      expected = "AggregateError";
    } else throw Error("unknown mode");
  }
  // Deliberately do not attach to original command until event loop unhandled checks.
  await tick();
  await tick();
  assert.equal(unhandled.length, 0);
  await assert.rejects(p, (e) =>
    expected === "AggregateError"
      ? e instanceof AggregateError
      : e.code === expected,
  );
  console.log(
    JSON.stringify({
      kind: "original-Promise-child",
      mode,
      unhandled: 0,
      observablyRejected: true,
    }),
  );
} finally {
  await c.close();
}
