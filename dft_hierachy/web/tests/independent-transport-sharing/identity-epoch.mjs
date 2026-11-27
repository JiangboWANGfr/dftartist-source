// Exact B oracle for the C-reviewed additive export, not an implementation adapter.
import assert from "node:assert/strict";
export function assertPublicExports(main, node) {
  assert.deepEqual(Object.keys(main).sort(), [
    "CLIENT_PROTOCOL_VERSION",
    "HierClient",
    "HierError",
    "isHierError",
  ]);
  assert.deepEqual(Object.keys(node).sort(), ["createProcessTransport"]);
  assert.equal(main.CLIENT_PROTOCOL_VERSION, 2);
  for (const name of ["HierClient", "HierError", "isHierError"])
    assert.equal(typeof main[name], "function");
  assert.equal(typeof node.createProcessTransport, "function");
}
