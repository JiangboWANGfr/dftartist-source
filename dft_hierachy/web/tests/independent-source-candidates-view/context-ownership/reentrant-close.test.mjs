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
test("B49-C99-11 disposal synchronously reenters close: one shared resource release", async (t) => {
  let c,
    joined,
    once = false,
    navigation = 0,
    selection = 0,
    client = 0;
  class N extends SourceNavigationModel {
    dispose() {
      super.dispose();
      navigation++;
      if (!once) {
        once = true;
        joined = c.close();
      }
    }
  }
  class S extends SelectionModel {
    dispose() {
      super.dispose();
      selection++;
    }
  }
  class C extends HierClient {
    dispose() {
      super.dispose();
      client++;
    }
  }
  c = await context({
    HierClient: C,
    SourceNavigationModel: N,
    SelectionModel: S,
  });
  try {
    const first = c.close();
    await Promise.all([first, joined]);
    t.diagnostic(
      JSON.stringify({
        navigation,
        selection,
        client,
        wireMessages: c.messages.size,
        wireCloses: c.closes.size,
        candidateUI: false,
      }),
    );
    assert.equal(navigation, 1);
    assert.equal(selection, 1);
    assert.equal(client, 1);
    assert.equal(c.messages.size, 0);
    assert.equal(c.closes.size, 0);
  } finally {
    SourceNavigationModel.prototype.dispose.call(c.n);
    SelectionModel.prototype.dispose.call(c.s);
    HierClient.prototype.dispose.call(c.client);
  }
});
