type Fields = Record<string, unknown>;
export interface JSONInputReader {
  read<T>(operation: () => T): T;
  invalid(message: string): never;
}

/** Copy JSON once, without invoking toJSON/iterators or retaining caller objects.
 * Iterative frames also support deeply nested Core extension data. */
export function captureJSON(input: unknown, reader: JSONInputReader, label: string): unknown {
  interface Frame {
    source: object;
    target: Fields;
    keys: string[];
    index: number;
    array: boolean;
  }
  const frames: Frame[] = [];
  const copies = new Map<object, object>();
  const active = new Set<object>();
  const copy = (value: unknown): unknown => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || value === null)
      reader.invalid(`${label} input must be finite JSON data`);
    if (active.has(value)) reader.invalid(`${label} input cannot contain cycles`);
    const existing = copies.get(value);
    if (existing) return existing;
    const array = reader.read(() => Array.isArray(value));
    const proto = reader.read(() => Object.getPrototypeOf(value));
    if (!array && proto !== Object.prototype && proto !== null)
      reader.invalid(`${label} records must be plain objects`);
    const keys = reader.read(() => Reflect.ownKeys(value));
    let target: object;
    if (array) {
      const length: unknown = reader.read(() => Reflect.get(value, "length"));
      if (
        typeof length !== "number" ||
        !Number.isInteger(length) ||
        length < 0 ||
        length > 0xffffffff
      )
        reader.invalid(`Invalid ${label.toLowerCase()} array length`);
      let count = 0;
      for (const key of keys) if (key !== "length") count++;
      let contiguous = count === length;
      if (contiguous) {
        let index = 0;
        for (const key of keys) {
          if (key === "length") continue;
          if (key !== String(index++)) {
            contiguous = false;
            break;
          }
        }
      }
      if (!contiguous)
        reader.invalid(`${label} arrays must have only contiguous own slots`);
      target = [];
    } else {
      for (const key of keys)
        if (typeof key !== "string") reader.invalid(`${label} input cannot contain symbol fields`);
      target = {};
    }
    copies.set(value, target);
    active.add(value);
    // Keep the original private reflection vector, including an array's length
    // key. Do not mutate a vector the reader may have observed.
    frames.push({ source: value, target: target as Fields, keys: keys as string[], index: 0, array });
    return target;
  };
  const result = copy(input);
  let property: PropertyDescriptor | undefined;
  while (frames.length) {
    const frame = frames[frames.length - 1]!;
    if (frame.index === frame.keys.length) {
      Object.freeze(frame.target);
      active.delete(frame.source);
      frames.pop();
    } else {
      const key = frame.keys[frame.index++]!;
      if (frame.array && key === "length") continue;
      const value = reader.read(() => Reflect.get(frame.source, key));
      const owned = copy(value);
      // defineProperty copies these attributes; targets never retain this
      // descriptor. Each nested/reentrant capture owns its own descriptor.
      if (property) property.value = owned;
      else property = { value: owned, enumerable: true };
      Object.defineProperty(frame.target, key, property);
    }
  }
  return result;
}
