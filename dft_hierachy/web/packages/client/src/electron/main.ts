import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { HierError, isHierError } from "../errors.js";
import { jsonSnapshot } from "../json-snapshot.js";
import type { ProcessExit, ProcessTransportOptions } from "../node/index.js";
import {
  createProcessTextTransport,
  type ProcessTextTransport,
} from "../node/process-transport.js";
import type { Unsubscribe } from "../transport.js";
import { decodeWireFrame } from "../wire-frame.js";
import { validateWireDefinition } from "../wire-numbers.js";
import type { ElectronConnectResult, ElectronEvent, ElectronFailure } from "./bridge.js";
import { channels, record } from "./ipc.js";

export interface ElectronSessionOptions {
  readonly webContents: WebContents;
  /** Exact URL of the currently loaded, host-approved top-level document. */
  readonly documentUrl: string;
  /** Main-process input only; never accepted from renderer IPC. */
  readonly process: ProcessTransportOptions;
}
export interface ElectronSession {
  readonly id: string;
  readonly exited: Promise<ProcessExit>;
  close(): void;
}

type Incoming = IpcMainEvent | IpcMainInvokeEvent;
const sessions = new Map<WebContents, DocumentSession>();
let listening = false;
let serial = 0n;
const badRequest = () => new HierError("bad_request", "client", "Invalid Electron session request");
const transportFailure = (reason: string) =>
  new HierError("transport_closed", "transport", "Electron session closed", { reason });

function failure(error: HierError): ElectronFailure {
  return jsonSnapshot({
    code: error.code,
    origin: error.origin,
    message: error.message,
    data: error.data,
  }) as ElectronFailure;
}

function connect(event: Incoming, body: unknown): ElectronConnectResult {
  const session = sessions.get(event.sender);
  // No host-approved binding means no authority, including another window's main frame.
  if (!session?.authorizes(event)) return { ok: false, error: failure(badRequest()) };
  if (record(body) && typeof body.version === "number" && body.version !== 1)
    return {
      ok: false,
      error: failure(
        new HierError("protocol_mismatch", "client", "Unsupported Electron bridge version"),
      ),
    };
  if (
    !record(body) ||
    body.version !== 1 ||
    typeof body.connectionId !== "string" ||
    !body.connectionId
  ) {
    session.close(transportFailure("invalid_ipc_frame"));
    return { ok: false, error: failure(badRequest()) };
  }
  return session.claim(body.connectionId);
}

function dispatch(kind: "start" | "send" | "close", event: Incoming, body: unknown): void {
  const session = sessions.get(event.sender);
  if (!session?.authorizes(event)) return;
  // A different identity has no authority, even when the rest of its packet is invalid.
  if (
    record(body) &&
    ((typeof body.sessionId === "string" && body.sessionId !== session.id) ||
      (typeof body.connectionId === "string" && body.connectionId !== session.connectionId))
  )
    return;
  if (!session.connectionId) return;
  if (
    !record(body) ||
    body.version !== 1 ||
    body.sessionId !== session.id ||
    body.connectionId !== session.connectionId ||
    (kind === "send" && typeof body.json !== "string")
  ) {
    session.close(transportFailure("invalid_ipc_frame"));
    return;
  }
  if (kind === "start") session.start();
  else if (kind === "close") session.close();
  else session.send(body.json as string);
}
const start = (event: Incoming, body: unknown) => dispatch("start", event, body);
const send = (event: Incoming, body: unknown) => dispatch("send", event, body);
const close = (event: Incoming, body: unknown) => dispatch("close", event, body);

function install(): void {
  if (listening) return;
  // handle throws on an occupied channel, before any child or listeners are created.
  ipcMain.handle(channels.connect, connect);
  ipcMain.on(channels.start, start);
  ipcMain.on(channels.send, send);
  ipcMain.on(channels.close, close);
  listening = true;
}
function releaseUnusedListeners(): void {
  if (sessions.size || !listening) return;
  ipcMain.removeHandler(channels.connect);
  ipcMain.removeListener(channels.start, start);
  ipcMain.removeListener(channels.send, send);
  ipcMain.removeListener(channels.close, close);
  listening = false;
}

/** Owns one child and one approved document; never creates an SDK. */
export function createElectronSession(options: ElectronSessionOptions): ElectronSession {
  try {
    if (
      !options ||
      !options.webContents ||
      options.webContents.isDestroyed() ||
      !options.webContents.mainFrame ||
      typeof options.documentUrl !== "string" ||
      !options.documentUrl ||
      !URL.canParse(options.documentUrl) ||
      options.webContents.getURL() !== options.documentUrl ||
      !record(options.process)
    )
      throw badRequest();
    if (sessions.get(options.webContents)?.settled === false) throw badRequest();
  } catch {
    throw badRequest();
  }
  try {
    install();
  } catch {
    throw new HierError("bad_request", "client", "Electron IPC channels are already registered");
  }
  let process: ProcessTextTransport;
  try {
    process = createProcessTextTransport(options.process);
  } catch (error) {
    releaseUnusedListeners();
    throw isHierError(error) ? error : badRequest();
  }
  const previous = sessions.get(options.webContents);
  previous?.detach();
  const session = new DocumentSession(
    {
      webContents: options.webContents,
      documentUrl: options.documentUrl,
      process: options.process,
    },
    process,
  );
  sessions.set(options.webContents, session);
  return Object.freeze({ id: session.id, exited: session.exited, close: () => session.close() });
}

