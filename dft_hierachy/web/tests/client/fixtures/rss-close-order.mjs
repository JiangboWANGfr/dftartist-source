import assert from "node:assert/strict";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

// Retain real processes/arguments; delay only ps close delivery to expose the lifecycle boundary.
const execFile = cp.execFile,
  spawn = cp.spawn;
const coreClosed = Promise.withResolvers(),
  probeHeld = Promise.withResolvers();
let transport,
  release,
  probeExited = false,
  probeClosed = false;
cp.execFile = function (file, ...args) {
  const child = execFile.call(
    this,
    process.env.HIER_A_RSS_MISSING === "1" ? "/missing-rss-probe" : file,
    ...args,
  );
  const emit = child.emit;
  child.once("exit", () => {
    probeExited = true;
  });
  child.once("close", () => {
    probeClosed = true;
  });
  child.emit = function (event, ...values) {
    if (event !== "close") return emit.call(this, event, ...values);
    release = () => {
      release = undefined;
      return emit.call(child, event, ...values);
    };
    probeHeld.resolve();
    return true;
  };
  return child;
};
cp.spawn = function (...args) {
  const child = spawn.apply(this, args);
  child.once("spawn", () => queueMicrotask(() => transport.close()));
  child.once("close", coreClosed.resolve);
  return child;
};
syncBuiltinESMExports();
const { createProcessTransport } = await import("../../../packages/client/dist/node/index.js");
transport = createProcessTransport({
  command: process.execPath,
  args: ["-e", "process.stdin.resume()"],
  shutdownGraceMillis: 0,
  resourceLimits: { maxRssBytes: Number.MAX_SAFE_INTEGER },
});
let settled = false;
const done = transport.exited.then(() => {
  settled = true;
});
try {
  await Promise.all([coreClosed.promise, probeHeld.promise]);
  await new Promise(setImmediate);
  assert.equal(settled, false, "transport.exited must wait for the sampler close event");
  assert.equal(probeClosed, false);
  const before = { coreClosed: true, probeExited, probeClosed, transportSettled: settled };
  release();
  await done;
  assert.equal(probeClosed, true);
  console.log(JSON.stringify({ before, after: { probeClosed, transportSettled: settled } }));
} finally {
  release?.();
  transport.close();
  await transport.exited;
}
