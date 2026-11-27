import { validateDefinition, type WireDefinitions } from "@hier/protocol-types";

export type WireNumberEvidence = Map<string, true | WireNumberEvidence>;
type Evidence = { numbers: WireNumberEvidence; view?: unknown };
const evidence = new WeakMap<object, Evidence>();
// No JSON type can accidentally accept this value. Unconstrained extension fields
// remain ignored by the generated schema; the actual delivered values stay intact.
const roundedFraction = Symbol("non-integer JSON token rounded to an integer");

/** Syntax was checked by JSON.parse. No exponentiation or rounded mantissa needed. */
export function integerToken(token: string): boolean {
  const point = token.indexOf(".");
  let exponent = token.indexOf("e");
  if (exponent < 0) exponent = token.indexOf("E");
  if (point < 0 && exponent < 0) return true;
  const end = exponent < 0 ? token.length : exponent;
  let last = end - 1;
  while (last >= 0 && (token[last] === "0" || token[last] === ".")) last--;
  if (last < 0 || (last === 0 && token[0] === "-")) return true;
  // A decimal point crossed while walking the zero tail is not a digit.
  const trailingZeros = end - 1 - last - (point >= 0 && last < point ? 1 : 0);
  const fractionLength = point < 0 ? 0 : end - point - 1;
  // Exponents larger than Number's range are still unambiguously above/below
  // this threshold, which is bounded by the finite source token length.
  return (
    (exponent < 0 ? 0 : Number(token.slice(exponent + 1))) >= fractionLength - trailingZeros
  );
}

export function rememberWireNumbers(frame: object, numbers: WireNumberEvidence): void {
  if (numbers.size) evidence.set(frame, { numbers });
}

/** Keep byte-level evidence across the client's owning JSON snapshot. */
export function copyWireNumbers(source: unknown, snapshot: object): void {
  if (source !== null && typeof source === "object") {
    const found = evidence.get(source);
    if (found) evidence.set(snapshot, { numbers: found.numbers });
  }
}

function validationView(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const found = evidence.get(value);
  if (!found) return value;
  if (found.view) return found.view;
  const copy = (object: object): Record<string, unknown> =>
    (Array.isArray(object) ? object.slice() : { ...object }) as Record<string, unknown>;
  const root = copy(value);
  const pending = [
    { original: value as Record<string, unknown>, view: root, numbers: found.numbers },
  ];
  while (pending.length) {
    const { original, view, numbers } = pending.pop()!;
    for (const [key, nested] of numbers) {
      const child = original[key];
      if (nested === true || child === null || typeof child !== "object") {
        Object.defineProperty(view, key, {
          value: roundedFraction,
          enumerable: true,
          configurable: true,
        });
      } else {
        const next = copy(child);
        Object.defineProperty(view, key, { value: next, enumerable: true, configurable: true });
        pending.push({ original: child as Record<string, unknown>, view: next, numbers: nested });
      }
    }
  }
  found.view = root;
  return root;
}

/** Same generated rules, with original numeric integrality at the wire boundary. */
export function validateWireDefinition<N extends keyof WireDefinitions>(
  name: N,
  value: unknown,
): value is WireDefinitions[N] {
  return validateDefinition(name, validationView(value));
}
