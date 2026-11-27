// B-owned constructor/dispose fault controls over real public base classes.
// All successful operations delegate to the original base/wire implementation.
export function instrument(base, config) {
  const attempts = { client: 0, navigation: 0, selection: 0 },
    objects = [],
    wires = [];
  const key = (kind, index) => kind + index;
  function wireTrace(wire) {
    const trace = { wire, message: new Set(), close: new Set(), closeCalls: 0 };
    wires.push(trace);
    for (const [name, set] of [
      ["onMessage", trace.message],
      ["onClose", trace.close],
    ]) {
      const original = wire[name];
      wire[name] = function (...args) {
        const token = {};
        const off = Reflect.apply(original, this, args);
        set.add(token);
        return function (...offArgs) {
          const value = Reflect.apply(off, this, offArgs);
          set.delete(token);
          return value;
        };
      };
    }
    const original = wire.close;
    wire.close = function (...args) {
      trace.closeCalls++;
      return Reflect.apply(original, this, args);
    };
    return trace;
  }
  function start(kind) {
    const index = ++attempts[kind];
    if (config.stage === kind && config.at === index) throw config.setup;
    return index;
  }
  function acquired(kind, index, value) {
    const row = { kind, index, value, releases: 0 };
    objects.push(row);
    return row;
  }
  function afterDispose(row) {
    row.releases++;
    const name = key(row.kind, row.index);
    if (Object.hasOwn(config.cleanup ?? {}, name)) throw config.cleanup[name];
  }
  class Client extends base.HierClient {
    constructor(wire, options) {
      const trace = wireTrace(wire),
        index = start("client");
      super(wire, options);
      this.__B49 = acquired("client", index, this);
      if (config.stage === "ready" && config.at === index) trace.wire.close();
    }
    dispose() {
      super.dispose();
      afterDispose(this.__B49);
    }
  }
  class Navigation extends base.SourceNavigationModel {
    constructor(...args) {
      const index = start("navigation");
      super(...args);
      this.__B49 = acquired("navigation", index, this);
    }
    dispose() {
      super.dispose();
      afterDispose(this.__B49);
    }
  }
  class Selection extends base.SelectionModel {
    constructor(...args) {
      const index = start("selection");
      super(...args);
      this.__B49 = acquired("selection", index, this);
    }
    dispose() {
      super.dispose();
      afterDispose(this.__B49);
    }
  }
  function ledger() {
    return {
      attempts: { ...attempts },
      objects: objects.map((r) => ({
        kind: r.kind,
        index: r.index,
        releases: r.releases,
        ...(r.kind !== "client" ? { disposed: r.value.disposed } : {}),
      })),
      wires: wires.map((w) => ({
        messages: w.message.size,
        closes: w.close.size,
        closeCalls: w.closeCalls,
      })),
    };
  }
  function violations() {
    const out = [];
    for (const r of objects) {
      if (r.releases !== 1)
        out.push(key(r.kind, r.index) + " release calls=" + r.releases);
      if (r.kind !== "client" && !r.value.disposed)
        out.push(key(r.kind, r.index) + " not disposed");
    }
    for (const [i, w] of wires.entries()) {
      if (w.message.size || w.close.size)
        out.push("wire" + i + " subscriptions retained");
      if (w.closeCalls === 0) out.push("wire" + i + " not closed");
    }
    return out;
  }
  async function safetyCleanup() {
    const errors = [];
    // On an expected red baseline, do not leave leaked instances behind.
    // Direct real base disposal is AFTER the evidence ledger/assertions, not repair evidence.
    for (const kind of ["navigation", "selection", "client"])
      for (const r of objects.filter(
        (r) => r.kind === kind && r.releases === 0,
      ))
        try {
          const C =
            kind === "navigation"
              ? base.SourceNavigationModel
              : kind === "selection"
                ? base.SelectionModel
                : base.HierClient;
          C.prototype.dispose.call(r.value);
        } catch (e) {
          errors.push({ kind, error: e });
        }
    for (const w of wires)
      try {
        w.wire.close();
      } catch (e) {
        errors.push({ kind: "wire", error: e });
      }
    return errors;
  }
  return {
    classes: {
      HierClient: Client,
      SourceNavigationModel: Navigation,
      SelectionModel: Selection,
    },
    attempts,
    objects,
    wires,
    ledger,
    violations,
    safetyCleanup,
  };
}
