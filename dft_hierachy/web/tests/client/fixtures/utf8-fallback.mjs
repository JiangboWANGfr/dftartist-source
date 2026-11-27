// A compatibility execution on the current runtime, not an old-browser claim.
import assert from "node:assert/strict";
const descriptor = Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encodeInto");
try {
  Object.defineProperty(TextEncoder.prototype, "encodeInto", { configurable: true, value: undefined });
  const { utf8ByteLength } = await import("../../../packages/client/dist/utf8-byte-length.js");
  assert.equal(utf8ByteLength("位🙂"), 7);
} finally {
  if (descriptor) Object.defineProperty(TextEncoder.prototype, "encodeInto", descriptor);
  else delete TextEncoder.prototype.encodeInto;
}
assert.deepEqual(Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encodeInto"), descriptor);
