import type { HierError } from "@hier/client";
import type { TreeDiagnosticIssue, TreeFailure } from "./tree-types.js";

interface DiagnosticPath {
  readonly parent: DiagnosticPath | undefined;
  readonly key: string;
}
interface DiagnosticFrame {
  readonly source: object;
  readonly owned: object;
  readonly path: DiagnosticPath | undefined;
  readonly keys: readonly (string | symbol)[];
  index: number;
}

/** Shared owned diagnostic data; DESIGN 6.6.6. Never calls or freezes a source. */
export function captureDiagnosticData(
  error: HierError,
  isDisposed: () => boolean,
): Pick<TreeFailure, "data" | "dataIssue"> | undefined {
  const empty = Object.freeze({});
  const stopped = Symbol();
  let dataIssue: TreeDiagnosticIssue | undefined;
  const read = <T>(
    operation: TreeDiagnosticIssue["operation"],
    path: DiagnosticPath | undefined,
    access: () => T,
  ): T => {
    let value!: T;
    let failed = false;
    try {
      value = access();
    } catch {
      // Arbitrary thrown values must never be inspected, retained or coerced.
      failed = true;
    }
    if (isDisposed()) throw stopped;
    if (failed) {
      const keys: string[] = [];
      for (let part = path; part; part = part.parent) keys.push(part.key);
      dataIssue = Object.freeze({
        code: "data_read_failed",
        operation,
        path: Object.freeze(keys.reverse()),
      });
      throw stopped;
    }
    return value;
  };
  const copies = new Map<object, object>();
  const pending: DiagnosticFrame[] = [];
  const copy = (value: unknown, path: DiagnosticPath | undefined): unknown => {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    )
      return value;
    // Functions contribute diagnostic fields too; capture them without calling
    // the source or retaining its mutable properties through a function alias.
    const existing = copies.get(value);
    if (existing) return existing;
    const array = read("inspect", path, () => Array.isArray(value));
    const owned: object = array
      ? read("read", { parent: path, key: "length" }, () => {
          const length: unknown = Reflect.get(value, "length");
          // Check lifecycle before using a Proxy's length, including invalid values.
          if (isDisposed()) return [];
          if (
            typeof length !== "number" ||
            !Number.isInteger(length) ||
            length < 0 ||
            length > 0xffffffff
          )
            throw new TypeError("Invalid diagnostic array length");
          return new Array(length);
        })
      : {};
    copies.set(value, owned);
    pending.push({
      source: value,
      owned,
      path,
      keys: read("enumerate", path, () => Reflect.ownKeys(value)),
      index: 0,
    });
    return owned;
  };
  try {
    const data = copy(
      read("read", undefined, () => error.data),
      undefined,
    );
    // Depth first: finish a field before accessing the next one, even on ancestors.
    // Frames and linked paths avoid recursion limits and quadratic path copying.
    while (pending.length) {
      const frame = pending[pending.length - 1]!;
      if (frame.index === frame.keys.length) {
        Object.freeze(frame.owned);
        pending.pop();
        continue;
      }
      const key = frame.keys[frame.index++]!;
      if (typeof key !== "string") continue;
      const path = { parent: frame.path, key };
      const descriptor = read("inspect", path, () =>
        Object.getOwnPropertyDescriptor(frame.source, key),
      );
      if (!descriptor?.enumerable) continue;
      const value = read("read", path, () => Reflect.get(frame.source, key));
      Object.defineProperty(frame.owned, key, {
        value: copy(value, path),
        enumerable: true,
      });
    }
    return Object.freeze({ data: data as TreeFailure["data"] });
  } catch (caught) {
    if (caught !== stopped) throw caught;
    if (isDisposed()) return undefined;
    return Object.freeze({ data: empty, dataIssue: dataIssue! });
  }
}
