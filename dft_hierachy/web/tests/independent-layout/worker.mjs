// Test-only controlled native-Worker surface at the public factory boundary.
// ELK 0.12.0 lib/elk-api.js RPC: register/layout; this gate does NOT compute ELK.
import assert from "node:assert/strict";
export class MessageGate extends EventTarget {
  onmessage = null;
  onerror = null;
  onmessageerror = null;
  messages = [];
  registrations = new Map();
  terminated = 0;
  saved = [];
  postError = null;
  terminateError = null;
  onTerminate = null;
  onLayout = null;
  addEventListener(type, fn, options) {
    super.addEventListener(type, fn, options);
    if (fn) {
      if (!this.registrations.has(type)) this.registrations.set(type, new Set());
      this.registrations.get(type).add(fn);
    }
  }
  removeEventListener(type, fn, options) {
    super.removeEventListener(type, fn, options);
    this.registrations.get(type)?.delete(fn);
  }
  handlers(type) {
    return [this["on" + type], ...(this.registrations.get(type) ?? [])].filter(Boolean);
  }
  postMessage(message) {
    if (this.postError) throw this.postError;
    const copy = structuredClone(message);
    this.messages.push(copy);
    this.saved = this.handlers("message");
    if (copy.cmd === "layout") this.onLayout?.(this);
    if (copy.cmd === "register")
      queueMicrotask(() => this.emit("message", { id: copy.id, data: undefined }));
  }
  get request() {
    const request = this.messages.findLast((m) => m.cmd === "layout");
    assert(request, "the pinned native ELK layout request was posted");
    return request;
  }
  emit(type, data, late = false) {
    const event =
      type === "message"
        ? new MessageEvent(type, { data })
        : Object.assign(new Event(type), { error: data, message: "B controlled Worker failure" });
    for (const fn of late ? this.saved : this.handlers(type)) {
      if (typeof fn === "function") fn.call(this, event);
      else fn.handleEvent(event);
    }
  }
  succeed(data = geometry(this.request.graph), late = false) {
    this.emit("message", { id: this.request.id, data }, late);
  }
  fail(error, late = false) {
    this.emit("message", { id: this.request.id, error }, late);
  }
  terminate() {
    this.terminated++;
    this.onTerminate?.();
    if (this.terminateError) throw this.terminateError;
  }
  get handlerCount() {
    return ["message", "error", "messageerror"].reduce((n, k) => n + this.handlers(k).length, 0);
  }
}
export function geometry(input) {
  const graph = structuredClone(input);
  graph.width = 400;
  graph.height = 240;
  graph.children.forEach((n, i) => {
    n.x = 17 + 83 * i;
    n.y = 23 + 31 * i;
    n.ports?.forEach((p, j) => {
      p.x = -2;
      p.y = j * 7;
    });
  });
  graph.edges?.forEach((e, i) => {
    e.sections = [
      {
        id: "B-section-" + i,
        startPoint: { x: i + 1, y: 2 },
        bendPoints: [{ x: 9, y: i + 4 }],
        endPoint: { x: 18, y: 22 },
      },
    ];
  });
  return graph;
}
