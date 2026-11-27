// Concatenated after unchanged B C76 + UI fixtures. Never a replacement view.
import {
  installCommandFault as l02Install,
  rawInput as l02Raw,
} from "@B/l02-fault";
import { createMountWitness } from "@B/l02-mount-witness";
const l02Witness = createMountWitness(React);
const l02OriginalElement = uiElement;
uiElement = function (c, options) {
  return <l02Witness.Frame>{l02OriginalElement(c, options)}</l02Witness.Frame>;
};
const l02Sessions = [];
let l02Current;
function l02ModelState(c) {
  return {
    root: c.tree.rootState.status,
    rows: rows(c),
    selection: c.selection.current,
    back: c.selection.canGoBack,
    forward: c.selection.canGoForward,
    queries: c.wire.sent
      .filter((x) => x.method !== "cancel")
      .map((x) => x.method),
  };
}
function l02Summary(s) {
  return {
    command: s.command,
    kind: s.kind,
    mode: s.mode,
    sourceRowId: s.source.id,
    sourceLabel: s.sourceLabel,
    before: s.before,
    after: l02ModelState(s.c),
    callbacks: s.callbacks,
    probes: s.probes.count,
    callCount: s.fault.calls.length,
    calls: s.fault.calls.map((c) => ({
      inCall: c.inCall,
      checkpoint: c.checkpoint,
      injected: c.injected,
      delegateSucceeded: c.delegateSucceeded,
      newPromise: c.boundaryPromise
        ? c.boundaryPromise !== c.originalPromise
        : null,
    })),
    boundary: boundaries.map((error) => {
      // Identity first: never instanceof/probe raw Proxy even on a broken view path.
      if (Object.is(error, s.raw))
        return { rawEscaped: true, aggregate: false };
      const aggregate = error instanceof AggregateError;
      return {
        aggregate,
        count: aggregate ? error.errors.length : null,
        ownEntries:
          aggregate &&
          Object.hasOwn(error.errors, 0) &&
          Object.hasOwn(error.errors, 1),
        first: aggregate && Object.is(error.errors[0], s.raw),
        second: aggregate && Object.is(error.errors[1], undefined),
      };
    }),
    oldViewMounted: uiViews.get(1)?.c === s.c,
    viewWitness: l02Witness.read(uiViews.get(1), s.c),
    transitionWitness: s.transitionWitness ?? null,
    replacementCallbacks: s.replacement?.callbacks.length ?? 0,
    unhandled: unhandled.length,
    unexpectedWindowErrors: windowErrors.filter(
      (error) => !boundaries.includes(error),
    ).length,
  };
}
function l02Transition(s, kind) {
  const beforeView = uiViews.get(1);
  const before = l02Witness.read(beforeView, s.c);
  if (kind !== "replace") uiUnmount(1);
  if (kind === "replace") active = s.replacement;
  if (kind !== "unmount") uiMount({}, 1);
  const afterView = uiViews.get(1);
  const after = l02Witness.read(afterView, s.c);
  s.transitionWitness = {
    before,
    after,
    sameRoot: Boolean(
      beforeView && afterView && beforeView.root === afterView.root,
    ),
    sameMount:
      before.mountToken !== null && before.mountToken === after.mountToken,
  };
  s.transitioned = true;
}
function l02Capture() {
  const s = l02Current;
  if (!s) return;
  s.inEvent = true;
  queueMicrotask(() => {
    s.inEvent = false;
  });
}
document.addEventListener("click", l02Capture, true);
window.L02 = {
  capable: typeof HierarchyTree === "function",
  async setup({ command, kind, mode, transition = null }) {
    const c = await makeUiContext({
      hold: command === "loadRoots" ? ["inst.roots"] : [],
    });
    active = c;
    if (command === "select") await c.tree.loadRoots();
    // Real navigation history with a forward branch. Selection by UI must commit, not roll back.
    for (const def of ["B-L02-history-A", "B-L02-history-B"])
      c.selection.select({
        snapshotId: c.tree.snapshotId,
        origin: "external",
        items: [{ def }],
      });
    c.selection.back();
    const source = c.tree.rows.find(
      (r) => r.kind === (command === "select" ? "instance" : "status"),
    );
    if (!source) throw new Error("B L02 real source row unavailable");
    const { raw, probes } = l02Raw(kind);
    const s = {
      c,
      command,
      kind,
      mode,
      transition,
      source,
      raw,
      probes,
      callbacks: [],
      inEvent: false,
      sourceLabel: command === "select" ? source.instance.name : "加载层次",
      before: l02ModelState(c),
    };
    if (transition === "replace") s.replacement = await makeUiContext();
    if (transition && command === "select")
      s.transitionOff = c.selection.subscribe(() => {
        // Host action queued by a real notification, never inside L6's notification stack.
        if (!s.transitioned) queueMicrotask(() => l02Transition(s, transition));
      });
    s.fault = l02Install(
      command === "select" ? c.selection : c.tree,
      command,
      raw,
    );
    c.callbackMode = "none";
    if (mode !== "absent")
      c.props.onCommandError = (failure) => {
        const call = s.fault.calls.at(-1);
        s.callbacks.push({
          command: failure.command,
          rowId: failure.rowId,
          sameRaw: Object.is(failure.error, raw),
          inEvent: s.inEvent,
          inCall: call?.inCall,
          checkpoint: call?.checkpoint,
          notificationDepth: c.notificationDepth,
          delegateSucceeded: call?.delegateSucceeded,
        });
        if (mode === "throw") throw undefined;
      };
    l02Sessions.push(s);
    l02Current = s;
    return l02Summary(s);
  },
  mount() {
    uiMount();
  },
  release() {
    l02Current.c.wire.settle("inst.roots");
  },
  transition() {
    l02Transition(l02Current, l02Current.transition);
  },
  state() {
    return l02Summary(l02Current);
  },
  async probe() {
    const s = l02Current;
    let rejected = false,
      error;
    try {
      if (s.command === "select")
        s.c.selection.select({
          snapshotId: s.c.tree.snapshotId,
          origin: "tree",
          items: [{ ref: s.source.instance.ref }],
        });
      else {
        const p = s.c.tree.loadRoots();
        const observed = p.then(
          () => ({ failed: false }),
          (value) => ({ failed: true, value }),
        );
        s.c.wire.settle("inst.roots");
        const result = await observed;
        rejected = result.failed;
        error = result.value;
      }
    } catch (value) {
      rejected = true;
      error = value;
    }
    await settle();
    return { rejected, sameRaw: Object.is(error, s.raw), state: l02Summary(s) };
  },
  async verifyHistory() {
    const s = l02Current,
      c = s.c;
    // Verification is after the view observations; restore before direct history commands.
    s.fault.restore();
    const committed = c.selection.current;
    c.selection.back();
    const back = c.selection.current;
    c.selection.forward();
    const forward = c.selection.current;
    return { committed, back, forward, canGoForward: c.selection.canGoForward };
  },
  async shutdown() {
    document.removeEventListener("click", l02Capture, true);
    const settled = [];
    for (const s of l02Sessions) {
      s.transitionOff?.();
      s.fault.restore();
      settled.push(s.fault.settle());
    }
    const released = await window.UI.shutdown();
    await Promise.all(settled);
    const restored = l02Sessions.every((s) => {
      const target = s.command === "select" ? s.c.selection : s.c.tree;
      const current = Object.getOwnPropertyDescriptor(target, s.command),
        saved = s.fault.descriptor;
      if (!saved) return current === undefined;
      return (
        current?.value === saved.value &&
        current.configurable === saved.configurable &&
        current.writable === saved.writable &&
        current.enumerable === saved.enumerable
      );
    });
    return {
      ...released,
      descriptorsRestored: restored,
      rawProbes: l02Sessions.reduce((n, s) => n + s.probes.count, 0),
    };
  },
};
