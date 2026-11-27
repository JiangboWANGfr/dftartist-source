import test from "node:test";
import assert from "node:assert/strict";
import { instrument } from "./instrument.mjs";
import { context } from "../pagination/public-model.mjs";
import { group } from "../pointer-session/public-model.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P, "explicit fixed product root");
const base = {
  ...(await import(publicEntry(P, "@hier/client"))),
  ...(await import(publicEntry(P, "@hier/viewmodel"))),
};
// Deliberately opaque arbitrary throw: no implementation may read its cause to flatten.
const opaque = (label) =>
  Object.freeze({
    label,
    get cause() {
      throw Error("opaque raw cause was probed");
    },
  });
async function capture(fn) {
  try {
    return { threw: false, value: await fn() };
  } catch (error) {
    return { threw: true, error };
  }
}
function ownership(t, i) {
  const ledger = i.ledger(),
    violations = i.violations();
  t.diagnostic(JSON.stringify({ ledger, violations, candidateUI: false }));
  assert.deepEqual(
    violations,
    [],
    "ALL successfully acquired resources released exactly once before safety cleanup",
  );
}
async function failure(t, config, mode, validate) {
  const i = instrument(base, config);
  try {
    const result = await capture(() =>
      mode === "direct" ? context(i.classes) : group(i.classes, mode),
    );
    t.diagnostic(
      JSON.stringify({
        stage: config.stage,
        at: config.at,
        mode,
        threw: result.threw,
        rawSetupSame: result.error === config.setup,
        ledgerBeforeSafety: i.ledger(),
        violations: i.violations(),
      }),
    );
    assert.equal(result.threw, true, "controlled setup really failed");
    validate(result.error);
    ownership(t, i);
  } finally {
    assert.deepEqual(
      await i.safetyCleanup(),
      [],
      "red-path safety cleanup completed",
    );
  }
}
test("B49-C99-01 pair second Selection throw: two Nav/Client and first Selection all released", async (t) => {
  const setup = opaque("pair-selection");
  await failure(t, { stage: "selection", at: 2, setup }, "pair", (error) =>
    assert.equal(error, setup),
  );
});
test("B49-C99-02 pair second partial context preserves raw setup + object/undefined cleanup values", async (t) => {
  const setup = opaque("pair-inner"),
    navigation = opaque("second-nav-cleanup");
  await failure(
    t,
    {
      stage: "selection",
      at: 2,
      setup,
      cleanup: { navigation2: navigation, client2: undefined },
    },
    "pair",
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.cause, setup);
      assert.equal(error.errors.length, 3);
      assert.equal(error.errors[0], setup);
      assert.equal(error.errors[1], navigation);
      assert.equal(error.errors[2], undefined);
    },
  );
});
test("B49-C99-03 inner and outer rollback keep each original causal layer; no arbitrary flatten", async (t) => {
  const setup = opaque("nested-setup"),
    inner = opaque("inner-nav"),
    outer = opaque("outer-selection");
  await failure(
    t,
    {
      stage: "selection",
      at: 2,
      setup,
      cleanup: { navigation2: inner, selection1: outer },
    },
    "pair",
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      const nested = error.errors[0];
      assert.equal(error.cause, nested);
      assert(error.errors[1] === outer);
      assert(nested instanceof AggregateError);
      assert.equal(nested.cause, setup);
      assert.equal(nested.errors.length, 2);
      assert.equal(nested.errors[0], setup);
      assert.equal(nested.errors[1], inner);
    },
  );
});
test("B49-C99-04 pair second Navigation constructor throws null: second Client still owned", async (t) => {
  await failure(
    t,
    { stage: "navigation", at: 2, setup: null },
    "pair",
    (error) => assert.equal(error, null),
  );
});
test("B49-C99-05 direct first Selection constructor throws false: earlier Nav/Client rolled back", async (t) => {
  await failure(
    t,
    { stage: "selection", at: 1, setup: false },
    "direct",
    (error) => assert.equal(error, false),
  );
});
test("B49-C99-06 direct Navigation constructor throws undefined, not success or missing error", async (t) => {
  await failure(
    t,
    { stage: "navigation", at: 1, setup: undefined },
    "direct",
    (error) => assert.equal(error, undefined),
  );
});
test("B49-C99-07 real client ready rejects on early Transport close: acquired Client released", async (t) => {
  await failure(t, { stage: "ready", at: 1 }, "direct", (error) => {
    assert(error instanceof base.HierError);
    assert.equal(error.origin, "transport");
    assert.equal(error.code, "transport_closed");
  });
});
test("B49-C99-08 successful transfer: concurrent/repeated close does not double-dispose", async (t) => {
  const i = instrument(base, {});
  try {
    const c = await context(i.classes);
    assert.equal(i.objects.length, 3);
    assert(i.objects.every((o) => o.releases === 0));
    assert.deepEqual(await Promise.all([c.close(), c.close()]), [[], []]);
    assert.deepEqual(await c.close(), []);
    ownership(t, i);
  } finally {
    assert.deepEqual(await i.safetyCleanup(), []);
  }
});
test("B49-C99-09 normal close continues through all three raw dispose failures", async (t) => {
  const navigation = opaque("close-nav"),
    selection = null,
    client = false,
    i = instrument(base, {
      cleanup: {
        navigation1: navigation,
        selection1: selection,
        client1: client,
      },
    });
  try {
    const c = await context(i.classes),
      errors = await c.close();
    assert.deepEqual(
      errors.map((e) => e.label),
      ["navigation", "selection", "client"],
    );
    assert.equal(errors[0].error, navigation);
    assert.equal(errors[1].error, selection);
    assert.equal(errors[2].error, client);
    ownership(t, i);
  } finally {
    assert.deepEqual(await i.safetyCleanup(), []);
  }
});
test("B49-C99-10 Client constructor throws before super: no acquired Client, fixture wire closes", async (t) => {
  const setup = opaque("client-construct");
  await failure(t, { stage: "client", at: 1, setup }, "direct", (error) =>
    assert.equal(error, setup),
  );
});
