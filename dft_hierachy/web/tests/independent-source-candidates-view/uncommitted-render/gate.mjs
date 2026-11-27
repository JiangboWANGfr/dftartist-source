// Host-owned Suspense control, NEVER a model-command Promise observation.
export function gate() {
  let open = false,
    release,
    reads = 0;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return {
    promise,
    get open() {
      return open;
    },
    get reads() {
      return reads;
    },
    read() {
      reads++;
      if (!open) throw promise;
    },
    release() {
      if (open) return;
      open = true;
      release();
    },
  };
}
