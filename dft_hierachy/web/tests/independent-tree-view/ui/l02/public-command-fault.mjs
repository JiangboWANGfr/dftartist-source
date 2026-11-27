// B-UI-ADAPTER-01, approved REVIEW_LOG 2026-10-15. Test code only.
// Do not use this new-Promise boundary as evidence about L6's original Promise.
export const rawKinds = [
  "undefined",
  "null",
  "zero",
  "false",
  "empty",
  "frozen",
  "proxy",
];
export function rawInput(kind) {
  const probes = { count: 0 };
  const trap = () => {
    probes.count++;
    throw new Error("B L02 raw must not be probed");
  };
  let raw;
  switch (kind) {
    case "undefined":
      raw = undefined;
      break;
    case "null":
      raw = null;
      break;
    case "zero":
      raw = 0;
      break;
    case "false":
      raw = false;
      break;
    case "empty":
      raw = "";
      break;
    case "frozen":
      raw = Object.freeze({ B: "L02 direct raw" });
      break;
    case "proxy":
      raw = new Proxy(Object.create(null), {
        get: trap,
        ownKeys: trap,
        getPrototypeOf: trap,
        getOwnPropertyDescriptor: trap,
        has: trap,
        set: trap,
        defineProperty: trap,
        deleteProperty: trap,
        setPrototypeOf: trap,
        isExtensible: trap,
        preventExtensions: trap,
      });
      break;
    default:
      throw new TypeError("unknown B L02 raw input");
  }
  return { raw, probes };
}

export function installCommandFault(model, command, raw) {
  if (command !== "select" && command !== "loadRoots")
    throw new TypeError("B L02 only interposes select/loadRoots");
  const descriptor = Object.getOwnPropertyDescriptor(model, command);
  const delegate = model[command];
  if (typeof delegate !== "function")
    throw new TypeError("missing real public command");
  const calls = [];
  let restored = false;
  function interpose(...args) {
    const call = {
      inCall: true,
      checkpoint: false,
      injected: false,
      delegateSucceeded: false,
    };
    calls.push(call);
    try {
      let result;
      try {
        result = Reflect.apply(delegate, this, args);
      } catch (error) {
        call.delegateFailed = true;
        call.originalError = error;
        throw error;
      }
      if (command === "select") {
        call.delegateSucceeded = true;
        call.injected = true;
        throw raw;
      }
      call.originalPromise = result;
      call.boundaryPromise = result.then(
        () => {
          call.delegateSucceeded = true;
          call.injected = true;
          throw raw;
        },
        (error) => {
          call.delegateFailed = true;
          call.originalError = error;
          throw error;
        },
      );
      return call.boundaryPromise;
    } finally {
      call.inCall = false;
      queueMicrotask(() => {
        call.checkpoint = true;
      });
    }
  }
  Object.defineProperty(model, command, {
    value: interpose,
    configurable: true,
    writable: true,
    enumerable: descriptor?.enumerable ?? false,
  });
  return {
    calls,
    descriptor,
    delegate,
    // Call only after observations, or during cleanup before releasing held work.
    settle: () =>
      Promise.allSettled(
        calls.flatMap((c) => (c.boundaryPromise ? [c.boundaryPromise] : [])),
      ),
    restore() {
      if (restored) return;
      if (descriptor) Object.defineProperty(model, command, descriptor);
      else if (!Reflect.deleteProperty(model, command))
        throw new Error("B L02 descriptor restore failed");
      restored = true;
    },
  };
}
