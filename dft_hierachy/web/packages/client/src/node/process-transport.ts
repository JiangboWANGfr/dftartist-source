import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HierError } from "../errors.js";
import { jsonSnapshot } from "../json-snapshot.js";
import type { Unsubscribe } from "../transport.js";
import type { ProcessExit, ProcessTransport, ProcessTransportOptions } from "./index.js";
import { NdjsonReader, StderrTail } from "./ndjson.js";
import { FrameInbox } from "../frame-inbox.js";
import { decodeWireFrame } from "../wire-frame.js";
import { processResourceLimits, ProcessResourceWatch } from "./process-resource-watch.js";

/** Package-private channel for forwarding validated text across a process boundary. */
export interface ProcessTextTransport extends Omit<ProcessTransport, "onMessage" | "send"> {
  onMessage(handler: (json: string) => void): Unsubscribe;
  send(json: string): void;
}
type CloseRegistration = {
  handler: (cause?: Error) => void;
  live: boolean;
  notified: boolean;
};
const DEFAULT_SHUTDOWN_GRACE = 2000;

/** The Node-only entry owns one child process for its complete lifetime. */
export function createProcessTransport(options: ProcessTransportOptions): ProcessTransport {
  return new ChildTransport<unknown, object>(
    options,
    (frame) => frame,
    (message) => JSON.stringify(jsonSnapshot(message)),
  );
}

/** Not exported by the package: Electron main will reuse the same process owner. */
export function createProcessTextTransport(options: ProcessTransportOptions): ProcessTextTransport {
  return new ChildTransport<string, string>(
    options,
    (_frame, json) => json,
    (json) => {
      if (typeof json !== "string" || /[\r\n]/.test(json))
        throw new TypeError("Expected one JSON frame without NDJSON delimiters");
      decodeWireFrame(json);
      return json;
    },
  );
}

class ChildTransport<Incoming, Outgoing> {
  readonly exited: Promise<ProcessExit>;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly reader = new NdjsonReader();
  private readonly stderr = new StderrTail();
  private readonly grace: number;
  private closed = false;
  private cause?: HierError;
  private readonly inbox = new FrameInbox<Incoming>(() =>
    this.transition(
      this.error("prebind_buffer_overflow", "Initial transport buffer exceeded its limit"),
    ),
  );
  private readonly closes = new Set<CloseRegistration>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private processExited = false;
  private spawnFailure: HierError | undefined;
  private readonly resources: ProcessResourceWatch;

