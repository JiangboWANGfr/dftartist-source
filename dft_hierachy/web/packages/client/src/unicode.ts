// Keep the existing runtime range: older hosts use the same UTF-16 pair check.
const nativeWellFormed = (
  String.prototype as String & { isWellFormed?: (this: string) => boolean }
).isWellFormed;
const scalarStringError = "Expected a Unicode scalar string";

/** Wire strings contain Unicode scalar values, without normalization or repair. */
export function assertScalarString(value: string): void {
  if (typeof nativeWellFormed === "function") {
    if (!nativeWellFormed.call(value)) throw new TypeError(scalarStringError);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit < 0xd800 || unit > 0xdfff) continue;
    if (unit <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        i++;
        continue;
      }
    }
    throw new TypeError(scalarStringError);
  }
}
