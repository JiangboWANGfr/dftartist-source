// B oracle from public DESIGN 5.6.5, not A implementation or selftests.
import assert from "node:assert/strict";
import { sdk, using } from "../independent-source-document/harness.mjs";
export const cases = [];
const add = (id, input, expected, run) =>
  cases.push({
    id,
    input,
    expected,
    basis:
      "DESIGN §5.6.5 identity API draft cc4c0b0; approval tracked separately",
    run,
  });
const own = () =>
  new sdk.HierError("internal", "core", "B identity", { B: "kept" });
add(
  "ID-own",
  "new same-public-module HierError",
  "true; constructor/instanceof/code/origin/data keep old behavior",
  () => {
    const e = own(),
      data = e.data;
    assert.equal(sdk.isHierError(e), true);
    assert.ok(e instanceof sdk.HierError);
    assert.ok(e instanceof Error);
    assert.equal(e.code, "internal");
    assert.equal(e.origin, "core");
    assert.equal(e.data, data);
  },
);
add(
  "ID-subclass",
  "real subclass with pre-existing static is",
  "true, does not replace subclass static member or constructor behavior",
  () => {
    const marker = { B: "external static" };
    class Derived extends sdk.HierError {
      static is = () => marker;
    }
    const e = new Derived("not_found", "core", "B subclass");
    assert.equal(sdk.isHierError(e), true);
    assert.ok(e instanceof Derived);
    assert.ok(e instanceof sdk.HierError);
    assert.equal(Derived.is(), marker);
    assert.equal(e.code, "not_found");
  },
);
add(
  "ID-frozen",
  "frozen real instance",
  "true, no mutation or freeze needed on input",
  () => {
    const e = Object.freeze(own());
    assert.equal(sdk.isHierError(e), true);
    assert.equal(Object.isFrozen(e), true);
  },
);
add(
  "ID-real-getters",
  "actual constructed error then hostile own field/cause getters",
  "true, all field/cause/constructor/name/stack getters untouched, descriptors unchanged",
  () => {
    const e = own();
    let probes = 0;
    const getters = [];
    for (const key of [
      "code",
      "origin",
      "data",
      "cause",
      "constructor",
      "name",
      "message",
      "stack",
    ]) {
      const get = () => {
        probes++;
        throw undefined;
      };
      getters.push([key, get]);
      Object.defineProperty(e, key, {
        configurable: true,
        enumerable: true,
        get,
      });
    }
    assert.equal(sdk.isHierError(e), true);
    assert.equal(probes, 0);
    for (const [key, get] of getters)
      assert.equal(Object.getOwnPropertyDescriptor(e, key).get, get);
  },
);
for (const [name, value] of [
  ["null", null],
  ["undefined", undefined],
  ["false", false],
  ["true", true],
  ["zero", 0],
  ["NaN", NaN],
  ["bigint", 1n],
  ["symbol", Symbol("B")],
  ["empty", ""],
  ["string", "HierError"],
])
  add(
    "ID-primitive-" + name,
    name,
    "false; primitive is not constructed error; no coercion",
    () => assert.equal(sdk.isHierError(value), false),
  );
for (const name of [
  "plain",
  "null-prototype",
  "array",
  "function",
  "native-error",
  "DTO",
])
  add(
    "ID-other-" + name,
    name,
    "false: no same-module HierError construction, no DTO/shape coercion",
    () => {
      const value =
        name === "plain"
          ? {}
          : name === "null-prototype"
            ? Object.create(null)
            : name === "array"
              ? []
              : name === "function"
                ? () => {}
                : name === "native-error"
                  ? new Error("B native")
                  : {
                      code: "internal",
                      origin: "core",
                      message: "B DTO",
                      data: {},
                    };
      assert.equal(sdk.isHierError(value), false);
    },
  );
const trapNames = [
  "get",
  "getPrototypeOf",
  "ownKeys",
  "getOwnPropertyDescriptor",
  "has",
  "set",
  "setPrototypeOf",
  "defineProperty",
  "deleteProperty",
  "isExtensible",
  "preventExtensions",
];
for (const name of ["opaque", "wrapped-real", "revoked", "forged-prototype"])
  add(
    "ID-untouched-" + name,
    name,
    "boolean and zero probes/no throw; no positive-recognition promise for wrappers/forgeries; do not infer false/true from implementation",
    () => {
      let probes = 0;
      const traps = Object.fromEntries(
        trapNames.map((name) => [
          name,
          () => {
            probes++;
            throw undefined;
          },
        ]),
      );
      let value;
      if (name === "revoked") {
        const r = Proxy.revocable({}, traps);
        r.revoke();
        value = r.proxy;
      } else
        value = new Proxy(
          name === "wrapped-real"
            ? own()
            : name === "forged-prototype"
              ? Object.create(sdk.HierError.prototype)
              : Object.create(null),
          traps,
        );
      let result;
      assert.doesNotThrow(() => {
        result = sdk.isHierError(value);
      });
      assert.equal(typeof result, "boolean");
      assert.equal(probes, 0);
    },
  );
add(
  "ID-core-error",
  "real public SDK receives Core not_found from controlled wire",
  "SDK rejection is actual HierError; predicate true; old error fields preserved, not a DTO imitation",
  () =>
    using(
      async (c) => {
        const p = c.client.source("B-missing", "definition"),
          q = await c.wire.next("obj.source");
        p.catch(() => {});
        c.wire.fail(q, "not_found", { B: "wire original" });
        let e;
        try {
          await p;
        } catch (x) {
          e = x;
        }
        assert.equal(sdk.isHierError(e), true);
        assert.ok(e instanceof sdk.HierError);
        assert.equal(e, c.calls[0].error);
        assert.equal(e.code, "not_found");
        assert.equal(e.origin, "core");
        assert.deepEqual(e.data, { B: "wire original" });
      },
      { withModel: false },
    ),
);
add(
  "ID-transport-error",
  "controlled public SDK close with original transport HierError",
  "same original rejection identity, predicate true; no conversion to another object",
  () =>
    using(
      async (c) => {
        const p = c.client.source("B", "statement");
        p.catch(() => {});
        await c.wire.next("obj.source");
        const original = new sdk.HierError(
          "transport_closed",
          "transport",
          "B original",
          {},
        );
        c.wire.close(original);
        let e;
        try {
          await p;
        } catch (x) {
          e = x;
        }
        assert.equal(e, original);
        assert.equal(sdk.isHierError(e), true);
      },
      { withModel: false },
    ),
);
