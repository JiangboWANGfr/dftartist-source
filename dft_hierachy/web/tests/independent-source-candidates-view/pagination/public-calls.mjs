// C32-approved observation layer: original public call/receiver/args/return/throw only.
// Never observes, replaces, assimilates or catches the returned Promise.
export function observePublicCalls(object, names) {
  const records = [],
    restores = [];
  let disposed = false;
  const restoreAll = () => {
    const errors = [];
    for (const restore of restores.reverse())
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    return errors;
  };
  try {
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(object, name),
        original = object[name];
      if (typeof original !== "function")
        throw TypeError("missing public method " + name);
      const wrapped = function (...args) {
        const record = { name, receiver: this, args, status: "calling" };
        records.push(record);
        try {
          const value = Reflect.apply(original, this, args);
          record.status = "returned";
          record.value = value;
          return value;
        } catch (error) {
          record.status = "thrown";
          record.error = error;
          throw error;
        }
      };
      Object.defineProperty(object, name, {
        configurable: true,
        writable: true,
        enumerable: descriptor?.enumerable ?? false,
        value: wrapped,
      });
      restores.push(() => {
        if (descriptor) Object.defineProperty(object, name, descriptor);
        else if (!Reflect.deleteProperty(object, name))
          throw new Error(
            "B public observer could not restore inherited method " + name,
          );
      });
    }
  } catch (error) {
    const errors = restoreAll();
    if (errors.length)
      throw new AggregateError(
        [error, ...errors],
        "B public observer setup and restoration failed",
      );
    throw error;
  }
  return {
    records,
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = restoreAll();
      if (errors.length)
        throw new AggregateError(
          errors,
          "B public observer restoration failed",
        );
    },
  };
}
