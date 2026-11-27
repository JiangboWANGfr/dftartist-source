import test from "node:test";
import assert from "node:assert/strict";
import { group } from "./public-model.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P, "explicit fixed product");
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { SourceNavigationModel, SelectionModel } = await import(
    publicEntry(P, "@hier/viewmodel")
  );
for (const throwCleanup of [false, true])
  test(
    "B47 setup failure preserves raw cause; cleanup throws=" + throwCleanup,
    async () => {
      const original = Object.freeze({ B47: "original setup failure" }),
        cleanup = Error("B47 original cleanup failure");
      let constructs = 0,
        releases = 0,
        first;
      class ControlledSelection extends SelectionModel {
        constructor(options) {
          if (++constructs === 2) throw original;
          super(options);
          first = this;
        }
        dispose() {
          super.dispose();
          releases++;
          if (throwCleanup) throw cleanup;
        }
      }
      let caught;
      try {
        await group(
          {
            HierClient,
            SourceNavigationModel,
            SelectionModel: ControlledSelection,
          },
          "selection",
        );
      } catch (e) {
        caught = e;
      }
      assert.equal(constructs, 2);
      assert.equal(releases, 1);
      assert.equal(
        first.disposed,
        true,
        "real base disposed before injected cleanup error",
      );
      if (throwCleanup) {
        assert(
          caught instanceof AggregateError,
          "original and cleanup errors both retained",
        );
        assert.equal(caught.cause, original);
        assert.deepEqual(caught.errors, [original, cleanup]);
      } else
        assert.equal(
          caught,
          original,
          "successful cleanup must not replace original setup error",
        );
    },
  );
