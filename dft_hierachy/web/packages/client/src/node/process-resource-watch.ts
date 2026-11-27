import { execFile, type ChildProcess } from "node:child_process";
import { HierError } from "../errors.js";
import { validateWireDefinition } from "../wire-numbers.js";
import { decodeWireFrame } from "../wire-frame.js";
import type { ProcessResourceLimits } from "./index.js";

type Breach = (reason: string, message: string, data: Record<string, unknown>) => void;

/** Copy and validate before spawning; defaults never impose a new product limit. */
export function processResourceLimits(
  input: ProcessResourceLimits | undefined,
): ProcessResourceLimits {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HierError("bad_request", "client", "Invalid process resource limits");
  const limits: ProcessResourceLimits = {};
  for (const key of ["openTimeoutMillis", "cancelTimeoutMillis", "maxRssBytes"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value <= 0 || (key !== "maxRssBytes" && value > 2147483647))
      throw new HierError("bad_request", "client", `Invalid resource limit: ${key}`);
    limits[key] = value;
  }
  if (
    limits.maxRssBytes !== undefined &&
    process.platform !== "darwin" &&
    process.platform !== "linux"
  )
    throw new HierError("bad_request", "client", "Core RSS limits require macOS or Linux");
  return Object.freeze(limits);
}

/** Observes the owned process's lifecycle, never query results or domain facts. */
export class ProcessResourceWatch {
  private closed = false;
  private opened = false;
  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private sampleTimer: ReturnType<typeof setTimeout> | undefined;
  private sampling: Promise<void> | undefined;
  private sampler:
    { controller: AbortController; child: ChildProcess; closed: Promise<void> } | undefined;
  private readonly outstanding = new Set<number>();
  private readonly cancellations = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly limits: ProcessResourceLimits,
    private readonly breach: Breach,
  ) {
    const limit = limits.openTimeoutMillis;
    if (limit !== undefined) {
      const start = performance.now();
      this.openTimer = setTimeout(
        () =>
          this.breach(
            "open_timeout",
            "Core opening exceeded its time budget; reopen the design to retry",
            { limitMillis: limit, observedMillis: performance.now() - start },
          ),
        limit,
      );
    }
  }

  startSampling(pid: number): void {
    if (this.closed || this.limits.maxRssBytes === undefined) return;
    this.sampling = this.sample(pid);
  }

  private async sample(pid: number): Promise<void> {
    const controller = new AbortController();
    let closed = Promise.resolve();
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(
          "/bin/ps",
          ["-o", "rss=", "-p", String(pid)],
          {
            signal: controller.signal,
            timeout: 1000,
            killSignal: "SIGKILL",
            maxBuffer: 1024,
            encoding: "utf8",
          },
          (error, text) => (error ? reject(error) : resolve(text)),
        );
        closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
        this.sampler = { controller, child, closed };
      });
      if (this.closed) return;
      if (!/^\s*\d+\s*$/.test(stdout)) throw new Error("Invalid Core RSS observation");
      const observedBytes = Number(stdout.trim()) * 1024;
      if (!Number.isSafeInteger(observedBytes)) throw new Error("Invalid Core RSS observation");
      if (observedBytes > this.limits.maxRssBytes!) {
        this.breach(
          "memory_limit",
          "Core exceeded its memory budget; reopen with a larger budget or smaller design",
          {
            limitBytes: this.limits.maxRssBytes,
            observedBytes,
          },
        );
        return;
      }
    } catch (error) {
      if (!this.closed)
        this.breach("resource_monitor_failed", "Core memory monitoring failed; session closed", {
          detail: error instanceof Error ? error.message : "RSS observation failed",
        });
      return;
    } finally {
      // AbortError can precede exit/pipe close. Result settlement is not reaping.
      await closed;
      if (this.sampler?.controller === controller) this.sampler = undefined;
    }
    if (!this.closed) this.sampleTimer = setTimeout(() => this.startSampling(pid), 100);
  }

  sent(json: string): void {
    if (this.closed || this.limits.cancelTimeoutMillis === undefined) return;
    const frame = decodeWireFrame(json);
    if (!validateWireDefinition("ClientFrame", frame)) return;
    const value = frame as {
      id?: number;
      method: string;
      params: { target?: number };
    };
    if (value.method !== "cancel") {
      if (value.id !== undefined) this.outstanding.add(value.id);
      return;
    }
    const target = value.params.target!;
    if (!this.outstanding.has(target) || this.cancellations.has(target)) return;
    const limit = this.limits.cancelTimeoutMillis;
    const start = performance.now();
    this.cancellations.set(
      target,
      setTimeout(
        () =>
          this.breach(
            "cancel_timeout",
            "Core did not finish cancellation within its budget; reopen the design to continue",
            {
              requestId: target,
              limitMillis: limit,
              observedMillis: performance.now() - start,
            },
          ),
        limit,
      ),
    );
  }

  received(frame: unknown): void {
    if (this.closed || !frame || typeof frame !== "object") return;
    if (
      this.limits.openTimeoutMillis !== undefined &&
      !this.opened &&
      validateWireDefinition("Hello", frame)
    ) {
      this.opened = true;
      clearTimeout(this.openTimer);
      this.openTimer = undefined;
    }
    if (
      this.limits.cancelTimeoutMillis === undefined ||
      !validateWireDefinition("ServerFrame", frame)
    )
      return;
    const value = frame as { event?: unknown; id?: number; ok?: boolean };
    // Extension events may contain id fields; they never acknowledge a request.
    if (value.event !== undefined || value.id === undefined || typeof value.ok !== "boolean")
      return;
    this.outstanding.delete(value.id);
    clearTimeout(this.cancellations.get(value.id));
    this.cancellations.delete(value.id);
  }

  stop(): Promise<void> {
    this.closed = true;
    clearTimeout(this.openTimer);
    clearTimeout(this.sampleTimer);
    this.sampler?.controller.abort();
    for (const timer of this.cancellations.values()) clearTimeout(timer);
    this.cancellations.clear();
    this.outstanding.clear();
    return this.sampling ?? this.sampler?.closed ?? Promise.resolve();
  }
}
