import {
  METHODS,
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  canonicalParams,
  validateDefinition,
  type Completeness,
  type MethodName,
  type ParamsOf,
  type ResultOf,
  type SnapshotInfo,
  type SourceKind,
} from "@hier/protocol-types";
import { HierError, transportError } from "./errors.js";
import { frozenJsonSnapshot, jsonSnapshot, type DeepReadonly } from "./json-snapshot.js";
import { ReplyCache } from "./reply-cache.js";
import type { Transport, Unsubscribe } from "./transport.js";
import { copyWireNumbers, validateWireDefinition } from "./wire-numbers.js";

export interface ClientOptions {
  cacheEntries?: number;
  cacheBytes?: number;
}
export type Reply<T> = DeepReadonly<{ result: T; completeness: Completeness }>;
export type PageReq = Pick<ParamsOf<"inst.children">, "cursor" | "limit">;
type Pending = { id: number; key: string; method: MethodName; subscribers: Set<Subscriber> };
type Subscriber = {
  resolve: (value: Reply<unknown>) => void;
  reject: (cause: HierError) => void;
  detach: Unsubscribe;
};
const localError = (code: ConstructorParameters<typeof HierError>[0], message: string) =>
  new HierError(code, "client", message);

export class HierClient {
  readonly ready: Promise<DeepReadonly<SnapshotInfo>>;
  private resolveReady!: (snapshot: DeepReadonly<SnapshotInfo>) => void;
  private rejectReady!: (error: HierError) => void;
  private currentSnapshot?: DeepReadonly<SnapshotInfo>;
  private failure?: HierError;
  private generation = 0;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly deduplicated = new Map<string, Pending>();
  private readonly indexListeners = new Set<() => void>();
  private readonly cache: ReplyCache<Reply<unknown>>;
  private offMessage: Unsubscribe = () => {};
  private offClose: Unsubscribe = () => {};

  constructor(
    private readonly transport: Transport,
    options: ClientOptions = {},
  ) {
    const entries = options.cacheEntries ?? 256,
      bytes = options.cacheBytes ?? 8 * 1024 * 1024;
    for (const value of [options.cacheEntries, options.cacheBytes]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw localError("bad_request", "Cache limits must be nonnegative safe integers");
    }
    this.cache = new ReplyCache(entries, bytes);
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // A late consumer still observes rejection; this only prevents an unhandled rejection.
    void this.ready.catch(() => {});
    const generation = this.generation;
    try {
      this.offClose = transport.onClose((cause) => {
        if (generation === this.generation) this.fail(transportError(cause));
      });
      this.offMessage = transport.onMessage((message) => {
        if (generation === this.generation && !this.failure) this.receive(message);
      });
    } catch (cause) {
      this.offClose();
      // Failure to acquire ownership must not close the original receiver's transport.
      this.rejectReady(localError("bad_request", "Transport receiver is already owned"));
      throw cause;
    }
  }

  get snapshot(): DeepReadonly<SnapshotInfo> {
    if (!this.currentSnapshot) throw this.failure ?? localError("not_ready", "Waiting for hello");
    return this.currentSnapshot;
  }

  onIndexReady(handler: () => void): Unsubscribe {
    if (!this.failure) this.indexListeners.add(handler);
    return () => {
      this.indexListeners.delete(handler);
    };
  }

  dispose(): void {
    this.fail(localError("disposed", "Client disposed"));
  }

  private fail(error: HierError): void {
    if (this.failure) return;
    this.failure = error;
    this.generation++;
    this.offMessage();
    this.offClose();
    this.rejectReady(error);
    for (const request of this.pending.values()) this.settle(request, undefined, error);
    this.cache.clear();
    this.indexListeners.clear();
    this.transport.close();
  }

  private protocolFault(message: string): void {
    this.fail(localError("protocol_error", message));
  }

