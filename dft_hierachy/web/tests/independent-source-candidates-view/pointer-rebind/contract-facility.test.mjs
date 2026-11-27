// Normative facility regression, frozen before repair: no product implementation oracle.
import test from "node:test";
import assert from "node:assert/strict";
import { confirmation, feedback } from "./assertions.mjs";
test("B37-C01 shallow-frozen public failure need not have enumerable fields", () => {
  const action = {},
    error = Error("original command error"),
    failure = Object.freeze(
      Object.defineProperties(
        {},
        {
          command: { value: "confirm" },
          action: { value: action },
          error: { value: error },
        },
      ),
    );
  assert.equal(
    Object.keys(failure).length,
    0,
    "legal non-enumerable positive control",
  );
  assert.doesNotThrow(
    () => feedback([failure], action, error, true),
    "DESIGN 6.18.5 promises values and shallow freeze, not enumerability",
  );
});
test("B37-C02 removed original row paired click has zero confirmations", () => {
  assert.doesNotThrow(
    () => confirmation([], {}, {}, {}, false, 0),
    "DESIGN 6.18.3 original row removed: paired click does not issue a command",
  );
});
