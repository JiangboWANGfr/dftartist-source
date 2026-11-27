// B test instrumentation only. No SourceView, product handlers, clocks or polling.
const installed = new WeakSet();
export function installEventStackProbe(host = window) {
  const realm =
    host.window === host
      ? host
      : (host.defaultView ?? host.ownerDocument?.defaultView);
  if (!realm?.EventTarget) throw TypeError("a browser realm is required");
  if (installed.has(realm)) throw Error("one event stack probe per realm");
  const proto = realm.EventTarget.prototype;
  const addDescriptor = Object.getOwnPropertyDescriptor(
    proto,
    "addEventListener",
  );
  const removeDescriptor = Object.getOwnPropertyDescriptor(
    proto,
    "removeEventListener",
  );
  const add = addDescriptor.value,
    remove = removeDescriptor.value;
  const types = new Set(["dblclick", "keydown"]);
  const targets = new WeakMap(),
    records = new Set(),
    stack = [],
    properties = [];
  let disposed = false;
  function table(target, type, listener, create = false) {
    let byType = targets.get(target);
    if (!byType && create) targets.set(target, (byType = new Map()));
    let byListener = byType?.get(type);
    if (!byListener && create) byType.set(type, (byListener = new WeakMap()));
    let byCapture = byListener?.get(listener);
    if (!byCapture && create) byListener.set(listener, (byCapture = new Map()));
    return byCapture;
  }
  function capture(options) {
    return options !== null &&
      (typeof options === "object" || typeof options === "function")
      ? Boolean(options.capture)
      : Boolean(options);
  }
  function optionsOf(options) {
    if (options === null || !["object", "function"].includes(typeof options))
      return { capture: Boolean(options), once: false };
    // Read caller dictionary members once, in inherited/member order. Native
    // add receives data properties, preserving once/passive/signal semantics.
    const c = Boolean(options.capture),
      once = Boolean(options.once);
    const passive = options.passive,
      signal = options.signal;
    return {
      capture: c,
      once,
      ...(passive === undefined ? {} : { passive: Boolean(passive) }),
      ...(signal === undefined ? {} : { signal }),
    };
  }
  function enter(event, callback) {
    stack.push(event);
    try {
      return callback();
    } finally {
      stack.pop();
    }
  }
  function forget(record) {
    if (!record.active) return;
    record.active = false;
    table(record.target, record.type, record.listener)?.delete(
      record.options.capture,
    );
    records.delete(record);
    if (record.abort)
      Reflect.apply(remove, record.options.signal, ["abort", record.abort]);
  }
  function addObserved(type, listener, options) {
    if (
      !types.has(type) ||
      listener === null ||
      !["object", "function"].includes(typeof listener)
    )
      return Reflect.apply(add, this, [type, listener, options]);
    const opts = optionsOf(options);
    const byCapture = table(this, type, listener, true);
    const existing = byCapture.get(opts.capture);
    if (existing?.active)
      return Reflect.apply(add, this, [type, existing.wrapped, opts]);
    const record = {
      target: this,
      type,
      listener,
      options: opts,
      active: false,
    };
    record.wrapped = function (event) {
      if (opts.once) forget(record);
      return enter(event, () =>
        typeof listener === "function"
          ? Reflect.apply(listener, this, [event])
          : Reflect.apply(listener.handleEvent, listener, [event]),
      );
    };
    const returned = Reflect.apply(add, this, [type, record.wrapped, opts]);
    if (opts.signal?.aborted) return returned;
    record.active = true;
    records.add(record);
    byCapture.set(opts.capture, record);
    if (opts.signal) {
      record.abort = () => forget(record);
      Reflect.apply(add, opts.signal, ["abort", record.abort, { once: true }]);
    }
    return returned;
  }
  function removeObserved(type, listener, options) {
    if (
      !types.has(type) ||
      listener === null ||
      !["object", "function"].includes(typeof listener)
    )
      return Reflect.apply(remove, this, [type, listener, options]);
    const c = capture(options);
    const record = table(this, type, listener)?.get(c);
    if (!record) return Reflect.apply(remove, this, [type, listener, c]);
    const returned = Reflect.apply(remove, this, [type, record.wrapped, c]);
    forget(record);
    return returned;
  }
  const owners = new Map();
  for (const start of [
    realm,
    realm.Document?.prototype,
    realm.HTMLElement?.prototype,
    realm.SVGElement?.prototype,
    realm.MathMLElement?.prototype,
  ]) {
    for (const type of types) {
      const key = "on" + type;
      let owner = start;
      while (owner && !Object.hasOwn(owner, key))
        owner = Object.getPrototypeOf(owner);
      if (!owner) continue;
      let keys = owners.get(owner);
      if (!keys) owners.set(owner, (keys = new Set()));
      keys.add(key);
    }
  }
  try {
    Object.defineProperty(proto, "addEventListener", {
      ...addDescriptor,
      value: addObserved,
    });
    Object.defineProperty(proto, "removeEventListener", {
      ...removeDescriptor,
      value: removeObserved,
    });
    for (const [owner, keys] of owners)
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (!descriptor.configurable || !descriptor.get || !descriptor.set)
          continue;
        const values = new Map();
        const patched = {
          ...descriptor,
          get() {
            const actual = Reflect.apply(descriptor.get, this, []);
            const record = values.get(this);
            return record && actual === record.wrapped
              ? record.listener
              : actual;
          },
          set(listener) {
            if (typeof listener !== "function") {
              const returned = Reflect.apply(descriptor.set, this, [listener]);
              values.delete(this);
              return returned;
            }
            const wrapped = function (event) {
              return enter(event, () => Reflect.apply(listener, this, [event]));
            };
            const returned = Reflect.apply(descriptor.set, this, [wrapped]);
            values.set(this, { listener, wrapped });
            return returned;
          },
        };
        Object.defineProperty(owner, key, patched);
        properties.push({ owner, key, descriptor, values });
      }
    installed.add(realm);
  } catch (error) {
    for (const p of properties.reverse())
      Object.defineProperty(p.owner, p.key, p.descriptor);
    Object.defineProperty(proto, "addEventListener", addDescriptor);
    Object.defineProperty(proto, "removeEventListener", removeDescriptor);
    throw error;
  }
  return {
    get active() {
      return stack.length > 0;
    },
    get event() {
      return stack.at(-1) ?? null;
    },
    get depth() {
      return stack.length;
    },
    get listeners() {
      return records.size;
    },
    dispose() {
      if (disposed) return;
      if (stack.length) throw Error("dispose outside observed callbacks");
      // Migrate live registrations back to originals so remove(original) remains
      // valid after restoring the prototype, including capture/once/signal.
      for (const r of [...records]) {
        Reflect.apply(remove, r.target, [r.type, r.wrapped, r.options.capture]);
        forget(r);
        Reflect.apply(add, r.target, [r.type, r.listener, r.options]);
      }
      for (const p of properties.reverse()) {
        for (const [target, value] of p.values) {
          if (Reflect.apply(p.descriptor.get, target, []) === value.wrapped)
            Reflect.apply(p.descriptor.set, target, [value.listener]);
        }
        p.values.clear();
        Object.defineProperty(p.owner, p.key, p.descriptor);
      }
      Object.defineProperty(proto, "addEventListener", addDescriptor);
      Object.defineProperty(proto, "removeEventListener", removeDescriptor);
      installed.delete(realm);
      disposed = true;
    },
  };
}

// A synchronous boolean predicate; no fixed sleeps or polling. The caller owns
// cancellation (e.g. page/test watchdog) and must cancel a wait it abandons.
export function observeDom(root, predicate) {
  const realm = (root.nodeType === 9 ? root : root.ownerDocument).defaultView;
  let done = false,
    observer,
    resolve,
    reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  function finish(failed, error) {
    if (done) return;
    done = true;
    observer?.disconnect();
    if (failed) reject(error);
    else resolve(true);
  }
  function check() {
    if (done) return;
    try {
      const value = predicate();
      if (typeof value !== "boolean")
        throw TypeError("DOM predicate must be boolean");
      if (value) finish(false);
    } catch (error) {
      finish(true, error);
    }
  }
  observer = new realm.MutationObserver(check);
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  check();
  return {
    promise,
    cancel(
      reason = new realm.DOMException(
        "DOM observation cancelled",
        "AbortError",
      ),
    ) {
      finish(true, reason);
    },
  };
}