  private receive(input: unknown): void {
    let frame: Record<string, unknown>;
    try {
      const copy = frozenJsonSnapshot(input);
      if (!copy || typeof copy !== "object" || Array.isArray(copy))
        throw new TypeError("Expected a frame object");
      frame = copy as Record<string, unknown>;
      copyWireNumbers(input, frame);
    } catch {
      this.protocolFault("Transport delivered a non-JSON frame");
      return;
    }
    if (!this.currentSnapshot) {
      if (frame.event !== "hello") {
        this.protocolFault("First frame must be hello");
        return;
      }
      if (typeof frame.protocol === "number" && frame.protocol !== PROTOCOL_VERSION) {
        this.fail(localError("protocol_mismatch", "Unsupported protocol version"));
        return;
      }
      const snapshot = frame.snapshot as Record<string, unknown> | undefined;
      if (
        snapshot &&
        typeof snapshot.schemaVersion === "number" &&
        snapshot.schemaVersion !== SCHEMA_VERSION
      ) {
        this.fail(localError("schema_mismatch", "Unsupported schema version"));
        return;
      }
      if (!validateWireDefinition("Hello", frame)) {
        this.protocolFault("Invalid hello frame");
        return;
      }
      this.currentSnapshot = frame.snapshot;
      this.resolveReady(this.currentSnapshot);
      return;
    }
    if (!validateWireDefinition("ServerFrame", frame)) {
      this.protocolFault("Invalid server frame");
      return;
    }
    if (frame.event !== undefined) {
      switch (frame.event) {
        case "hello":
          this.protocolFault("Duplicate hello");
          break;
        case "protocol_error":
          if (validateWireDefinition("ProtocolError", frame))
            this.fail(
              new HierError(
                frame.error.code,
                "core",
                frame.error.message,
                frame.error.data,
              ),
            );
          break;
        case "progress":
          if (validateWireDefinition("Progress", frame) && frame.done > frame.total)
            this.protocolFault("Progress exceeds total");
          break;
        case "index":
          for (const handler of [...this.indexListeners]) {
            if (!this.failure && this.indexListeners.has(handler)) handler();
          }
          break;
        // Extension events are deliberately ignored, including their payload fields.
      }
      return;
    }
    const request = this.pending.get(frame.id as number);
    if (!request) return;
    if (validateWireDefinition("Failure", frame)) {
      this.settle(
        request,
        undefined,
        new HierError(frame.error.code, "core", frame.error.message, frame.error.data),
      );
      return;
    }
    if (!validateWireDefinition(METHODS[request.method].response, frame)) {
      this.protocolFault(`Invalid result for ${request.method}`);
      return;
    }
    // The inbound copy already owns and freezes both subtrees.
    const reply = Object.freeze({
      result: frame.result,
      completeness: frame.completeness,
    }) as Reply<unknown>;
    if (METHODS[request.method].cacheComplete && reply.completeness.status === "complete")
      this.cache.put(request.key, reply);
    this.settle(request, reply);
  }

  private forget(request: Pending): void {
    this.pending.delete(request.id);
    this.deduplicated.delete(request.key);
  }

  private settle(request: Pending, reply?: Reply<unknown>, error?: HierError): void {
    this.forget(request);
    for (const subscriber of request.subscribers) {
      subscriber.detach();
      if (error) subscriber.reject(error);
      else subscriber.resolve(reply!);
    }
    request.subscribers.clear();
  }

  private send(message: object): void {
    try {
      this.transport.send(message);
    } catch (cause) {
      this.fail(transportError(cause));
    }
  }

