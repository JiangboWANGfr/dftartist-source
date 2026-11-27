import { validateDefinition } from "@hier/protocol-types";
import { assertScalarString } from "./unicode.js";
import {
  integerToken,
  rememberWireNumbers,
  validateWireDefinition,
  type WireNumberEvidence,
} from "./wire-numbers.js";

function readWireText(text: string): {
  frame: object;
  numbers: WireNumberEvidence | undefined;
} {
  const frame: unknown = JSON.parse(text);
  if (!frame || typeof frame !== "object" || Array.isArray(frame))
    throw new SyntaxError("NDJSON frame must be an object");
  const numbers = inspectTokens(text);
  if (numbers) rememberWireNumbers(frame, numbers);
  return { frame, numbers };
}

/** Decode raw JSON text; the SDK validates its schema with retained lexical evidence. */
export function decodeWireText(text: string): object {
  return readWireText(text).frame;
}

/** Node's established transport boundary additionally checks generic frame numbers. */
export function decodeWireFrame(text: string): object {
  const { frame, numbers } = readWireText(text);
  if (
    numbers &&
    validateDefinition("ServerFrame", frame) &&
    !validateWireDefinition("ServerFrame", frame)
  )
    throw new SyntaxError("Non-integer JSON token in a wire integer field");
  return frame;
}

// JSON.parse checks grammar; this iterative scan preserves facts it discards:
// decoded duplicate keys and non-integers that Number rounds to integers.
// Check scalar strings here too, before any unknown key/value can be ignored.
function inspectTokens(text: string): WireNumberEvidence | undefined {
  type Container = {
    keys: string[] | Set<string> | null;
    key: string;
    index: number;
    parentKey: string;
    numbers: WireNumberEvidence | undefined;
  };
  const stack: Container[] = [];
  let root: WireNumberEvidence | undefined;
  const takeKey = (): string => {
    const parent = stack.at(-1);
    if (!parent) return "";
    return parent.keys ? parent.key : String(parent.index++);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{" || c === "[") {
      const parentKey = takeKey();
      stack.push({
        keys: c === "{" ? [] : null,
        key: "",
        index: 0,
        parentKey,
        numbers: undefined,
      });
    } else if (c === "}" || c === "]") {
      const finished = stack.pop()!;
      if (!stack.length) root = finished.numbers;
      else if (finished.numbers?.size) {
        const parent = stack.at(-1)!;
        (parent.numbers ??= new Map()).set(finished.parentKey, finished.numbers);
      }
    } else if (c === '"') {
      const start = i;
      i = text.indexOf('"', start + 1);
      // JSON.parse already checked grammar. An odd preceding backslash run
      // escapes this quote; each candidate and its run are visited only once.
      for (;;) {
        let slashStart = i;
        while (text.charCodeAt(slashStart - 1) === 92) slashStart--;
        if ((i - slashStart) % 2 === 0) break;
        i = text.indexOf('"', i + 1);
      }
      let next = i + 1;
      while (next < text.length) {
        const code = text.charCodeAt(next);
        if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
        next++;
      }
      const isKey = text[next] === ":";
      // Grammar was checked for the whole frame. Unescaped values need only
      // scalar validation; this temporary slice is never retained as evidence.
      // Decode keys separately so evidence keys cannot borrow the frame text.
      if (!isKey) {
        const body = text.slice(start + 1, i);
        if (!body.includes("\\")) {
          assertScalarString(body);
          takeKey();
          continue;
        }
      }
      const value: string = JSON.parse(text.slice(start, i + 1));
      assertScalarString(value);
      if (isKey) {
        const key = value;
        const container = stack.at(-1)!;
        const keys = container.keys!;
        if (Array.isArray(keys)) {
          if (keys.includes(key)) throw new SyntaxError("Duplicate JSON object key");
          // Small schema objects avoid a hash table; wide extension objects
          // promote once so their duplicate checks retain the Set path.
          if (keys.length < 12) keys.push(key);
          else {
            const promoted = new Set(keys);
            promoted.add(key);
            container.keys = promoted;
          }
        } else {
          if (keys.has(key)) throw new SyntaxError("Duplicate JSON object key");
          keys.add(key);
        }
        container.key = key;
      } else takeKey();
    } else if (c === "-" || (c! >= "0" && c! <= "9")) {
      const start = i;
      while (i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (
          (next >= 48 && next <= 57) ||
          next === 46 ||
          next === 101 ||
          next === 69 ||
          next === 43 ||
          next === 45
        )
          i++;
        else break;
      }
      const token = text.slice(start, i + 1),
        key = takeKey();
      // Exact integer spellings need no rounding check or retained evidence.
      if (!integerToken(token) && Number.isInteger(Number(token))) {
        const parent = stack.at(-1)!;
        (parent.numbers ??= new Map()).set(key, true);
      }
    } else if (c === "t" || c === "f" || c === "n") {
      takeKey();
      i += c === "f" ? 4 : 3;
    }
  }
  return root;
}
