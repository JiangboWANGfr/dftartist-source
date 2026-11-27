import {
  mixedText,
  mixedBoundaries,
  bomText,
  bomBoundaries,
} from "../independent-source-document/positions.mjs";
export { mixedText, mixedBoundaries, bomText, bomBoundaries };
export function hostile() {
  const counts = { probes: 0 };
  const boom = () => {
    counts.probes++;
    throw Error("B forbidden input probe");
  };
  return {
    counts,
    value: new Proxy(function () {}, {
      get: boom,
      ownKeys: boom,
      getPrototypeOf: boom,
      getOwnPropertyDescriptor: boom,
    }),
  };
}
export function impostors(doc) {
  const h = hostile(),
    r = Proxy.revocable({}, {});
  r.revoke();
  return [
    ["undefined", undefined],
    ["null", null],
    ["number", 7],
    ["string", "B"],
    ["bool", false],
    ["symbol", Symbol("B")],
    ["bigint", 1n],
    ["empty", {}],
    ["array", []],
    ["clone", { ...doc }],
    ["proxy", new Proxy(doc, {})],
    ["hostile", h.value],
    ["revoked", r.proxy],
    ["inheriting", Object.create(doc)],
  ].map(([id, value]) => ({ id, value, counts: h.counts }));
}
export function badOffsets() {
  const h = hostile();
  return {
    counts: h.counts,
    values: [
      ["missing", undefined],
      ["null", null],
      ["negative", -1],
      ["fraction", 0.5],
      ["nan", NaN],
      ["infinity", Infinity],
      ["unsafe", Number.MAX_SAFE_INTEGER + 1],
      ["string", "0"],
      ["boxed", new Number(0)],
      ["object", h.value],
      ["past-end", 999],
      ["surrogate", 4],
      ["crlf", 6],
    ],
  };
}
