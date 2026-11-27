export function check(value, message) {
  if (!value) throw Error(message);
}
export function equal(actual, expected, message) {
  check(Object.is(actual, expected), message);
}
export class FixturePremiseError extends Error {
  constructor(message) {
    super("B41 fixture premise: " + message);
    this.name = "FixturePremiseError";
  }
}
export function premise(value, message) {
  if (!value) throw new FixturePremiseError(message);
}
export function sameScroll(before, after) {
  equal(after.length, before.length, "same measured scopes");
  for (let i = 0; i < before.length; i++) {
    equal(after[i].name, before[i].name);
    for (const k of ["top", "left"])
      check(
        Math.abs(before[i][k] - after[i][k]) <= 0.5,
        "unchanged " + before[i].name + " " + k,
      );
  }
}
export function retained(before, after) {
  premise(
    Math.abs(before.height - after.height) <= 0.5 &&
      Math.abs(before.width - after.width) <= 0.5,
    "stable port dimensions",
  );
  premise(
    after.maxTop + 0.5 >= before.top && after.maxLeft + 0.5 >= before.left,
    "no legitimate scroll clipping",
  );
  sameScroll(
    [{ name: "list", top: before.top, left: before.left }],
    [{ name: "list", top: after.top, left: after.left }],
  );
}
export function logicalFocus(actual, expected) {
  equal(actual, expected, "current focused original logical tuple");
}
