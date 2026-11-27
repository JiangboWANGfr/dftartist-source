// B-only lifecycle fault control. No production/model/HierarchyTree replacement.
import assert from "node:assert/strict";
import http from "node:http";
import childProcess from "node:child_process";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";

const mode = process.argv[2];
assert.ok(
  [
    "normal",
    "page-gone",
    "shutdown-reject",
    "page-close-reject",
    "browser-close-reject",
    "core-nonzero",
    "server-close-reject",
  ].includes(mode),
);
assert.ok(process.env.HIER_BIN, "own fixed real Core required");
const require = createRequire(
  path.join(import.meta.dirname, "../c76/browser/package.json"),
);
const { chromium } = require("playwright");
const originals = {
  createServer: http.createServer,
  spawn: childProcess.spawn,
  launch: chromium.launch,
  log: console.log,
};
const cores = [],
  polls = [],
  injected = [];
let server,
  browser,
  page,
  closeServer,
  closeBrowser,
  closePage,
  listenPortNumber,
  prepared = false,
  runnerResult,
  workerError;
const injectedError = new Error(`B C78 controlled ${mode}`);
childProcess.spawn = function (command, ...args) {
  const child = Reflect.apply(originals.spawn, this, [command, ...args]);
  if (command === process.env.HIER_BIN) {
    const record = { child, closed: false };
    record.done = new Promise((resolve) =>
      child.once("close", (code, signal) => {
        record.closed = true;
        record.exit = { code, signal };
        resolve();
      }),
    );
    cores.push(record);
  }
  return child;
};
http.createServer = function (...args) {
  server = Reflect.apply(originals.createServer, this, args);
  closeServer = server.close.bind(server);
  let rejected = false;
  server.close = function (callback) {
    return closeServer((error) => {
      if (mode === "server-close-reject" && !rejected) {
        rejected = true;
        injected.push("server.close callback after real close");
        callback(injectedError);
      } else callback(error);
    });
  };
  return server;
};
syncBuiltinESMExports();
async function prepare() {
  prepared = true;
  listenPortNumber = server.address().port;
  const base = `http://127.0.0.1:${listenPortNumber}`;
  for (let i = 0; i < 2; i++) {
    const opened = await fetch(base + "/core/open", { method: "POST" });
    assert.equal(opened.status, 200);
    const { id } = await opened.json();
    const route = "/core/poll?id=" + encodeURIComponent(id);
    const hello = await fetch(base + route);
    assert.equal(hello.status, 200);
    assert.ok((await hello.json()).frames.length > 0);
    const poll = { route, ended: false, closed: false };
    polls.push(poll);
    const waiting = new Promise((resolve) => {
      const requestSeen = (req, res) => {
        if (req.url !== route) return;
        server.off("request", requestSeen);
        poll.response = res;
        res.once("finish", () => (poll.ended = true));
        resolve();
      };
      server.on("request", requestSeen);
    });
    poll.done = new Promise((resolve) => {
      poll.request = http.get(base + route, { agent: false }, (response) => {
        response.resume();
        response.once("end", resolve);
      });
      poll.request.once("error", resolve);
      poll.request.once("close", () => {
        poll.closed = true;
        resolve();
      });
    });
    await waiting; // Concrete request boundary, not a timing delay.
  }
  assert.equal(cores.length, 2);
  assert.ok(
    cores.every((x) => !x.closed),
    "two real children initially live",
  );
  if (mode === "core-nonzero") {
    injected.push("SIGTERM to first owned real Core");
    cores[0].child.kill("SIGTERM");
    await cores[0].done;
  }
}
chromium.launch = async function (...args) {
  browser = await Reflect.apply(originals.launch, this, args);
  closeBrowser = browser.close.bind(browser);
  let browserRejected = false;
  browser.close = async () => {
    await closeBrowser();
    if (mode === "browser-close-reject" && !browserRejected) {
      browserRejected = true;
      injected.push("browser.close rejection after real close");
      throw injectedError;
    }
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...pageArgs) => {
    page = await newPage(...pageArgs);
    closePage = page.close.bind(page);
    const evaluate = page.evaluate.bind(page);
    let pageRejected = false;
    page.close = async () => {
      if (mode === "page-close-reject" && !pageRejected) {
        pageRejected = true;
        injected.push("page.close rejection before real close");
        throw injectedError;
      }
      return closePage();
    };
    page.evaluate = async (fn, ...evaluateArgs) => {
      if (!prepared && String(fn).includes("window.UI.shutdown()")) {
        await prepare();
        if (mode === "page-gone") {
          injected.push("real page closed before shutdown");
          await closePage();
        } else if (mode === "shutdown-reject") {
          injected.push("UI.shutdown boundary rejects undefined");
          throw undefined;
        }
      }
      return evaluate(fn, ...evaluateArgs);
    };
    return page;
  };
  return browser;
};
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("{")) {
    try {
      const candidate = JSON.parse(args[0]);
      if (candidate.plannedCases === 140) runnerResult = candidate;
    } catch {}
  }
  originals.log(...args);
};
const listenPort = async (port) => {
  const probe = originals.createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch (error) {
    if (error.code === "EADDRINUSE") return false;
    throw error;
  } finally {
    if (probe.listening) await new Promise((resolve) => probe.close(resolve));
  }
};
let observed;
try {
  process.argv.push("--self-check");
  await import("./run.mjs");
} catch (error) {
  workerError = { type: typeof error, message: error?.message };
} finally {
  if (server && !server.listening)
    await Promise.all(polls.map((poll) => poll.done));
  observed = {
    prepared,
    injected,
    runnerResult,
    workerError,
    runnerExitCode: process.exitCode ?? 0,
    pageClosed: page?.isClosed() ?? true,
    browserConnected: browser?.isConnected() ?? false,
    serverListening: server?.listening ?? false,
    cores: cores.map((x) => ({
      pid: x.child.pid,
      closed: x.closed,
      exit: x.exit,
    })),
    pollsEnded: polls.filter((p) => p.ended).length,
    pollsClosed: polls.filter((p) => p.closed).length,
    portRebind: listenPortNumber ? await listenPort(listenPortNumber) : null,
  };
  // Rescue only our own failed-baseline resources; observations above remain red.
  for (const poll of polls) poll.request.destroy();
  if (closeBrowser) await closeBrowser().catch(() => {});
  for (const record of cores) {
    if (!record.closed) record.child.kill("SIGTERM");
  }
  await Promise.all(cores.map((x) => x.done));
  if (server?.listening) {
    const closed = new Promise((resolve) => closeServer(resolve));
    server.closeAllConnections();
    await closed;
  }
  http.createServer = originals.createServer;
  childProcess.spawn = originals.spawn;
  chromium.launch = originals.launch;
  console.log = originals.log;
  syncBuiltinESMExports();
  originals.log(
    "C78_RESOURCE_CONTROL " +
      JSON.stringify({
        mode,
        observedBeforeRescue: observed,
        rescue: {
          browserConnected: browser?.isConnected() ?? false,
          serverListening: server?.listening ?? false,
          allOwnedCoresClosed: cores.every((x) => x.closed),
        },
      }),
  );
}
