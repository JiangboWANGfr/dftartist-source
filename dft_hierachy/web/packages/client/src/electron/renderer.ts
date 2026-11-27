import { validateDefinition } from "@hier/protocol-types";
import { HierError } from "../errors.js";
import type { ClientErrorCode } from "../errors.js";
import { FrameInbox } from "../frame-inbox.js";
import { frozenJsonSnapshot, jsonSnapshot } from "../json-snapshot.js";
import type { Transport, Unsubscribe } from "../transport.js";
import { decodeWireText } from "../wire-frame.js";
import { utf8ByteLength } from "../utf8-byte-length.js";
import type { ElectronBridge, ElectronEvent } from "./bridge.js";
export type {
  ElectronBridge,
  ElectronEvent,
  ElectronFailure,
  ElectronConnectResult,
} from "./bridge.js";

const clientCodes = {
  not_ready: true,
  disposed: true,
  transport_closed: true,
  protocol_error: true,
  protocol_mismatch: true,
  schema_mismatch: true,
} satisfies Record<ClientErrorCode, true>;

const localError = (
  code: "bad_request" | "protocol_error" | "protocol_mismatch",
  message: string,
) => new HierError(code, "client", message);
const transportError = (reason: string, message: string) =>
  new HierError(
    "transport_closed",
    "transport",
    message,
    Object.freeze({ reason }),
  );
const unavailable = () =>
  transportError("ipc_unavailable", "Electron bridge operation failed");
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Capture functions once; later caller mutation cannot replace this claim's bridge. */
function captureBridge(value: ElectronBridge): ElectronBridge {
  let version: unknown;
  let functions: ElectronBridge;
  try {
    if (!record(value)) throw undefined;
    version = value.version;
    const { connect, start, send, close, release } = value;
    if (
      typeof version !== "number" ||
      [connect, start, send, close, release].some(
        (member) => typeof member !== "function",
      )
    )
      throw undefined;
    functions = {
      version: 1,
      connect: (listener) => connect.call(value, listener),
      start: (id) => start.call(value, id),
      send: (id, json) => send.call(value, id, json),
      close: (id) => close.call(value, id),
      release: (id) => release.call(value, id),
    };
  } catch {
    // Unknown thrown values may themselves have throwing diagnostic accessors.
    throw localError("bad_request", "Invalid Electron bridge capabilities");
  }
  if (version !== 1)
    throw localError(
      "protocol_mismatch",
      "Unsupported Electron bridge version",
    );
  return functions;
}

/** Only declared DTO fields are copied; unknown fields such as stack are ignored. */
function failure(value: unknown): HierError {
  if (!record(value)) throw undefined;
  const { code, origin, message, data } = value;
  if (
    typeof code !== "string" ||
    (!validateDefinition("WireErrorCode", code) &&
      !Object.hasOwn(clientCodes, code)) ||
    (origin !== "core" && origin !== "client" && origin !== "transport") ||
    typeof message !== "string" ||
    !record(data)
  )
    throw undefined;
  const owned = frozenJsonSnapshot({ code, origin, message, data }) as {
    code: HierError["code"];
    origin: HierError["origin"];
    message: string;
    data: Record<string, unknown>;
  };
  return new HierError(
    owned.code,
    owned.origin,
    owned.message,
    owned.data,
  );
}

interface CloseRegistration {
  handler: ((cause?: Error) => void) | undefined;
}
interface EarlyClose {
  readonly cause: HierError | undefined;
  readonly requestClose: boolean;
}

/** Claims an existing main session. Acquiring onMessage starts frame delivery. */
export async function connectElectronTransport(
  bridge: ElectronBridge,
): Promise<Transport> {
  const captured = captureBridge(bridge);
  const transport = new RendererTransport(captured);
  let result: unknown;
  try {
    result = await captured.connect((event) => transport.receive(event));
  } catch {
    transport.abandon();
    throw unavailable();
  }
  try {
    transport.claim(result);
  } catch (error) {
    transport.abandon();
    throw error;
  }
  return transport;
}

