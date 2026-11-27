// Synchronous, receiver/args/return/throw-transparent public-call exploration.
// onReturn is a facility checkpoint; never accesses Promise methods.
export function observeReturn(target, name, onReturn) {
  const own = Object.getOwnPropertyDescriptor(target, name),
    original = target[name],
    records = [];
  if (typeof original !== "function") throw TypeError("public command missing");
  function wrapper(...args) {
    const record = { receiver: this, args };
    records.push(record);
    let value;
    try {
      value = Reflect.apply(original, this, args);
    } catch (error) {
      record.error = error;
      record.threw = true;
      throw error;
    }
    record.value = value;
    onReturn(record);
    return value;
  }
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value: wrapper,
  });
  return {
    records,
    restore() {
      if (own) Object.defineProperty(target, name, own);
      else if (!Reflect.deleteProperty(target, name))
        throw Error("restore inherited public command");
    },
  };
}
