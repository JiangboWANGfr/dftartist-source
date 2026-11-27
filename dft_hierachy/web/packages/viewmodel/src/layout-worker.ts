import ElkModule from "elkjs/lib/elk-api.js";
import type {
  ELK,
  ELKConstructorArguments,
  ElkNode,
} from "elkjs/lib/elk-api.js";

// The published API is CommonJS/UMD; this is its one runtime import boundary.
const Elk = ElkModule as unknown as {
  new (options: ELKConstructorArguments): ELK;
};
type FailureKind = "worker_failure" | "layout_failure";

/** Own the native Worker while reusing ELK's actual API. The small facade contains
 * transport failures before upstream's registration promise can become unhandled.
 * Application waiters and cancellation remain owned by LayoutService. */
export class LayoutWorker {
  #closed = false;
  #requests = new Map<unknown, string>();
  #receiver: ((event: MessageEvent) => void) | null = null;
  #worker: Worker | undefined;
  #registered: [string, EventListener][] = [];
  constructor(
    worker: Worker,
    private readonly fail: (kind: FailureKind, cause: unknown) => void,
  ) {
    this.#worker = worker;
  }
  start(graph: ElkNode, complete: (result: unknown) => void): void {
    if (this.#closed) return;
    const worker = this.#worker!;
    let failureReported = false;
    const reportFailure = (kind: FailureKind, cause: unknown) => {
      if (this.#closed) return;
      failureReported = true;
      this.fail(kind, cause);
    };
    const listen = (kind: string, listener: EventListener) => {
      if (this.#closed) return false;
      const add = worker.addEventListener;
      if (this.#closed) return false;
      this.#registered.push([kind, listener]);
      const errors: unknown[] = [];
      try {
        add.call(worker, kind, listener);
      } catch (cause) {
        errors.push(cause);
      }
      // A host adapter can close us inside registration, then install the listener
      // after close already drained its registry. Reconcile that late installation.
      if (this.#closed) {
        try {
          worker.removeEventListener(kind, listener);
        } catch (cause) {
          errors.push(cause);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(
          errors,
          "Layout Worker registration cleanup failed",
        );
      return !this.#closed;
    };
    if (
      !listen("message", ((event: MessageEvent) => {
        if (this.#closed) return;
        try {
          const data = event.data as { id: unknown; error?: unknown };
          const command = this.#requests.get(data.id);
          if (!command) return;
          this.#requests.delete(data.id);
          if (data.error) {
            // Do not ask upstream's error converter to inspect/mutate thrown objects.
            reportFailure(
              command === "layout" ? "layout_failure" : "worker_failure",
              data.error,
            );
          } else this.#receiver?.(event);
        } catch (cause) {
          reportFailure("worker_failure", cause);
        }
      }) as EventListener)
    )
      return;
    for (const kind of ["error", "messageerror"])
      if (
        !listen(kind, ((event: ErrorEvent) => {
          if (this.#closed) return;
          event.preventDefault();
          reportFailure("worker_failure", event.error ?? event);
        }) as EventListener)
      )
        return;
    const self = this;
    let retiredSendFailure: { cause: unknown } | undefined;
    const checkSend = () => {
      if (retiredSendFailure) throw retiredSendFailure.cause;
    };
    const facade = {
      get onmessage() {
        return self.#receiver;
      },
      set onmessage(value: ((event: MessageEvent) => void) | null) {
        if (!self.#closed) self.#receiver = value;
      },
      postMessage(message: { id: unknown; cmd: string }) {
        if (self.#closed) return;
        try {
          const post = worker.postMessage;
          if (self.#closed) return;
          self.#requests.set(message.id, message.cmd);
          post.call(worker, message);
        } catch (cause) {
          // ELK sends inside a Promise executor. Keep a synchronous exception
          // after host disposal for the service's existing startup guard, without
          // rejecting ELK's registration promise or changing a live terminal cause.
          if (self.#closed) {
            if (!failureReported) retiredSendFailure = { cause };
          } else reportFailure("worker_failure", cause);
        }
      },
      terminate() {
        /* The sole owner closes the native Worker below. */
      },
    };
    const elk = new Elk({
      algorithms: ["layered"],
      workerFactory: () => facade as unknown as Worker,
    });
    checkSend();
    if (this.#closed) return;
    const pending = elk.layout(graph);
    checkSend();
    void pending.then(
      (value) => {
        if (!this.#closed) complete(value);
      },
      (cause) => {
        if (!this.#closed) reportFailure("layout_failure", cause);
      },
    );
  }
  close(): unknown[] {
    if (this.#closed) return [];
    this.#closed = true;
    const worker = this.#worker;
    this.#worker = undefined;
    this.#receiver = null;
    this.#requests.clear();
    const errors: unknown[] = [];
    for (const [type, listener] of this.#registered) {
      try {
        worker?.removeEventListener(type, listener);
      } catch (cause) {
        errors.push(cause);
      }
    }
    this.#registered = [];
    try {
      worker?.terminate();
    } catch (cause) {
      errors.push(cause);
    }
    return errors;
  }
}
