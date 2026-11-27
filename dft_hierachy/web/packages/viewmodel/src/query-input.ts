export type InputFields = Record<string, unknown>;

/** Own-property reads check disposal without inspecting caller-thrown values. */
export class QueryInput<Code extends string> {
  constructor(
    private readonly errorType: new (
      code: Code | "disposed",
      message: string,
    ) => Error,
    private readonly code: Code,
    private readonly label: string,
    private readonly isDisposed: () => boolean,
  ) {}

  assertActive(): void {
    if (this.isDisposed())
      throw new this.errorType("disposed", `${this.label} model is disposed`);
  }

  invalid(message: string): never {
    throw new this.errorType(this.code, message);
  }

  read<T>(operation: () => T): T {
    let value: T;
    try {
      value = operation();
    } catch (cause) {
      // Caller-thrown values are opaque, including model errors and proxies.
      const error = new this.errorType(
        this.isDisposed() ? "disposed" : this.code,
        `${this.label} input access threw an exception`,
      );
      Object.defineProperty(error, "cause", {
        value: cause,
        writable: true,
        configurable: true,
      });
      throw error;
    }
    this.assertActive();
    return value;
  }

  record(value: unknown): InputFields {
    if (
      value === null ||
      typeof value !== "object" ||
      this.read(() => Array.isArray(value))
    )
      this.invalid(`${this.label} input requires a non-array object`);
    return value as InputFields;
  }

  field(source: InputFields, key: string, captured: InputFields): void {
    const descriptor = this.read(() =>
      Object.getOwnPropertyDescriptor(source, key),
    );
    if (descriptor !== undefined)
      captured[key] = this.read(() => Reflect.get(source, key));
  }
}