class DocumentSession {
  readonly id = `${randomUUID()}:${++serial}`;
  readonly exited: Promise<ProcessExit>;
  readonly frame: WebContents["mainFrame"];
  connectionId: string | undefined;
  settled = false;
  private closed = false;
  private invalidated = false;
  private cause: HierError | undefined;
  private started = false;
  private notified = false;
  private messages: Unsubscribe | undefined;
  private closes: Unsubscribe | undefined;

  constructor(
    private readonly options: ElectronSessionOptions,
    private readonly process: ProcessTextTransport,
  ) {
    const web = options.webContents;
    this.frame = web.mainFrame;
    web.on("did-start-navigation", this.navigation);
    web.on("render-process-gone", this.gone);
    web.on("destroyed", this.destroyed);
    this.closes = process.onClose((error) =>
      this.close(
        error === undefined
          ? undefined
          : isHierError(error)
            ? error
            : transportFailure("ipc_unavailable"),
      ),
    );
    this.exited = process.exited.then(
      (exit) => {
        this.reaped();
        return exit;
      },
      (error: unknown) => {
        this.reaped();
        throw error;
      },
    );
    void this.exited.catch(() => {});
  }

  authorizes(event: Incoming): boolean {
    const web = this.options.webContents;
    return (
      !this.invalidated &&
      !web.isDestroyed() &&
      event.sender === web &&
      event.senderFrame !== null &&
      event.senderFrame === this.frame &&
      web.mainFrame === this.frame &&
      web.getURL() === this.options.documentUrl
    );
  }
  claim(connectionId: string): ElectronConnectResult {
    if (this.connectionId !== undefined) return { ok: false, error: failure(badRequest()) };
    this.connectionId = connectionId;
    if (this.closed) this.notifyClosed();
    return { ok: true, version: 1, sessionId: this.id };
  }
  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    this.messages = this.process.onMessage((json) => {
      if (!this.closed) this.deliver({ version: 1, sessionId: this.id, kind: "frame", json });
    });
  }
  send(json: string): void {
    if (this.closed) return;
    try {
      if (/[\r\n]/.test(json) || !validateWireDefinition("ClientFrame", decodeWireFrame(json)))
        throw new SyntaxError("Expected one ClientFrame");
    } catch {
      this.close(transportFailure("invalid_frame"));
      return;
    }
    try {
      this.process.send(json);
    } catch (error) {
      this.close(isHierError(error) ? error : transportFailure("ipc_unavailable"));
    }
  }
  close(cause?: HierError): void {
    if (this.closed) return;
    this.closed = true;
    this.cause = cause;
    this.messages?.();
    this.messages = undefined;
    this.process.close();
    this.notifyClosed();
  }
  detach(): void {
    const web = this.options.webContents;
    web.removeListener("did-start-navigation", this.navigation);
    web.removeListener("render-process-gone", this.gone);
    web.removeListener("destroyed", this.destroyed);
    this.closes?.();
    this.closes = undefined;
  }
  private reaped(): void {
    this.settled = true;
    // Keep only the terminal claim record and the document lifetime listeners.
    this.closes?.();
    this.closes = undefined;
  }
  private notifyClosed(): void {
    if (!this.connectionId || this.notified) return;
    this.notified = true;
    queueMicrotask(() =>
      this.deliver({
        version: 1,
        sessionId: this.id,
        kind: "closed",
        ...(this.cause === undefined ? {} : { error: failure(this.cause) }),
      }),
    );
  }
  private deliver(event: ElectronEvent): void {
    const web = this.options.webContents;
    if (sessions.get(web) !== this || web.isDestroyed() || !this.connectionId) return;
    try {
      this.frame.send(channels.event, { connectionId: this.connectionId, event });
    } catch {
      this.close(transportFailure("ipc_unavailable"));
    }
  }
  private readonly navigation = (
    details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
  ): void => {
    if (details.isMainFrame) {
      this.invalidated = true;
      this.close(transportFailure("document_navigated"));
    }
  };
  private readonly gone = (): void => {
    this.invalidated = true;
    this.close(transportFailure("renderer_gone"));
  };
  private readonly destroyed = (): void => {
    this.invalidated = true;
    this.close(transportFailure("renderer_gone"));
    this.detach();
    if (sessions.get(this.options.webContents) === this) sessions.delete(this.options.webContents);
    releaseUnusedListeners();
  };
}
