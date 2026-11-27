import test from "node:test";
import assert from "node:assert/strict";
import { context } from "../pagination/public-model.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P, "explicit fixed product");
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { SourceNavigationModel, SelectionModel } = await import(
    publicEntry(P, "@hier/viewmodel")
  );
test("B49-C99-12 closed flag immediate, close handler deferred until microtask and still registered", async (t) => {
  let client,
    releases = 0,
    inClose = false,
    deliveries = 0,
    inactiveDeliveries = 0;
  const pending = [];
  class C extends HierClient {
    constructor(wire, options) {
      const original = wire.onClose;
      wire.onClose = function (handler) {
        let active = true;
        const off = Reflect.apply(original, this, [
          (...args) => {
            queueMicrotask(() => {
              if (!active) {
                inactiveDeliveries++;
                return;
              }
              assert.equal(inClose, false, "never deliver inside close stack");
              deliveries++;
              handler(...args);
            });
          },
        ]);
        return () => {
          active = false;
          return off();
        };
      };
      super(wire, options);
      client = this;
      // Original wire marks closed synchronously, preventing fixture hello delivery;
      // only the subscribed callback above is deferred, not the whole close.
      inClose = true;
      wire.close();
      inClose = false;
      assert.equal(deliveries, 0);
    }
    dispose() {
      super.dispose();
      releases++;
    }
  }
  try {
    const p = context({ HierClient: C, SourceNavigationModel, SelectionModel });
    pending.push(p);
    p.catch(() => {});
    assert.equal(
      deliveries,
      0,
      "constructor has returned before any close handler",
    );
    const [outcome] = await Promise.allSettled(pending);
    t.diagnostic(
      JSON.stringify({
        status: outcome.status,
        deliveries,
        inactiveDeliveries,
        releases,
        candidateUI: false,
      }),
    );
    assert.equal(outcome.status, "rejected");
    assert.equal(outcome.reason.origin, "transport");
    assert.equal(outcome.reason.code, "transport_closed");
    assert.equal(deliveries, 1);
    assert.equal(inactiveDeliveries, 0);
    assert.equal(releases, 1);
  } finally {
    if (client && releases === 0) HierClient.prototype.dispose.call(client);
    await Promise.allSettled(pending);
  }
});
