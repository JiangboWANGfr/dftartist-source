import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { coreBridge } from "./core-bridge.mjs";

const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT ?? ".");
async function ownedHost() {
  const bridge = await coreBridge(product);
  const server = http.createServer(async (req, res) => {
    if (await bridge.route(req, res)) return;
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    bridge,
    server,
    url,
    async release() {
      try {
        await bridge.close();
      } finally {
        if (server.listening)
          await new Promise((resolve) => {
            server.close(resolve);
            server.closeAllConnections();
          });
      }
    },
  };
}
test("C78 empty bridge close is idempotent and prevents late process creation", async () => {
  const host = await ownedHost();
  try {
    const closing = host.bridge.close();
    assert.equal(host.bridge.close(), closing);
    await closing;
    const response = await fetch(host.url + "/core/open", { method: "POST" });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /bridge is closing/);
    assert.deepEqual(host.bridge.summary(), []);
    assert.equal(host.bridge.close(), closing);
  } finally {
    await host.release();
  }
});
test("C78 real bridge reaps two sessions, unsubscribes and releases pending polls", async () => {
  const host = await ownedHost();
  const polls = [];
  try {
    for (let i = 0; i < 2; i++) {
      const opened = await fetch(host.url + "/core/open", { method: "POST" });
      assert.equal(opened.status, 200);
      const { id } = await opened.json();
      const route = "/core/poll?id=" + encodeURIComponent(id);
      const hello = await fetch(host.url + route);
      assert.ok((await hello.json()).frames.length > 0);
      const received = new Promise((resolve) => {
        const listener = (req) => {
          if (req.url === route) {
            host.server.off("request", listener);
            resolve();
          }
        };
        host.server.on("request", listener);
      });
      const poll = {};
      polls.push(poll);
      poll.done = new Promise((resolve, reject) => {
        poll.request = http.get(host.url + route, { agent: false }, (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.once("end", () => {
            try {
              resolve(JSON.parse(text));
            } catch (error) {
              reject(error);
            }
          });
        });
        poll.request.once("error", reject);
      });
      await received;
    }
    assert.ok(host.bridge.summary().every((s) => s.pollWaiting));
    const closing = host.bridge.close();
    assert.equal(host.bridge.close(), closing);
    await closing;
    const replies = await Promise.all(polls.map((p) => p.done));
    assert.ok(replies.every((p) => p.closed));
    const sessions = host.bridge.summary();
    assert.equal(sessions.length, 2);
    for (const s of sessions) {
      assert.deepEqual(s.exit, { code: 0, signal: null });
      assert.equal(s.closed, true);
      assert.equal(s.closeRequested, true);
      assert.equal(s.buffered, 0);
      assert.equal(s.pollWaiting, false);
      assert.equal(s.pollListenerReleased, true);
      assert.equal(s.messageListenerReleased, true);
      assert.equal(s.closeListenerReleased, true);
    }
    await host.bridge.close();
    assert.deepEqual(host.bridge.summary(), sessions);
  } finally {
    for (const poll of polls) poll.request?.destroy();
    await host.release();
  }
});