  private query<M extends MethodName>(
    method: M,
    input: ParamsOf<M>,
    signal?: AbortSignal,
  ): Promise<Reply<ResultOf<M>>> {
    if (signal?.aborted) return Promise.reject(localError("cancelled", "Query aborted"));
    if (this.failure) return Promise.reject(this.failure);
    if (!this.currentSnapshot) return Promise.reject(localError("not_ready", "Waiting for hello"));
    let params: ParamsOf<M>;
    try {
      const copy = jsonSnapshot(input);
      if (!validateDefinition(METHODS[method].params, copy))
        throw new TypeError(`Invalid params for ${method}`);
      params = canonicalParams(method, copy as ParamsOf<M>);
    } catch (cause) {
      return Promise.reject(
        this.failure ??
          localError(
            "bad_request",
            cause instanceof Error ? cause.message : "Invalid query parameters",
          ),
      );
    }
    // Parameter accessors can reenter dispose or abort while we make the copy.
    // Recheck before cache lookup, ID allocation, pending registration or send.
    if (this.failure) return Promise.reject(this.failure);
    if (signal?.aborted) return Promise.reject(localError("cancelled", "Query aborted"));
    const key = JSON.stringify([this.currentSnapshot.snapshotId, method, params]);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached as Reply<ResultOf<M>>);
    let request = this.deduplicated.get(key);
    const isNew = !request;
    if (!request) {
      if (!Number.isSafeInteger(this.nextId))
        return Promise.reject(
          new HierError("bad_request", "client", "Request IDs exhausted", {
            reason: "id_exhausted",
          }),
        );
      request = { id: this.nextId++, key, method, subscribers: new Set() };
      this.pending.set(request.id, request);
      this.deduplicated.set(key, request);
    }
    const pending = request;
    const promise = new Promise<Reply<unknown>>((resolve, reject) => {
      const subscriber: Subscriber = {
        resolve,
        reject,
        detach: () => signal?.removeEventListener("abort", abort),
      };
      const abort = () => {
        if (!pending.subscribers.delete(subscriber)) return;
        subscriber.detach();
        subscriber.reject(localError("cancelled", "Query aborted"));
        if (!pending.subscribers.size) {
          this.forget(pending);
          this.send({ method: "cancel", params: { target: pending.id } });
        }
      };
      pending.subscribers.add(subscriber);
      signal?.addEventListener("abort", abort, { once: true });
    });
    if (isNew)
      this.send({ id: pending.id, method, snapshot: this.currentSnapshot.snapshotId, params });
    return promise as Promise<Reply<ResultOf<M>>>;
  }

  info(signal?: AbortSignal) {
    return this.query("design.info", {}, signal);
  }
  diagnostics(
    options: Pick<ParamsOf<"design.diagnostics">, "maxItems"> = {},
    signal?: AbortSignal,
  ) {
    return this.query("design.diagnostics", options, signal);
  }
  checkInputs(signal?: AbortSignal) {
    return this.query("design.checkInputs", {}, signal);
  }
  roots(signal?: AbortSignal) {
    return this.query("inst.roots", {}, signal);
  }
  children(inst: string, page: PageReq = {}, signal?: AbortSignal) {
    return this.query("inst.children", { ...page, inst }, signal);
  }
  ancestors(inst: string, signal?: AbortSignal) {
    return this.query("inst.ancestors", { inst }, signal);
  }
  instance(inst: string, signal?: AbortSignal) {
    return this.query("inst.get", { inst }, signal);
  }
  ports(inst: string, signal?: AbortSignal) {
    return this.query("inst.ports", { inst }, signal);
  }
  params(inst: string, signal?: AbortSignal) {
    return this.query("inst.params", { inst }, signal);
  }
  signals(
    inst: string,
    options: Pick<ParamsOf<"inst.signals">, "cursor" | "limit" | "filter"> = {},
    signal?: AbortSignal,
  ) {
    return this.query("inst.signals", { ...options, inst }, signal);
  }
  definitions(page: PageReq = {}, signal?: AbortSignal) {
    return this.query("def.list", page, signal);
  }
  instancesOf(def: string, page: PageReq = {}, signal?: AbortSignal) {
    return this.query("def.instances", { ...page, def }, signal);
  }
  search(
    query: Pick<ParamsOf<"search">, "text" | "kinds" | "scope">,
    page: PageReq = {},
    signal?: AbortSignal,
  ) {
    return this.query("search", { ...page, ...query }, signal);
  }
  resolvePath(text: string, signal?: AbortSignal) {
    return this.query("path.resolve", { text }, signal);
  }
  bindings(inst: string, signal?: AbortSignal) {
    return this.query("conn.bindings", { inst }, signal);
  }
  drivers(request: ParamsOf<"conn.drivers">, signal?: AbortSignal) {
    return this.query("conn.drivers", request, signal);
  }
  loads(request: ParamsOf<"conn.loads">, signal?: AbortSignal) {
    return this.query("conn.loads", request, signal);
  }
  step(request: ParamsOf<"conn.step">, signal?: AbortSignal) {
    return this.query("conn.step", request, signal);
  }
  cone(request: ParamsOf<"trace.cone">, signal?: AbortSignal) {
    return this.query("trace.cone", request, signal);
  }
  paths(request: ParamsOf<"trace.paths">, signal?: AbortSignal) {
    return this.query("trace.paths", request, signal);
  }
  registers(
    inst: string,
    options: Pick<ParamsOf<"seq.registers">, "cursor" | "limit" | "recursive"> = {},
    signal?: AbortSignal,
  ) {
    return this.query("seq.registers", { ...options, inst }, signal);
  }
  procs(inst: string, page: PageReq = {}, signal?: AbortSignal) {
    return this.query("proc.list", { ...page, inst }, signal);
  }
  proc(ref: string, signal?: AbortSignal) {
    return this.query("proc.get", { ref }, signal);
  }
  object(ref: string, signal?: AbortSignal) {
    return this.query("obj.get", { ref }, signal);
  }
  source(ref: string, kind: SourceKind, signal?: AbortSignal) {
    return this.query("obj.source", { ref, kind }, signal);
  }
  resolveSource(
    query: Pick<ParamsOf<"source.resolve">, "file" | "line" | "col">,
    page: PageReq = {},
    signal?: AbortSignal,
  ) {
    return this.query("source.resolve", { ...page, ...query }, signal);
  }
  readSource(file: string, signal?: AbortSignal) {
    return this.query("source.read", { file }, signal);
  }
}
