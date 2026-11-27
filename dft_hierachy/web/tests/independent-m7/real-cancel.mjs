// Real CPU-active Core cancellation. Two correct outcomes: cooperative terminal,
// or configured snapshot-wide escalation. No worst-case interruption SLA claim.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
const root = process.env.HIER_B_PRODUCT_ROOT,
  binary = fs.realpathSync(process.env.HIER_BIN),
  input = process.argv[2],
  output = process.argv[3];
const native = cp.spawn;
let child;
cp.spawn = function (command, ...args) {
  const p = native.call(this, command, ...args);
  if (command === binary) child = p;
  return p;
};
syncBuiltinESMExports();
const { createProcessTransport } = await import(
  pathToFileURL(path.join(root, "web/packages/client/dist/node/index.js"))
);
const { HierClient } = await import(
  pathToFileURL(path.join(root, "web/packages/client/dist/index.js"))
);
const transport = createProcessTransport({
  command: binary,
  args: ["serve", "--top", "bench_top", input],
  resourceLimits: {
    openTimeoutMillis: 30000,
    cancelTimeoutMillis: 2000,
    maxRssBytes: 4294967296,
  },
});
transport.exited.catch(() => {});
const report = {
  cpu: [],
  complete: false,
  pid: child.pid,
  limits: {
    openTimeoutMillis: 30000,
    cancelTimeoutMillis: 2000,
    maxRssBytes: 4294967296,
  },
};
let target, terminalResolve;
const terminal = new Promise((resolve) => (terminalResolve = resolve));
const send = transport.send.bind(transport),
  onMessage = transport.onMessage.bind(transport);
transport.send = (message) => {
  if (message.method === "search" && message.params.kinds?.includes("signal"))
    target = message.id;
  return send(message);
};
transport.onMessage = (handler) =>
  onMessage((message) => {
    if (message.id === target && typeof message.ok === "boolean")
      terminalResolve({ terminal: message });
    handler(message);
  });
const closed = new Promise((resolve) =>
  transport.onClose((error) => resolve({ closed: error })),
);
const client = new HierClient(transport),
  controller = new AbortController();
let settled = false;
function seconds(text) {
  const n = text.trim().split(":").map(Number);
  return n.reduce((a, b) => a * 60 + b, 0);
}
async function cpu() {
  const r = await promisify(cp.execFile)(
    "/bin/ps",
    ["-p", String(child.pid), "-o", "time="],
    { encoding: "utf8" },
  );
  const value = seconds(r.stdout);
  report.cpu.push(value);
  return value;
}
try {
  await client.ready;
  const initial = await cpu();
  const query = client
    .search({ text: "", kinds: ["signal"] }, { limit: 1 }, controller.signal)
    .then(
      (v) => {
        settled = true;
        return v;
      },
      (e) => {
        settled = true;
        throw e;
      },
    );
  query.catch(() => {});
  const guard = performance.now();
  let active = initial;
  while (
    !settled &&
    active < initial + 0.1 &&
    performance.now() - guard < 15000
  )
    active = await cpu();
  assert.equal(
    settled,
    false,
    "input must still have a pending query at CPU witness",
  );
  assert.ok(
    active >= initial + 0.1,
    "real Core CPU progressed after query submission",
  );
  const other = client.roots();
  other.catch(() => {});
  const start = performance.now();
  controller.abort();
  await assert.rejects(query, (error) => error.code === "cancelled");
  report.localCancelMillis = performance.now() - start;
  const outcome = await Promise.race([terminal, closed]);
  report.outcomeMillis = performance.now() - start;
  if (outcome.closed) {
    assert.equal(outcome.closed.code, "transport_closed");
    assert.equal(outcome.closed.origin, "transport");
    assert.equal(outcome.closed.data.reason, "cancel_timeout");
    assert.equal(outcome.closed.data.requestId, target);
    await assert.rejects(
      other,
      (e) =>
        e.code === "transport_closed" && e.data.reason === "cancel_timeout",
    );
    report.outcome = "snapshot escalation";
    report.error = {
      code: outcome.closed.code,
      origin: outcome.closed.origin,
      data: outcome.closed.data,
    };
    report.exit = await transport.exited;
    assert.equal(report.exit.signal, "SIGKILL");
  } else {
    assert.equal(outcome.terminal.ok, false);
    assert.equal(outcome.terminal.error.code, "cancelled");
    assert.equal((await other).completeness.status, "complete");
    report.outcome = "cooperative terminal";
  }
  report.complete = true;
} finally {
  client.dispose();
  report.exit ??= await transport.exited;
  cp.spawn = native;
  syncBuiltinESMExports();
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
}
assert.throws(() => process.kill(report.pid, 0), { code: "ESRCH" });