  constructor(
    options: ProcessTransportOptions,
    private readonly projectFrame: (frame: unknown, json: string) => Incoming,
    private readonly encode: (message: Outgoing) => string,
  ) {
    const limits = processResourceLimits(options.resourceLimits);
    this.grace =
      options.shutdownGraceMillis === undefined
        ? DEFAULT_SHUTDOWN_GRACE
        : options.shutdownGraceMillis;
    if (
      !Number.isInteger(this.grace) ||
      this.grace < 0 ||
      this.grace > 2147483647 ||
      typeof options.command !== "string" ||
      !options.command ||
      options.command.includes("\0") ||
      !Array.isArray(options.args) ||
      options.args.some((a) => typeof a !== "string" || a.includes("\0")) ||
      (options.cwd !== undefined && (typeof options.cwd !== "string" || options.cwd.includes("\0")))
    )
      throw new HierError("bad_request", "client", "Invalid process transport options");
    this.child = spawn(options.command, [...options.args], {
      shell: false,
      stdio: "pipe",
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
    });
    this.resources = new ProcessResourceWatch(limits, (reason, message, data) =>
      this.transition(this.error(reason, message, data), 0),
    );
    this.child.once("spawn", () => {
      if (!this.closed && this.child.pid !== undefined)
        this.resources.startSampling(this.child.pid);
    });
    this.exited = new Promise((resolve, reject) => {
      this.child.once("close", (code, signal) => {
        this.processExited = true;
        if (this.timer) clearTimeout(this.timer);
        this.transition(this.error("process_exit", "Child process closed", { code, signal }));
        this.reader.clear();
        // Owned handles have closed. External unsubscribe never removes these listeners.
        this.child.stdout.removeAllListeners();
        this.child.stderr.removeAllListeners();
        this.child.stdin.removeAllListeners();
        this.child.removeAllListeners();
        void this.resources.stop().then(() => {
          if (this.spawnFailure) reject(this.spawnFailure);
          else resolve({ code, signal });
        });
      });
    });
    void this.exited.catch(() => {});
    this.child.once("error", (cause) => {
      this.spawnFailure = this.error("spawn_failed", cause.message);
      this.transition(this.spawnFailure);
    });
    this.child.once("exit", (code, signal) => {
      this.processExited = true;
      if (this.timer) clearTimeout(this.timer);
      // Exit observed before binding wins over any unconsumed stdout/hello.
      this.transition(this.error("process_exit", "Child process exited", { code, signal }));
    });
    this.child.stderr.on("data", (chunk: Buffer) => this.stderr.append(chunk));
    this.child.stderr.on("error", (cause) =>
      this.transition(this.error("stderr_error", cause.message)),
    );
    this.child.stdin.on("error", (cause) =>
      this.transition(this.error("stdin_error", cause.message)),
    );
    this.child.stdout.on("error", (cause) =>
      this.transition(this.error("stdout_error", cause.message)),
    );
    this.child.stdout.on("data", (chunk: Buffer) => {
      if (this.closed) return;
      try {
        this.reader.feed(
          chunk,
          (frame, bytes, json) => {
            this.resources.received(frame);
            return this.inbox.push(this.projectFrame(frame, json), bytes);
          },
          () => this.inbox.checkPartial(this.reader.pendingBytes),
        );
      } catch (cause) {
        this.transition(
          this.error("invalid_frame", cause instanceof Error ? cause.message : "Invalid NDJSON"),
        );
      }
    });
    this.child.stdout.once("end", () => {
      if (this.closed) return;
      try {
        this.reader.finish();
      } catch (cause) {
        this.transition(this.error("invalid_frame", (cause as Error).message));
        return;
      }
      this.transition(this.error("stdout_eof", "Child stdout reached EOF"));
    });
  }

  private error(reason: string, message: string, data: Record<string, unknown> = {}): HierError {
    return new HierError("transport_closed", "transport", message, {
      ...data,
      reason,
      stderr: this.stderr.text(),
    });
  }

  onMessage(handler: (message: Incoming) => void): Unsubscribe {
    return this.inbox.bind(handler);
  }

  onClose(handler: (cause?: Error) => void): Unsubscribe {
    const registration = { handler, live: true, notified: false };
    this.closes.add(registration);
    if (this.closed) this.notify(registration);
    return () => {
      registration.live = false;
      this.closes.delete(registration);
    };
  }

  private notify(registration: CloseRegistration): void {
    queueMicrotask(() => {
      if (!registration.live || registration.notified) return;
      registration.notified = true;
      this.closes.delete(registration);
      registration.handler(this.cause);
    });
  }

  send(message: Outgoing): void {
    if (this.closed) throw this.cause ?? this.error("closed", "Transport closed");
    if (!this.inbox.bound)
      throw new HierError("not_ready", "client", "Transport has no message receiver");
    try {
      // Node's writable stream retains partial writes and drains in order.
      const json = this.encode(message);
      this.child.stdin.write(json + "\n", "utf8");
      this.resources.sent(json);
    } catch (cause) {
      const error = this.error(
        "stdin_error",
        cause instanceof Error ? cause.message : "Cannot write request",
      );
      this.transition(error);
      throw error;
    }
  }

  close(): void {
    this.transition(undefined, this.grace);
  }

  private transition(cause?: HierError, grace = DEFAULT_SHUTDOWN_GRACE): void {
    if (this.closed) return;
    this.closed = true;
    void this.resources.stop();
    if (cause) this.cause = cause;
    this.inbox.close();
    this.reader.clear();
    for (const registration of this.closes) this.notify(registration);
    this.child.stdin.end();
    if (!this.processExited && !this.spawnFailure) {
      // shutdownGraceMillis controls explicit close. EOF/fault cleanup gives the
      // process the default natural-exit grace, preserving its actual exit code
      // when stdout ends before Node receives the OS exit event.
      if (grace === 0) this.child.kill("SIGKILL");
      else
        this.timer = setTimeout(() => {
          if (!this.processExited) this.child.kill("SIGKILL");
        }, grace);
    }
  }
}
