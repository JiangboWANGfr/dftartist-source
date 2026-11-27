// Public-header/type parity only: this does NOT claim JSON Schema coverage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PROTOCOL_VERSION } from "@hier/protocol-types";

test("public TypeScript and C++ protocol versions match DESIGN 5.2", () => {
  const header = readFileSync(new URL("../../../core/protocol/include/hier/protocol/Json.h",
                                    import.meta.url), "utf8");
  const match = header.match(/kProtocolVersion\s*=\s*(\d+)/);
  assert.ok(match, "C++ public protocol version is required");
  assert.equal(PROTOCOL_VERSION, 2);
  assert.equal(PROTOCOL_VERSION, Number(match[1]));
});
