// A regressions for the generated ClientFrame boundary, beyond B's unchanged fixture.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { usingMain } from "../independent-electron-host/electron-input.mjs";
import { snapshot } from "../independent-electron-renderer/fixture.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));

for (const [name, json] of [
  ["literal NDJSON delimiter", '{\n"method":"cancel","params":{"target":1}}'],
  ["non-ClientFrame object", "{}"],
  [
    "rounded non-integer target",
    '{"method":"cancel","params":{"target":1.00000000000000000000000000001}}',
  ],
]) {
  test(`main rejects ${name} before Core write`, () =>
    usingMain(root, async (c) => {
      const o = await c.session();
      await c.connect(o);
      c.dispatch("start", o);
      c.dispatch("send", o, "B-connection", { json });
      const event = await c.next(o, "closed");
      assert.equal(event.error.data.reason, "invalid_frame");
      await o.s.exited;
      assert.equal(o.p.inbox.rows.filter((v) => v.stdin !== undefined).length, 0);
    }));
}
test("main keeps an allowed ClientFrame's original text and fixed approved URL", () =>
  usingMain(root, async (c) => {
    const options = await c.options();
    const o = c.create(options);
    await o.p.ready();
    options.documentUrl = options.documentUrl + "?mutated";
    assert.equal((await c.connect(o)).ok, true);
    c.dispatch("start", o);
    const json = ` { "id": 1e0, "method": "inst.roots", "snapshot": "${snapshot.snapshotId}", "params": {} } `;
    c.dispatch("send", o, "B-connection", { json });
    assert.equal((await o.p.inbox.next((v) => v.stdin !== undefined)).stdin, json);
  }));