class RendererTransport implements Transport {
  private bridge: ElectronBridge | undefined;
  private sessionId: string | undefined;
  private closed = false;
  private cause: HierError | undefined;
  // Insertion order retains the first terminal event for each candidate id.
  // undefined represents an invalid envelope whose id cannot be identified.
  // No pre-claim frame text or decoded message is retained here.
  private readonly earlyCloses = new Map<string | undefined, EarlyClose>();
  private requestClose = false;
  private released = false;
  private readonly closes = new Set<CloseRegistration>();
  private readonly inbox = new FrameInbox(() =>
    this.transition(
      transportError(
        "prebind_buffer_overflow",
        "Initial transport buffer exceeded its limit",
      ),
      true,
    ),
  );

  constructor(bridge: ElectronBridge) {
    this.bridge = bridge;
  }

  claim(value: unknown): void {
    let sessionId: string | undefined;
    let rejected: HierError | undefined;
    try {
      if (!record(value)) throw undefined;
      const ok = value.ok;
      if (ok === true) {
        const version = value.version;
        const id = value.sessionId;
        if (version !== 1 || typeof id !== "string") throw undefined;
        sessionId = id;
      } else if (ok === false) rejected = failure(value.error);
      else throw undefined;
    } catch {
      throw localError("protocol_error", "Invalid Electron connect result");
    }
    if (rejected) throw rejected;
    this.sessionId = sessionId!;
    let earlyClose: EarlyClose | undefined;
    for (const [id, close] of this.earlyCloses) {
      if (id === sessionId || id === undefined) {
        earlyClose = close;
        break;
      }
    }
    this.earlyCloses.clear();
    if (this.closed) this.cleanup();
    else if (earlyClose)
      this.transition(earlyClose.cause, earlyClose.requestClose);
  }

  /** No confirmed claim: never guess an id to close/release someone else's session. */
  abandon(): void {
    this.closed = true;
    this.inbox.close();
    this.earlyCloses.clear();
    this.bridge = undefined;
  }

  receive(value: ElectronEvent): void {
    if (this.closed || this.earlyCloses.has(undefined)) return;
    let id: string | undefined;
    let kind: "frame" | "closed";
    let json: string | undefined;
    let cause: HierError | undefined;
    try {
      if (!record(value)) throw undefined;
      const incomingId = value.sessionId;
      if (typeof incomingId !== "string") throw undefined;
      // The bridge routes this callback by connectionId; stale session ids have
      // no authority over an already identified claim.
      if (this.sessionId !== undefined && incomingId !== this.sessionId) return;
      // A close observed before connect resolves is already final for that id.
      // Do not inspect later payloads that could replace its saved first cause.
      if (this.earlyCloses.has(incomingId)) return;
      id = incomingId;
      if (value.version !== 1) throw undefined;
      const incomingKind = value.kind;
      if (incomingKind === "frame") {
        const text = value.json;
        if (typeof text !== "string") throw undefined;
        kind = "frame";
        json = text;
      } else if (incomingKind === "closed") {
        kind = "closed";
        const error = value.error;
        if (error !== undefined) cause = failure(error);
      } else throw undefined;
    } catch {
      this.closeFromEvent(
        id,
        transportError("invalid_ipc_frame", "Invalid Electron bridge event"),
        true,
      );
      return;
    }
    // Reading a diagnostic or input accessor can synchronously close the transport.
    if (this.closed) return;
    if (this.sessionId === undefined) {
      if (kind === "closed") {
        this.closeFromEvent(id, cause, false);
      } else {
        // No start has been sent yet; main must not send frames before a claim.
        this.closeFromEvent(
          id,
          transportError("invalid_ipc_frame", "Frame arrived before connect"),
          true,
        );
      }
      return;
    }
    if (kind === "closed") {
      this.transition(cause, false);
      return;
    }
    try {
      if (/[\r\n]/u.test(json!)) throw undefined;
      const frame = decodeWireText(json!);
      this.inbox.push(frame, utf8ByteLength(json!));
    } catch {
      this.transition(
        transportError("invalid_frame", "Invalid Electron JSON frame"),
        true,
      );
    }
  }

