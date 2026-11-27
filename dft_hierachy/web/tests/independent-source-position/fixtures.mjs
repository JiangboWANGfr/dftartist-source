// Hand-calculated [UTF16 absolute offset, line, UTF8 byte column] tables.
import {
  mixedText,
  mixedBoundaries,
  bomText,
  bomBoundaries,
} from "../independent-source-document/positions.mjs";
export const texts = [
  { id: "empty", text: "", valid: [[0, 1, 1]], invalid: [] },
  {
    id: "ascii-tab-final-LF",
    text: "A\tZ\n",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [2, 1, 3],
      [3, 1, 4],
      [4, 2, 1],
    ],
    invalid: [],
  },
  {
    id: "bmp",
    text: "中β",
    valid: [
      [0, 1, 1],
      [1, 1, 4],
      [2, 1, 6],
    ],
    invalid: [],
  },
  {
    id: "astral",
    text: "A😀Z",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [3, 1, 6],
      [4, 1, 7],
    ],
    invalid: [2],
  },
  {
    id: "combining",
    text: "e\u0301",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [2, 1, 4],
    ],
    invalid: [],
  },
  {
    id: "BOM",
    text: "\uFEFFx",
    valid: [
      [0, 1, 1],
      [1, 1, 4],
      [2, 1, 5],
    ],
    invalid: [],
  },
  {
    id: "CRLF",
    text: "a\r\nb",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [3, 2, 1],
      [4, 2, 2],
    ],
    invalid: [2],
  },
  {
    id: "CR",
    text: "a\rb",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [2, 2, 1],
      [3, 2, 2],
    ],
    invalid: [],
  },
  {
    id: "LF",
    text: "a\nb",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [2, 2, 1],
      [3, 2, 2],
    ],
    invalid: [],
  },
  {
    id: "empty-lines",
    text: "\r\n\n\r",
    valid: [
      [0, 1, 1],
      [2, 2, 1],
      [3, 3, 1],
      [4, 4, 1],
    ],
    invalid: [1],
  },
  {
    id: "unicode-separators",
    text: "s\u2028\u2029",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [2, 1, 5],
      [3, 1, 8],
    ],
    invalid: [],
  },
  {
    id: "NUL-scalar",
    text: "\u0000x",
    valid: [
      [0, 1, 1],
      [1, 1, 2],
      [2, 1, 3],
    ],
    invalid: [],
  },
  {
    id: "old-B-mixed",
    text: mixedText,
    valid: mixedBoundaries.map(([, line, col, offset]) => [offset, line, col]),
    invalid: [5, 9],
  },
  {
    id: "old-B-bom",
    text: bomText,
    valid: bomBoundaries.map(([, line, col, offset]) => [offset, line, col]),
    invalid: [3, 5],
  },
  {
    id: "terminal-astral",
    text: "😀",
    valid: [
      [0, 1, 1],
      [2, 1, 5],
    ],
    invalid: [1],
  },
  {
    id: "long-lines",
    text: "\t中😀\r\n".repeat(4096),
    valid: [
      [0, 1, 1],
      [24576, 4097, 1],
    ],
    invalid: [],
  },
];
export function poison(counts = { probes: 0 }, callable = false) {
  const hook = () => {
    counts.probes++;
    throw Error("B forbidden caller probe");
  };
  return new Proxy(callable ? () => {} : {}, {
    get: hook,
    set: hook,
    ownKeys: hook,
    getOwnPropertyDescriptor: hook,
    getPrototypeOf: hook,
    has: hook,
    isExtensible: hook,
    apply: hook,
    construct: hook,
  });
}
export const impostors = [
  ["undefined", () => undefined],
  ["null", () => null],
  ["number", () => 0],
  ["string", () => ""],
  ["bool", () => false],
  ["symbol", () => Symbol("B")],
  ["bigint", () => 1n],
  ["empty", () => ({})],
  ["array", () => []],
  ["function", () => () => {}],
  ["clone", (doc) => structuredClone(doc)],
  ["original-proxy", (doc) => new Proxy(doc, {})],
  ["poison", (doc, n) => poison(n)],
  ["callable-proxy", (doc, n) => poison(n, true)],
  [
    "revoked",
    () => {
      const p = Proxy.revocable({}, {});
      p.revoke();
      return p.proxy;
    },
  ],
  ["inheriting", (doc) => Object.create(doc)],
];
export const invalidOffsets = [
  ["undefined", () => undefined],
  ["null", () => null],
  ["string", () => "0"],
  ["bool", () => false],
  ["negative", () => -1],
  ["fraction", () => 0.5],
  ["NaN", () => NaN],
  ["Infinity", () => Infinity],
  ["negative-Infinity", () => -Infinity],
  ["unsafe", () => Number.MAX_SAFE_INTEGER + 1],
  ["safe-but-beyond", () => Number.MAX_SAFE_INTEGER],
  ["boxed", () => new Number(0)],
  ["object", (n) => poison(n)],
  ["function", (n) => poison(n, true)],
  ["symbol", () => Symbol("B")],
  ["bigint", () => 0n],
  ["array", () => [0]],
];
