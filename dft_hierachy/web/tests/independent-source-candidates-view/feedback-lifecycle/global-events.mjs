// Native global event observation only. Never attaches Promise handlers or
// uses absence of events as evidence for original-Promise consumption (Q1).
export function observeGlobal(host = window) {
  const errors = [],
    rejections = [],
    waiters = [];
  let disposed = false;
  function emit(kind, event) {
    if (disposed) return;
    const record = {
      kind,
      value: kind === "error" ? event.error : event.reason,
      ...(kind === "rejection" ? { promise: event.promise } : {}),
    };
    (kind === "error" ? errors : rejections).push(record);
    for (const w of [...waiters])
      if (w.kind === kind && w.predicate(record)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(record);
      }
  }
  const onError = (e) => emit("error", e),
    onRejection = (e) => emit("rejection", e);
  host.addEventListener("error", onError);
  host.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    rejections,
    next(kind, predicate) {
      const r = (kind === "error" ? errors : rejections).find(predicate);
      if (r) return Promise.resolve(r);
      return new Promise((resolve) =>
        waiters.push({ kind, predicate, resolve }),
      );
    },
    consumeControl(record) {
      const a = record.kind === "error" ? errors : rejections,
        i = a.indexOf(record);
      if (i < 0) throw Error("missing exact fixture control event");
      a.splice(i, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("error", onError);
      host.removeEventListener("unhandledrejection", onRejection);
      for (const w of waiters.splice(0)) w.resolve(null);
    },
  };
}
