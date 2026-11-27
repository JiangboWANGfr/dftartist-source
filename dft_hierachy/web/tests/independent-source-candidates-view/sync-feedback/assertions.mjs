import { check, equal } from "../pagination/public-model.mjs";
export { check, equal };
export function failure(value, action, error) {
  check(value !== null && typeof value === "object", "actual failure object");
  check(Object.isFrozen(value), "failure shallow frozen");
  equal(value.command, "confirm", "failure command");
  equal(value.action, action, "original failure action");
  equal(value.error, error, "original failure error");
}
export function aggregate(value, error, callbackError) {
  check(value instanceof AggregateError, "actual boundary AggregateError");
  check(Array.isArray(value.errors), "AggregateError errors array");
  equal(value.errors.length, 2, "two boundary errors");
  equal(value.errors[0], error, "first original confirmation error");
  equal(value.errors[1], callbackError, "second original callback throw");
}
export function suppressed(oldCalls, newCalls) {
  equal(oldCalls.length, 0, "old callback suppressed");
  equal(newCalls.length, 0, "new callback not given old failure");
}
