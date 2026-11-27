// Reuses the original tree HTTP bridge protocol; not Electron or production IPC.
export class CoreWire {
  messages = new Set();
  closes = new Set();
  sent = [];
  buffer = [];
  closed = false;
  constructor(id) {
    this.id = id;
    this.abort = new AbortController();
    this.pollDone = this.poll();
  }
  onMessage(f) {
    this.messages.add(f);
    queueMicrotask(() => {
      if (this.messages.size)
        for (const x of this.buffer.splice(0)) this.emit(x);
    });
    return () => this.messages.delete(f);
  }
  onClose(f) {
    this.closes.add(f);
    return () => this.closes.delete(f);
  }
  emit(v) {
    for (const f of [...this.messages]) if (this.messages.has(f)) f(v);
  }
  localClose(e = Error("B54 Core EOF")) {
    if (this.closed) return;
    this.closed = true;
    for (const f of [...this.closes]) if (this.closes.has(f)) f(e);
  }
  async poll() {
    try {
      while (!this.closed) {
        const r = await fetch("/core/poll?id=" + encodeURIComponent(this.id), {
          signal: this.abort.signal,
        });
        if (!r.ok) throw Error("Core poll HTTP " + r.status);
        const d = await r.json();
        for (const f of d.frames) {
          if (this.messages.size) this.emit(f);
          else this.buffer.push(f);
        }
        if (d.closed) {
          this.localClose();
          break;
        }
      }
    } catch (e) {
      if (!this.closed) this.localClose(e);
    }
  }
  send(frame) {
    if (this.closed) throw Error("Core transport closed");
    this.sent.push(structuredClone(frame));
    fetch("/core/send?id=" + encodeURIComponent(this.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frame),
      signal: this.abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error("Core send HTTP " + r.status);
      })
      .catch((e) => {
        if (!this.closed) this.localClose(e);
      });
  }
  close() {
    if (!this.closeDone)
      this.closeDone = fetch("/core/close?id=" + encodeURIComponent(this.id), {
        method: "POST",
      }).then((r) => {
        if (!r.ok) throw Error("Core close HTTP " + r.status);
      });
    this.localClose();
    this.abort.abort();
  }
}
