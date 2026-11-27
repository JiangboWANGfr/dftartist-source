import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { FrameInbox as LegacyInbox } from "../../packages/client/dist/node/frame-inbox.js";
import { FrameInbox } from "../../packages/client/dist/frame-inbox.js";

let script;
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        export { decodeWireFrame } from "../../packages/client/dist/wire-frame.js";
        export { FrameInbox } from "../../packages/client/dist/frame-inbox.js";
        export { validateWireDefinition } from "../../packages/client/dist/wire-numbers.js";
      `,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "SharedFrames",
    write: false,
    metafile: true,
  });
  for (const input of Object.keys(bundle.metafile.inputs))
    assert.doesNotMatch(input, /(?:\/node\/|node_modules\/(?:ajv|electron))/);
  for (const output of Object.values(bundle.metafile.outputs)) assert.deepEqual(output.imports, []);
  script = bundle.outputFiles[0].text;
});

// A fresh JS realm with web-compatible scheduling, no Node globals or module loader.
// This verifies the platform boundary; it does not claim an actual browser/IPC run.
function sharedFrames() {
  const context = createContext({ queueMicrotask });
  runInContext(script, context);
  assert.equal(
    runInContext(
      "[typeof Buffer, typeof process, typeof require].every(v => v === 'undefined')",
      context,
    ),
    true,
  );
  return runInContext("SharedFrames", context);
}
const diagnostics = (count) =>
  `{"id":1,"ok":true,"result":{"errorCount":${count},"warningCount":0,"truncated":false,"items":[],"extra":1.25},"completeness":{"status":"complete","reasons":[]}}`;

test("A: shared frame decoder preserves wire evidence without Node globals", () => {
  const { decodeWireFrame, validateWireDefinition } = sharedFrames();
  const rounded = decodeWireFrame(diagnostics("1.0000000000000001"));
  assert.equal(rounded.result.errorCount, 1);
  assert.equal(validateWireDefinition("DesignDiagnosticsResponse", rounded), false);
  for (const count of ["1", "1.0", "1e0"])
    assert.equal(
      validateWireDefinition("DesignDiagnosticsResponse", decodeWireFrame(diagnostics(count))),
      true,
    );
  for (const [invalid, name] of [
    ['{"key":1,"k\\u0065y":2}', "SyntaxError"],
    ['{"extra":"\\ud800"}', "TypeError"],
    ["[]", "SyntaxError"],
  ])
    assert.throws(
      () => decodeWireFrame(invalid),
      (error) => error.name === name,
    );
});

test("A: shared inbox keeps asynchronous delivery and evidence in a Node-free realm", async () => {
  // Existing frozen probes retain exactly the same class, not a copied queue.
  assert.equal(LegacyInbox, FrameInbox);
  const { FrameInbox: Inbox, decodeWireFrame, validateWireDefinition } = sharedFrames();
  const queue = new Inbox(() => assert.fail("unexpected overflow"));
  const frame = decodeWireFrame(diagnostics("1.0000000000000001"));
  const received = [];
  queue.push(frame, new TextEncoder().encode(diagnostics("1.0000000000000001")).length);
  const off = queue.bind((value) => received.push(value));
  assert.equal(received.length, 0);
  await new Promise(queueMicrotask);
  assert.equal(received.length, 1);
  assert.equal(received[0], frame);
  assert.equal(validateWireDefinition("DesignDiagnosticsResponse", received[0]), false);
  queue.push(decodeWireFrame(diagnostics("1")), 100);
  queue.close();
  await new Promise(queueMicrotask);
  assert.equal(received.length, 1);
  off();
  off();
  assert.throws(() => queue.bind(() => {}), { code: "bad_request", origin: "client" });
});
