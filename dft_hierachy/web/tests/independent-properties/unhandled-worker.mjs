// Plain Node process, no unhandledRejection listener. Only L6's own contract here.
import assert from "node:assert/strict";
import { context, tick } from "./harness.mjs";
const mode = process.argv[2],
  c = await context();
try {
  if (mode === "observer")
    c.m.subscribe(() => {
      throw undefined;
    });
  // Deliberately do not attach a handler to the original command Promise.
  c.m.load("B-ip-A");
  const q = await c.wire.next("inst.get");
  if (mode === "dispose") c.m.dispose();
  else if (mode === "cancel") await c.m.cancel();
  else c.wire.fail(q);
  await tick();
  await tick();
  assert.ok(["failed", "cancelled", "idle"].includes(c.m.state.status));
  console.log(
    JSON.stringify({
      mode,
      ownModelPromiseUnobserved: true,
      globalRejectionListeners: process.listenerCount("unhandledRejection"),
    }),
  );
} finally {
  await c.close();
}
