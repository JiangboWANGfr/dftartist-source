// B host observation only. No view, subscription, command, or feedback algorithm.
export function createMountWitness(React) {
  const roots = new WeakMap();
  let rootSequence = 0,
    mountSequence = 0;
  const state = { mounts: 0, cleanups: 0, liveToken: null };
  function Frame({ children }) {
    const [token] = React.useState(() => ++mountSequence);
    React.useLayoutEffect(() => {
      state.mounts++;
      state.liveToken = token;
      return () => {
        state.cleanups++;
        if (state.liveToken === token) state.liveToken = null;
      };
    }, [token]);
    return children;
  }
  return {
    Frame,
    read(view, oldContext) {
      if (view && !roots.has(view.root)) roots.set(view.root, ++rootSequence);
      return {
        rootId: view ? roots.get(view.root) : null,
        mountToken: state.liveToken,
        mounts: state.mounts,
        cleanups: state.cleanups,
        oldModel: view ? view.c === oldContext : null,
      };
    },
  };
}
