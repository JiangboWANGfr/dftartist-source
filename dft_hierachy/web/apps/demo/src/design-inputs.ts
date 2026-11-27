import type { HierClient } from "@hier/client";
import { diagnostic } from "./design-diagnostic.js";

type InputResult = Awaited<ReturnType<HierClient["checkInputs"]>>["result"];
interface InputState {
  readonly phase: "idle" | "pending" | "success" | "failed" | "cancelled";
  /** The last successful Core observation, retained during pending/failure/cancellation. */
  readonly result: InputResult | undefined;
  readonly error: unknown;
  /** One display observation of the current failure; the original error remains authoritative. */
  readonly message: string | undefined;
}
interface Check {
  readonly controller: AbortController;
  completion: Promise<void>;
}

/** One session's input check. Core alone decides which snapshot inputs changed. */
export class DesignInputs {
  private state: InputState = Object.freeze({
    phase: "idle", result: undefined, error: undefined, message: undefined,
  });
  private readonly listeners = new Set<() => void>();
  private current: Check | undefined;
  private disposed = false;

  constructor(private readonly client: HierClient) {}
  readonly getSnapshot = (): InputState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(change: Partial<InputState>): void {
    if (this.disposed) return;
    this.state = Object.freeze({ ...this.state, ...change });
    const published = this.state;
    for (const listener of [...this.listeners]) {
      if (this.disposed || this.state !== published) break;
      if (!this.listeners.has(listener)) continue;
      try { listener(); }
      catch (error) { console.error("Input check subscriber failed", error); }
    }
  }
  check(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    // A burst of focus/manual commands joins this operation, without an implicit retry queue.
    if (this.current) return this.current.completion;
    const check: Check = { controller: new AbortController(), completion: Promise.resolve() };
    this.current = check;
    check.completion = this.run(check);
    this.publish({ phase: "pending", error: undefined, message: undefined });
    return check.completion;
  }
  private async run(check: Check): Promise<void> {
    // Publish ownership/completion before any subscriber can issue another command.
    await Promise.resolve();
    if (this.disposed || this.current !== check) return;
    let reply: Awaited<ReturnType<HierClient["checkInputs"]>>;
    try {
      reply = await this.client.checkInputs(check.controller.signal);
    } catch (error) {
      if (this.disposed || this.current !== check) return;
      const message = diagnostic(error);
      // Diagnostic getters may synchronously cancel, replace or release this task.
      if (this.disposed || this.current !== check) return;
      this.current = undefined;
      this.publish({ phase: "failed", error, message });
      return;
    }
    if (this.disposed || this.current !== check) return;
    this.current = undefined;
    // Notification failures are diagnostics, never a new Core query failure.
    this.publish({ phase: "success", result: reply.result, error: undefined, message: undefined });
  }
  cancel(): void {
    const check = this.current;
    if (!check) return;
    this.current = undefined;
    this.publish({ phase: "cancelled", error: undefined, message: undefined });
    // Publish before abort callbacks can start a newer check; never overwrite that intent.
    check.controller.abort();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    const check = this.current;
    this.current = undefined;
    check?.controller.abort();
    if (check)
      this.state = Object.freeze({ ...this.state, phase: "cancelled", error: undefined, message: undefined });
    // The shared client is borrowed. Its owner disposes it after every view/model.
  }
}
