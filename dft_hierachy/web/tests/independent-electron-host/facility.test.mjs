import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { producer, queue } from "./scope.mjs";
import { mainCases, preloadCases } from "./host-cases.mjs";
import { cases } from "./text-cases.mjs";
test("B71 finite inventory has unique IDs, explicit input/expected/basis and executable body", () => {
  for (const set of [mainCases, preloadCases, cases]) {
    assert(set.length > 0);
    assert.equal(new Set(set.map((x) => x.id)).size, set.length);
    for (const c of set) {
      assert(c.input && typeof c.input === "object");
      assert(c.expected.length > 0);
      assert.match(c.basis, /DESIGN/);
      assert.equal(typeof c.run, "function");
    }
  }
});
test("B71 event input queue consumes each event once without dropping history", async () => {
  const q = queue();
  q.push({ n: 1 });
  q.push({ n: 2 });
  assert.equal((await q.next()).n, 1);
  assert.equal((await q.next()).n, 2);
  const p = q.next((v) => v.n === 3);
  q.push({ n: 3 });
  assert.equal((await p).n, 3);
  assert.equal(q.rows.length, 3);
});
test(
  "B71 real producer control and stdin roundtrip, EOF cleanup (not Core/Electron)",
  { timeout: 10000 },
  async () => {
    const p = await producer(),
      o = p.options,
      child = spawn(o.command, o.args, { env: o.env, stdio: ["pipe", "pipe", "pipe"] });
    const exited = new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => done({ code, signal }));
    });
    let text = "",
      done;
    const output = new Promise((resolve) => (done = resolve));
    child.stdout.on("data", (b) => {
      text += b.toString();
      if (text.includes("B71 byte probe\n")) done();
    });
    try {
      await p.ready();
      await p.bytes("B71 byte probe\n");
      child.stdin.write("B71 stdin probe\n");
      assert.equal((await p.inbox.next((v) => v.stdin !== undefined)).stdin, "B71 stdin probe");
      await output;
      assert.equal(text, "B71 byte probe\n");
      child.stdin.end();
      assert.deepEqual(await exited, { code: 0, signal: null });
    } finally {
      child.kill();
      await exited.catch(() => {});
      await p.close();
    }
  },
);
