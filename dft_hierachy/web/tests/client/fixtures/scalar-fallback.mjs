// A compatibility execution only: preload the same production Unicode module
// with the optional native capability absent, then restore the global descriptor.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const descriptor = Object.getOwnPropertyDescriptor(String.prototype, "isWellFormed");
const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const target = root ? pathToFileURL(join(root, "unicode.js"))
  : new URL("../../../packages/client/dist/unicode.js", import.meta.url);
try {
  Object.defineProperty(String.prototype, "isWellFormed", { configurable: true, writable: true, value: undefined });
  assert.equal(typeof String.prototype.isWellFormed, "undefined");
  assert.equal(typeof (await import(target)).assertScalarString, "function");
} finally {
  if (descriptor) Object.defineProperty(String.prototype, "isWellFormed", descriptor);
  else delete String.prototype.isWellFormed;
}
assert.deepEqual(Object.getOwnPropertyDescriptor(String.prototype, "isWellFormed"), descriptor);
console.log("A scalar compatibility: capability absent at module initialization; original descriptor restored");
