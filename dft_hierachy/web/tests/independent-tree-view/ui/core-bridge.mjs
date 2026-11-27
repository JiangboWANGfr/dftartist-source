// B-only HTTP test bridge to B's own real NDJSON Core. Not Electron IPC.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { releaseCoreSessions } from "./resource-cleanup.mjs";
export async function coreBridge(product) {
  const sessions = new Map(),
    records = [];
  let serial = 0,
    closing = false,
    closePromise;
  const bin = process.env.HIER_BIN;
  const fixture = path.join(
    product,
    "core/tests/fixtures/m5/b_tree_navigation.sv",
  );
  async function open() {
    assert.equal(closing, false, "B bridge is closing");
    assert.ok(
      bin,
      "HIER_BIN must name B's own fixed Core; no auto-discovery of A/C binaries",
    );
    await fs.access(bin);
    await fs.access(fixture);
    const { createProcessTransport } = await import(
      pathToFileURL(
        path.join(product, "web/packages/client/dist/node/index.js"),
      )
    );
    assert.equal(closing, false, "B bridge closed while open was pending");
    const transport = createProcessTransport({
      command: bin,
      args: ["serve", fixture],
    });
    const id = "B-test-core-" + ++serial;
    const entry = {
      id,
      transport,
      frames: [],
      pending: null,
      closed: false,
      queries: [],
      closeRequested: false,
    };
    records.push(entry);
    sessions.set(id, entry);
    entry.offMessage = transport.onMessage((frame) => {
      entry.frames.push(frame);
      if (entry.pending) flush(entry);
    });
    entry.offClose = transport.onClose(() => {
      entry.closed = true;
      if (entry.pending) flush(entry);
    });
    transport.exited.then(
      (exit) => {
        entry.exit = exit;
        entry.closed = true;
        if (entry.pending) flush(entry);
      },
      (error) => {
        entry.exitError = String(error);
        entry.closed = true;
        if (entry.pending) flush(entry);
      },
    );
    return id;
  }
  function flush(s) {
    const res = s.pending;
    if (!res) return;
    s.pending = null;
    s.offPending?.();
    s.offPending = undefined;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ frames: s.frames.splice(0), closed: s.closed }));
  }
  async function body(req) {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
      assert.ok(
        data.length <= 1024 * 1024,
        "test bridge body bound, not production/M7 budget",
      );
    }
    return data ? JSON.parse(data) : {};
  }
  const route = async (req, res) => {
    if (!req.url.startsWith("/core/")) return false;
    try {
      if (req.url === "/core/open" && req.method === "POST") {
        const id = await open();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id }));
        return true;
      }
      const url = new URL(req.url, "http://127.0.0.1"),
        id = url.searchParams.get("id"),
        s = sessions.get(id);
      assert.ok(s, "unknown B test session");
      if (url.pathname === "/core/poll" && req.method === "GET") {
        assert.equal(s.pending, null, "one test poll per session");
        s.pending = res;
        const onClose = () => {
          if (s.pending === res) s.pending = null;
          res.off("close", onClose);
          s.offPending = undefined;
        };
        res.on("close", onClose);
        s.offPending = () => res.off("close", onClose);
        if (s.frames.length || s.closed) flush(s);
      } else if (url.pathname === "/core/send" && req.method === "POST") {
        const frame = await body(req);
        s.queries.push(frame);
        s.transport.send(frame);
        res.writeHead(204);
        res.end();
      } else if (url.pathname === "/core/close" && req.method === "POST") {
        if (!s.closeRequested) {
          s.closeRequested = true;
          s.transport.close();
        }
        await s.transport.exited;
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  };
  return {
    route,
    summary: () =>
      records.map((s) => ({
        id: s.id,
        closed: s.closed,
        closeRequested: s.closeRequested,
        exit: s.exit,
        exitError: s.exitError,
        queries: s.queries.map((x) => x.method),
        buffered: s.frames.length,
        pollWaiting: Boolean(s.pending),
        pollListenerReleased: !s.offPending,
        messageListenerReleased: s.messageListenerReleased === true,
        closeListenerReleased: s.closeListenerReleased === true,
      })),
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        const released = await releaseCoreSessions(
          [...sessions.values()],
          flush,
        );
        sessions.clear();
        if (released.errors.length) {
          const error = new AggregateError(
            released.errors.map((e) => e.error),
            "B Core bridge cleanup failed",
          );
          error.cleanupStages = released.errors.map((e) => e.stage);
          throw error;
        }
      })();
      return closePromise;
    },
  };
}
