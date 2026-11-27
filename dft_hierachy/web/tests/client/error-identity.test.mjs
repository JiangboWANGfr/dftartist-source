import assert from "node:assert/strict";
import { test } from "node:test";
import { HierError, isHierError } from "@hier/client";

test("A: error identity preserves constructed errors and ordinary subclass behavior", () => {
  class ApplicationError extends HierError {
    static is() {
      return "application predicate";
    }
  }
  const original = new HierError("internal", "core", "original");
  const child = new ApplicationError("cancelled", "client", "child");
  assert.equal(isHierError(original), true);
  assert.equal(isHierError(child), true);
  assert.equal(child instanceof HierError, true);
  assert.equal(ApplicationError.is(), "application predicate");
  const forged = Object.create(HierError.prototype);
  assert.equal(forged instanceof HierError, true);
  assert.equal(isHierError(forged), false);
});

test("A: error identity does not probe arbitrary or revoked values", () => {
  let probes = 0;
  const trap = () => {
    probes++;
    throw Error("must not inspect");
  };
  const opaque = new Proxy(
    {},
    { get: trap, getPrototypeOf: trap, ownKeys: trap },
  );
  const wrapped = new Proxy(new HierError("internal", "core", "wrapped"), {
    get: trap,
    getPrototypeOf: trap,
    ownKeys: trap,
  });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [
    undefined,
    null,
    1,
    "error",
    Symbol(),
    {},
    () => {},
    new Error(),
    opaque,
    wrapped,
    revoked.proxy,
  ])
    assert.equal(isHierError(value), false);
  assert.equal(probes, 0);
});
