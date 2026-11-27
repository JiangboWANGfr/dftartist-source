// Existing SourceDocument validation controls, not queryAt runtime.
// Illegal scalar strings cannot cross the ordinary SDK wire (DESIGN §5.6.2).
// L6 whole-text controls therefore explicitly fault-inject the public method
// result AFTER the real SDK has accepted a legal wire reply. No model substitute.
import test from "node:test";
import assert from "node:assert/strict";
import { boot, H } from "./harness.mjs";
await boot(false);
const invalidTexts = [
  ["tail-high", "A\uD800"],
  ["tail-low", "A\uDC00"],
  ["embedded-high", "A\uD800B"],
];
for (const [name, text] of [...invalidTexts, ["terminal-pair-ok", "A😀"]])
  test("old whole-text validity: " + name, () =>
    H.using(async (c) => {
      const fault = name !== "terminal-pair-ok";
      if (fault) {
        const realRead = c.client.readSource;
        c.client.readSource = function (...args) {
          return Reflect.apply(realRead, this, args).then((reply) =>
            Object.freeze({
              ...reply,
              result: Object.freeze({ ...reply.result, text }),
            }),
          );
        };
      }
      const t = await H.second(
        c,
        await H.begin(c),
        H.span(H.point(0), H.point(0)),
      );
      c.wire.ok(t.r, H.read(fault ? "A" : text));
      if (name === "terminal-pair-ok") {
        await H.success(t.o);
        assert.equal(c.m.state.status, "success");
        assert.equal(c.m.state.data.content.result.text, text);
      } else {
        const e = await H.failure(t.o, "inconsistent_reply");
        assert.ok(e instanceof H.vm.SourceDocumentError);
        assert.equal(c.m.state.status, "failed");
        const readCall = c.calls.find((x) => x.method === "readSource");
        assert.equal(readCall.reply.result.text, "A");
        assert.equal(readCall.error, undefined);
      }
    }),
  );
for (const [name, text] of invalidTexts)
  test("ordinary wire rejects illegal scalar before L6: " + name, () =>
    H.using(async (c) => {
      const t = await H.second(
        c,
        await H.begin(c),
        H.span(H.point(0), H.point(0)),
      );
      c.wire.ok(t.r, H.read(text));
      const e = await H.failure(t.o, "protocol_error");
      assert.ok(e instanceof H.sdk.HierError);
      assert.equal(c.m.state.status, "failed");
      assert.equal(e, c.calls.find((x) => x.method === "readSource").error);
    }),
  );
for (const [name, start, end] of [
  [
    "wrong-line",
    { offset: 0, line: 2, column: 1 },
    { offset: 0, line: 2, column: 1 },
  ],
  [
    "wrong-column",
    { offset: 0, line: 1, column: 2 },
    { offset: 0, line: 1, column: 2 },
  ],
])
  test("old source point validity: " + name, () =>
    H.using(async (c) => {
      const t = await H.second(c, await H.begin(c), H.span(start, end));
      c.wire.ok(t.r, H.read("A"));
      await H.failure(t.o, "inconsistent_reply");
      assert.equal(c.m.state.status, "failed");
    }),
  );
