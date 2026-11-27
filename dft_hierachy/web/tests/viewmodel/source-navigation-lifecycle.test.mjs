import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as H from "../independent-source-document/harness.mjs";

// This standard test always loads its own checkout, even with a stale B root.
const previousRoot = process.env.HIER_B_PRODUCT_ROOT;
try {
  process.env.HIER_B_PRODUCT_ROOT = fileURLToPath(
    new URL("../../../", import.meta.url),
  );
  await H.boot();
} finally {
  if (previousRoot === undefined) delete process.env.HIER_B_PRODUCT_ROOT;
  else process.env.HIER_B_PRODUCT_ROOT = previousRoot;
}

test("A constructor releases the first owned model if a later public snapshot read throws", async () => {
  const c = await H.context({ withModel: false });
  const prototype = H.vm.SourceCandidatesModel.prototype;
  const dispose = prototype.dispose;
  let released;
  const snapshot = c.client.snapshot;
  const original = { origin: "A controlled public snapshot accessor" };
  let reads = 0;
  Object.defineProperty(c.client, "snapshot", {
    configurable: true,
    get() {
      if (++reads === 3) throw original;
      return snapshot;
    },
  });
  prototype.dispose = function () {
    released = this;
    return dispose.call(this);
  };
  try {
    assert.throws(
      () => new H.vm.SourceNavigationModel(c.client),
      (error) => error === original,
    );
    assert.equal(reads, 3);
    assert.ok(released, "the acquired candidate model must be disposed");
    assert.equal(released.disposed, true);
  } finally {
    prototype.dispose = dispose;
    Reflect.deleteProperty(c.client, "snapshot");
    await c.close();
  }
});
