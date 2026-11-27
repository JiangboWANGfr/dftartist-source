import { validateDefinition } from "@hier/protocol-types";
import type { Side, SnapshotId } from "@hier/protocol-types";
import { SelectionError, isSelectionOrigin } from "./selection-types.js";
import type {
  Selection,
  SelectionItem,
  SelectionOptions,
} from "./selection-types.js";

type Fields = Record<string, unknown>;
type InputCode = "invalid_selection" | "invalid_options";

function fields(): Fields {
  return Object.create(null) as Fields;
}

/** Only this boundary touches caller properties. Unknown fields are never enumerated. */
class SelectionInputReader {
  constructor(
    private readonly code: InputCode,
    private readonly isDisposed: () => boolean,
  ) {}

  invalid(message: string): never {
    throw new SelectionError(this.code, message);
  }

  // Keep our lifecycle exception outside the catch: a caller may itself throw
  // SelectionError, which must be wrapped just like any other thrown value.
  read<T>(operation: () => T): T {
    let result: T;
    try {
      result = operation();
    } catch (cause) {
      const error = new SelectionError(
        this.isDisposed() ? "disposed" : this.code,
        "Selection input access threw an exception",
      );
      Object.defineProperty(error, "cause", {
        value: cause,
        writable: true,
        configurable: true,
      });
      throw error;
    }
    if (this.isDisposed())
      throw new SelectionError("disposed", "Selection model is disposed");
    return result;
  }

  record(value: unknown): Fields {
    if (
      value === null ||
      typeof value !== "object" ||
      this.read(() => Array.isArray(value))
    ) {
      this.invalid("Selection input requires a non-array object");
    }
    return value as Fields;
  }

  field(source: Fields, key: string, target: Fields): void {
    if (this.read(() => key in source))
      target[key] = this.read(() => source[key]);
  }

  items(value: unknown): Fields[] {
    if (!this.read(() => Array.isArray(value)))
      this.invalid("Selection items must be an array");
    const source = value as Fields;
    const length = this.read(() => source.length);
    if (
      typeof length !== "number" ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > 0xffffffff
    ) {
      this.invalid("Selection items must have a valid array length");
    }
    const result: Fields[] = [];
    for (let index = 0; index < length; ++index) {
      const key = String(index);
      if (!this.read(() => key in source))
        this.invalid("Selection items cannot contain holes");
      const item = this.record(this.read(() => source[key]));
      const copy = fields();
      this.field(item, "ref", copy);
      this.field(item, "def", copy);
      this.field(item, "bits", copy);
      if ("bits" in copy) {
        const bits = this.record(copy.bits);
        const bitsCopy = fields();
        this.field(bits, "lsb", bitsCopy);
        this.field(bits, "width", bitsCopy);
        copy.bits = bitsCopy;
      }
      this.field(item, "side", copy);
      result.push(copy);
    }
    return result;
  }
}

export function readSelectionOptions(
  options: SelectionOptions | undefined,
): Required<Pick<SelectionOptions, "historyLimit">> &
  Pick<SelectionOptions, "snapshotId"> {
  const reader: SelectionInputReader = new SelectionInputReader(
    "invalid_options",
    () => false,
  );
  const copy = fields();
  if (options !== undefined) {
    const source = reader.record(options);
    reader.field(source, "snapshotId", copy);
    reader.field(source, "historyLimit", copy);
  }
  // Validation sees only captured values, after all declared option reads.
  if (
    "snapshotId" in copy &&
    (typeof copy.snapshotId !== "string" ||
      !validateDefinition("SnapshotId", copy.snapshotId))
  ) {
    reader.invalid("snapshotId must be a nonempty string");
  }
  const historyLimit = "historyLimit" in copy ? copy.historyLimit : 128;
  if (
    typeof historyLimit !== "number" ||
    !validateDefinition("PositiveInt", historyLimit)
  ) {
    reader.invalid("historyLimit must be a positive safe integer");
  }
  return {
    historyLimit,
    ...("snapshotId" in copy
      ? { snapshotId: copy.snapshotId as SnapshotId }
      : {}),
  };
}

function normalizeItem(
  copy: Fields,
  reader: SelectionInputReader,
): SelectionItem {
  if ("def" in copy) {
    if (
      "ref" in copy ||
      "bits" in copy ||
      "side" in copy ||
      typeof copy.def !== "string" ||
      !validateDefinition("DefRef", copy.def)
    ) {
      reader.invalid(
        "A definition selection requires only a valid def address",
      );
    }
    return Object.freeze({ def: copy.def });
  }
  if (
    typeof copy.ref !== "string" ||
    !validateDefinition("ObjectRef", copy.ref)
  )
    reader.invalid("An object selection requires a valid ref address");
  let bits;
  if ("bits" in copy) {
    const captured = copy.bits as Fields;
    if (
      typeof captured.lsb !== "number" ||
      typeof captured.width !== "number" ||
      !validateDefinition("UInt", captured.lsb) ||
      !validateDefinition("UInt", captured.width)
    ) {
      reader.invalid(
        "Selection bits require nonnegative safe integer lsb and width",
      );
    }
    bits = Object.freeze({ lsb: captured.lsb, width: captured.width });
  }
  if (
    "side" in copy &&
    (typeof copy.side !== "string" || !validateDefinition("Side", copy.side))
  )
    reader.invalid("Selection side must be inside or outside");
  return Object.freeze({
    ref: copy.ref,
    ...(bits === undefined ? {} : { bits }),
    ...("side" in copy ? { side: copy.side as Side } : {}),
  });
}

function itemKey(item: SelectionItem): string {
  // Only validated primitives from our own records reach JSON.stringify.
  return JSON.stringify(
    "def" in item
      ? ["def", item.def]
      : [
          "ref",
          item.ref,
          item.bits ? [item.bits.lsb, item.bits.width] : null,
          item.side ?? null,
        ],
  );
}

export function readSelection(
  input: Selection,
  isDisposed: () => boolean,
): Selection {
  const reader: SelectionInputReader = new SelectionInputReader(
    "invalid_selection",
    isDisposed,
  );
  const source = reader.record(input);
  const copy = fields();
  reader.field(source, "snapshotId", copy);
  reader.field(source, "origin", copy);
  reader.field(source, "items", copy);
  const capturedItems = reader.items(copy.items);

  if (
    "snapshotId" in copy &&
    (typeof copy.snapshotId !== "string" ||
      !validateDefinition("SnapshotId", copy.snapshotId))
  )
    reader.invalid("snapshotId must be a nonempty string");
  if (!isSelectionOrigin(copy.origin)) {
    reader.invalid("Selection origin is invalid");
  }
  const items: SelectionItem[] = [];
  const seen = new Set<string>();
  for (const captured of capturedItems) {
    const item = normalizeItem(captured, reader);
    const key = itemKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return Object.freeze({
    items: Object.freeze(items),
    origin: copy.origin,
    ...("snapshotId" in copy
      ? { snapshotId: copy.snapshotId as SnapshotId }
      : {}),
  });
}

/** Both operands must already be owned, normalized immutable selections. */
export function sameSelectionItems(left: Selection, right: Selection): boolean {
  return (
    left.items.length === right.items.length &&
    left.items.every(
      (item, index) => itemKey(item) === itemKey(right.items[index]!),
    )
  );
}
