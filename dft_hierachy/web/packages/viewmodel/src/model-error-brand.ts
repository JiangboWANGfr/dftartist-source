// Internal identity, separate from public instanceof/prototype semantics.
const brands = new WeakMap<object, object>();

export function registerModelError(error: Error, errorClass: object): void {
  brands.set(error, errorClass);
}

export function hasModelErrorBrand(
  value: unknown,
  errorClass: object,
): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    brands.get(value) === errorClass
  );
}
