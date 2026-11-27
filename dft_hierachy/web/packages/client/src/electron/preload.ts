import { contextBridge, ipcRenderer } from "electron";
import { jsonSnapshot } from "../json-snapshot.js";
import type {
  ElectronBridge,
  ElectronConnectResult,
  ElectronEvent,
  ElectronFailure,
} from "./bridge.js";
import { channels, record } from "./ipc.js";

let installed = false;
let serial = 0n;
const unavailable = (): ElectronFailure => ({
  code: "transport_closed",
  origin: "transport",
  message: "Electron IPC unavailable",
  data: { reason: "ipc_unavailable" },
});
const invalidResult = (): ElectronConnectResult => ({
  ok: false,
  error: {
    code: "protocol_error",
    origin: "client",
    message: "Invalid Electron connect result",
    data: {},
  },
});
interface Registration {
  readonly connectionId: string;
  readonly listener: (event: ElectronEvent) => void;
  sessionId?: string;
}

/** Install once in a sandboxed, context-isolated main-frame preload. */
export function exposeElectronBridge(apiKey: string): void {
  if (
    typeof apiKey !== "string" ||
    !apiKey ||
    installed ||
    apiKey in window ||
    process.isMainFrame !== true ||
    process.contextIsolated === false ||
    process.sandboxed === false
  )
    throw new TypeError("Bridge requires an unused key and an isolated main-frame preload");

  const pending = new Map<string, Registration>();
  const claimed = new Map<string, Registration>();
  let listening = false;
  const remove = (registration: Registration): void => {
    pending.delete(registration.connectionId);
    if (
      registration.sessionId !== undefined &&
      claimed.get(registration.sessionId) === registration
    )
      claimed.delete(registration.sessionId);
    if (!pending.size && listening) {
      ipcRenderer.removeListener(channels.event, receive);
      listening = false;
    }
  };
  const notify = (registration: Registration, event: ElectronEvent): void => {
    queueMicrotask(() => {
      if (pending.get(registration.connectionId) === registration) registration.listener(event);
    });
  };
  const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
    if (!record(value) || typeof value.connectionId !== "string") return;
    const registration = pending.get(value.connectionId);
    // Renderer validates the event itself, including early malformed events.
    if (registration) notify(registration, value.event as ElectronEvent);
  };
  const send = (kind: "start" | "send" | "close", sessionId: string, json?: string): void => {
    const registration = claimed.get(sessionId);
    if (!registration) return;
    try {
      ipcRenderer.send(channels[kind], {
        version: 1,
        connectionId: registration.connectionId,
        sessionId,
        ...(kind === "send" ? { json } : {}),
      });
    } catch {
      notify(registration, { version: 1, sessionId, kind: "closed", error: unavailable() });
    }
  };
  const bridge: ElectronBridge = {
    version: 1,
    async connect(listener) {
      if (typeof listener !== "function") return invalidResult();
      const registration: Registration = {
        connectionId: `${crypto.randomUUID()}:${++serial}`,
        listener,
      };
      pending.set(registration.connectionId, registration);
      if (!listening) {
        ipcRenderer.on(channels.event, receive);
        listening = true;
      }
      let result: unknown;
      try {
        result = await ipcRenderer.invoke(channels.connect, {
          version: 1,
          connectionId: registration.connectionId,
        });
      } catch {
        remove(registration);
        return { ok: false, error: unavailable() };
      }
      if (
        record(result) &&
        result.ok === true &&
        result.version === 1 &&
        typeof result.sessionId === "string" &&
        !claimed.has(result.sessionId)
      ) {
        registration.sessionId = result.sessionId;
        claimed.set(result.sessionId, registration);
        return { ok: true, version: 1, sessionId: result.sessionId };
      }
      remove(registration);
      if (record(result) && result.ok === false && record(result.error)) {
        try {
          const { code, origin, message, data } = result.error;
          // Copy only declared own JSON data. The renderer performs code/schema validation.
          return {
            ok: false,
            error: jsonSnapshot({ code, origin, message, data }) as ElectronFailure,
          };
        } catch {
          return invalidResult();
        }
      }
      return invalidResult();
    },
    start: (id) => send("start", id),
    send: (id, json) => send("send", id, json),
    close: (id) => send("close", id),
    release(id) {
      const registration = claimed.get(id);
      if (registration) remove(registration);
    },
  };
  // No listeners exist until connect; failed exposure leaves no resources behind.
  try {
    contextBridge.exposeInMainWorld(apiKey, Object.freeze(bridge));
  } catch {
    throw new TypeError("Cannot expose Electron bridge at the requested key");
  }
  installed = true;
}