  private closeFromEvent(
    id: string | undefined,
    cause: HierError | undefined,
    requestClose: boolean,
  ): void {
    if (this.closed) return;
    if (this.sessionId !== undefined) {
      this.transition(cause, requestClose);
    } else if (!this.earlyCloses.has(id)) {
      // Only a confirmed claim gives a candidate event authority over this
      // connection. Keep its first terminal outcome, never a frame queue.
      this.earlyCloses.set(id, { cause, requestClose });
    }
  }

  onMessage(handler: (message: unknown) => void): Unsubscribe {
    const off = this.inbox.bind(handler);
    queueMicrotask(() => {
      if (this.closed) return;
      try {
        this.bridge!.start(this.sessionId!);
      } catch {
        this.transition(unavailable(), true);
      }
    });
    return off;
  }

  onClose(handler: (cause?: Error) => void): Unsubscribe {
    const registration: CloseRegistration = { handler };
    this.closes.add(registration);
    if (this.closed) this.notify(registration);
    return () => {
      registration.handler = undefined;
      this.closes.delete(registration);
    };
  }

  private notify(registration: CloseRegistration): void {
    queueMicrotask(() => {
      const handler = registration.handler;
      if (!handler) return;
      registration.handler = undefined;
      this.closes.delete(registration);
      handler(this.cause);
    });
  }

  send(message: object): void {
    this.assertCanSend();
    let json: string;
    try {
      json = JSON.stringify(jsonSnapshot(message));
    } catch {
      this.assertCanSend();
      throw localError(
        "bad_request",
        "Expected an owning JSON request with Unicode scalar strings",
      );
    }
    this.assertCanSend();
    try {
      this.bridge!.send(this.sessionId!, json);
    } catch {
      this.transition(unavailable(), true);
      throw this.closedSendError();
    }
  }

  private assertCanSend(): void {
    if (this.closed) throw this.closedSendError();
    if (!this.inbox.bound)
      throw new HierError(
        "not_ready",
        "client",
        "Transport has no message receiver",
      );
  }

  private closedSendError(): HierError {
    const cause = this.cause;
    if (!cause) return transportError("closed", "Transport closed");
    if (cause.code === "transport_closed" && cause.origin === "transport")
      return cause;
    // onClose retains the original DTO. send reports the transport's terminal
    // state while keeping the already owned message and diagnostic data.
    return new HierError(
      "transport_closed",
      "transport",
      cause.message,
      cause.data,
    );
  }

  close(): void {
    this.transition(undefined, true);
  }

  private transition(
    cause: HierError | undefined,
    requestClose: boolean,
  ): void {
    if (this.closed) return;
    this.closed = true;
    this.cause = cause;
    this.requestClose = requestClose;
    this.inbox.close();
    this.cleanup();
    for (const registration of this.closes) this.notify(registration);
  }

  private cleanup(): void {
    if (this.released || this.sessionId === undefined || !this.bridge) return;
    this.released = true;
    const bridge = this.bridge;
    this.bridge = undefined;
    // Mark closed/released before crossing the bridge. Reentrant callbacks cannot
    // change the first cause or repeat cleanup, and close failure cannot skip release.
    if (this.requestClose) {
      try {
        bridge.close(this.sessionId);
      } catch {
        // The first close, including a normal close without an error, has won.
        // A cleanup fault cannot replace it or prevent the release attempt.
      }
    }
    try {
      bridge.release(this.sessionId);
    } catch {
      // The already closed transport keeps its first cause and local cleanup.
    }
  }
}
