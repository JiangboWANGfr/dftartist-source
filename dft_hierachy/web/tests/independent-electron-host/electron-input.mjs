// Unit dependency inputs only: these are not Electron or product implementations.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { publicEntry } from "../independent-electron-renderer/public-entry.mjs";
import { producer, queue, checkpoint } from "./scope.mjs";
export const channels = Object.freeze({
  connect: "hier:bridge:connect",
  start: "hier:bridge:start",
  send: "hier:bridge:send",
  close: "hier:bridge:close",
  event: "hier:bridge:event",
});
export const URL = "file:///B71-approved-host.html";
let serial = 0;
export class Contents extends EventEmitter {
  constructor() {
    super();
    this.id = ++serial;
    this.url = URL;
    this.destroyed = false;
    this.events = queue();
    this.mainFrame = {
      url: URL,
      processId: 1,
      routingId: this.id,
      isDestroyed: () => false,
      send: (channel, value) => this.deliver(channel, value),
    };
  }
  getURL() {
    return this.url;
  }
  isDestroyed() {
    return this.destroyed;
  }
  send(channel, value) {
    this.deliver(channel, value);
  }
  deliver(channel, value) {
    assert.equal(channel, channels.event);
    this.events.push(structuredClone(value));
  }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.emit("destroyed");
    }
  }
  navigate(inPlace = false) {
    this.emit(
      "did-start-navigation",
      {
        url: this.url,
        isInPlace: inPlace,
        isMainFrame: true,
        frame: this.mainFrame,
        frameProcessId: 1,
        frameRoutingId: this.id,
      },
      this.url,
      inPlace,
      true,
      1,
      this.id,
    );
  }
}
export class MainIPC extends EventEmitter {
  handlers = new Map();
  handle(channel, handler) {
    assert(!this.handlers.has(channel), "handler overwritten");
    this.handlers.set(channel, handler);
  }
  removeHandler(channel) {
    this.handlers.delete(channel);
  }
  async invoke(event, value) {
    const h = this.handlers.get(channels.connect);
    assert(h, "connect handler must exist after session create");
    return h(event, value);
  }
  dispatch(kind, event, value) {
    this.emit(channels[kind], event, value);
  }
}
const buildCache = new Map();
const liveScopes = new Set();
export async function releaseMainScopes() {
  for (const close of [...liveScopes]) await close();
}
async function bundle(product, kind) {
  const key = product + kind;
  if (!buildCache.has(key)) {
    const req = createRequire(product + "/web/package.json"),
      esbuild = req("esbuild"),
      entry = publicEntry(product, "@hier/client/electron/" + kind);
    buildCache.set(
      key,
      esbuild
        .build({
          entryPoints: [new globalThis.URL(entry).pathname],
          bundle: true,
          write: false,
          format: kind === "preload" ? "iife" : "esm",
          globalName: kind === "preload" ? "BPreload" : undefined,
          platform: "node",
          logLevel: "silent",
          plugins: [
            {
              name: "B-unit-electron-input",
              setup(b) {
                b.onResolve({ filter: /^electron$/ }, () => ({
                  path: "electron",
                  namespace: "b-input",
                }));
                b.onLoad({ filter: /.*/, namespace: "b-input" }, () => ({
                  contents:
                    "const e=globalThis.__B71_ELECTRON_INPUT;export const ipcMain=e.ipcMain;export const ipcRenderer=e.ipcRenderer;export const contextBridge=e.contextBridge;",
                  loader: "js",
                }));
              },
            },
          ],
        })
        .then((r) => {
          assert.deepEqual(r.warnings, []);
          return r.outputFiles[0].text;
        }),
    );
  }
  return buildCache.get(key);
}
export async function usingMain(product, fn) {
  const ipc = new MainIPC(),
    sentinel = () => {},
    web = new Set(),
    owners = [],
    inputs = [];
  ipc.on("B-host-owned", sentinel);
  const input = { ipcMain: ipc };
  globalThis.__B71_ELECTRON_INPUT = input;
  let closing;
  const cleanup = () =>
    (closing ??= (async () => {
      for (const s of owners) s.close();
      for (const s of owners) await s.exited.catch(() => {});
      for (const w of web) {
        w.destroy();
        w.events.fail(Error("B host scope released"));
      }
      await checkpoint();
      for (const p of inputs) await p.close();
      assert.equal(ipc.listenerCount("B-host-owned"), 1, "host-owned listeners preserved");
      ipc.removeListener("B-host-owned", sentinel);
      delete globalThis.__B71_ELECTRON_INPUT;
      liveScopes.delete(cleanup);
    })());
  liveScopes.add(cleanup);
  try {
    const code = await bundle(product, "main"),
      mod = await import(
        "data:text/javascript;base64," + Buffer.from(code).toString("base64") + "#" + ++serial
      );
    const c = {
      ipc,
      owners,
      contents() {
        const w = new Contents();
        web.add(w);
        return w;
      },
      event(w, frame = w.mainFrame) {
        return { sender: w, senderFrame: frame };
      },
      async options(w = this.contents()) {
        const p = await producer();
        inputs.push(p);
        return { webContents: w, documentUrl: w.getURL(), process: p.options, B_producer: p };
      },
      create(options) {
        const { B_producer: p, ...actual } = options,
          s = mod.createElectronSession(actual);
        s.exited.catch(() => {});
        owners.push(s);
        return { s, p, w: options.webContents };
      },
      async session(w) {
        const options = await this.options(w),
          o = this.create(options);
        await o.p.ready();
        return o;
      },
      connect(o, connectionId = "B-connection") {
        return ipc.invoke(this.event(o.w), { version: 1, connectionId });
      },
      dispatch(kind, o, connectionId = "B-connection", extra = {}) {
        ipc.dispatch(kind, this.event(o.w), {
          version: 1,
          connectionId,
          sessionId: o.s.id,
          ...extra,
        });
      },
      async next(o, kind) {
        return (
          await o.w.events.next((v) => v.connectionId === "B-connection" && v.event?.kind === kind)
        ).event;
      },
    };
    return await fn(c);
  } finally {
    await cleanup();
  }
}
export async function preload(product, { isMainFrame = true, existing = {} } = {}) {
  const ipc = new EventEmitter(),
    calls = [],
    exposed = { ...existing },
    outcomes = [];
  ipc.invoke = (channel, value) => {
    calls.push({ kind: "invoke", channel, value });
    return outcomes.length
      ? outcomes.shift()(value)
      : Promise.resolve({ ok: true, version: 1, sessionId: "B-session" });
  };
  ipc.send = (channel, value) => {
    calls.push({ kind: "send", channel, value });
    if (ipc.sendError) throw ipc.sendError;
  };
  const input = {
    ipcRenderer: ipc,
    contextBridge: {
      exposeInMainWorld(key, value) {
        if (Object.hasOwn(exposed, key)) throw new TypeError("already exists");
        exposed[key] = value;
      },
    },
  };
  const context = vm.createContext({
    __B71_ELECTRON_INPUT: input,
    process: { isMainFrame },
    window: exposed,
    queueMicrotask,
    TextEncoder,
    URL: globalThis.URL,
    crypto: globalThis.crypto,
  });
  vm.runInContext(await bundle(product, "preload"), context);
  return {
    calls,
    ipc,
    exposed,
    outcomes,
    install: (key) => context.BPreload.exposeElectronBridge(key),
    event: (connectionId, event) =>
      ipc.emit(channels.event, { B_rawElectronEvent: true }, { connectionId, event }),
  };
}
