// Appended to the unchanged C76 B fixture at bundle time, never product source.
function uiDataset(kind = "mixed", count = 5001) {
  if (kind === "empty")
    return { roots: [], children: new Map(), all: [], kind };
  if (kind === "paged") {
    const root = inst("B-paged-root", "paged", ["paged"], count);
    const children = Array.from({ length: count }, (_, i) =>
      inst("B-paged-" + i, "child[" + i + "]", ["paged", "child[" + i + "]"]),
    );
    return {
      roots: [root],
      all: [root, ...children],
      children: new Map([[root.ref, children]]),
      kind,
    };
  }
  if (kind === "wide") {
    const roots = Array.from({ length: count }, (_, i) =>
      inst("B-wide-" + i, "root[" + String(i).padStart(4, "0") + "]", [
        "root[" + String(i).padStart(4, "0") + "]",
      ]),
    );
    return { roots, children: new Map(), all: roots, kind };
  }
  if (kind === "deep") {
    const all = [];
    for (let i = 0; i <= 121; i++)
      all.push(
        inst(
          "B-depth-" + i,
          "level" + i,
          Array.from({ length: i + 1 }, (_, n) => "level" + n),
          i < 121 ? 1 : 0,
        ),
      );
    return {
      roots: [all[0]],
      all,
      kind,
      children: new Map(all.slice(0, -1).map((x, i) => [x.ref, [all[i + 1]]])),
    };
  }
  const r = inst("B-mixed-root", "root.with.dot", ["root.with.dot"], 5);
  const other = inst("B-mixed-other", "other", ["other"], 1);
  const kids = [
    inst("B-child-a", "same", [...r.path, "g.with.dot", "same"], 1),
    inst("B-child-b", "same", [...r.path, "other", "g.with.dot", "same"]),
    inst("B-child-c", "<img src=x onerror=window.B_xss=1>", [
      ...r.path,
      "<img src=x onerror=window.B_xss=1>",
    ]),
    inst("B-child-d", "lanes[1]\\尾", [...r.path, "lanes[1]\\尾"]),
    inst("B-child-e", "same", [...r.path, "g.with.dot", "same[2]"]),
  ];
  // The last path segment must equal name even for deliberately ambiguous labels.
  kids[4].name = "same[2]";
  const grand = inst("B-grand", "leaf.点", [
    ...kids[0].path,
    "inner[0]",
    "leaf.点",
  ]);
  const cousin = inst("B-cousin", "same", [
    ...other.path,
    "g.with.dot",
    "same",
  ]);
  return {
    roots: [r, other],
    all: [r, other, ...kids, grand, cousin],
    kind,
    children: new Map([
      [r.ref, kids],
      [other.ref, [cousin]],
      [kids[0].ref, [grand]],
    ]),
  };
}
class UiWire extends Wire {
  constructor(data, pageSize = 2) {
    super();
    this.data = data;
    this.roots = data.roots;
    this.pageSize = pageSize;
    this.nextReply = null;
    this.rejectNext = false;
  }
  reply(frame, fail = false) {
    if (fail) return super.reply(frame, true);
    const i = this.pending.indexOf(frame);
    if (i < 0 || this.closed) return;
    this.pending.splice(i, 1);
    let result;
    if (frame.method === "inst.roots") result = this.roots;
    else if (frame.method === "inst.children") {
      const list = this.data.children.get(frame.params.inst) ?? [];
      const offset =
        frame.params.cursor === ""
          ? 0
          : Number(frame.params.cursor.slice("B-page/opaque.".length));
      if (!Number.isSafeInteger(offset)) throw new Error("invalid test cursor");
      const end = Math.min(offset + frame.params.limit, list.length);
      result = {
        items: list.slice(offset, end),
        ...(end < list.length ? { next: "B-page/opaque." + end } : {}),
      };
    } else if (frame.method === "obj.get") {
      const ref = frame.params.ref,
        port = ref === "B-port-target",
        signal = ref === "B-signal-target";
      const owner =
        port || signal
          ? this.data.kind === "wide"
            ? this.data.all.at(-1)
            : this.data.all.find((x) => x.ref === "B-child-e")
          : this.data.all.find((x) => x.ref === ref);
      if (!owner) {
        this.pending.push(frame);
        return super.reply(frame, true);
      }
      result = {
        ref,
        inst: owner.ref,
        kind: port ? "port" : signal ? "signal" : "instance",
        name: owner.name,
        pathText: owner.pathText,
      };
    } else if (frame.method === "inst.ancestors") {
      const owner = this.data.all.find((x) => x.ref === frame.params.inst);
      result = this.data.all
        .filter(
          (x) =>
            owner &&
            x.path.length < owner.path.length &&
            x.path.every((s, n) => owner.path[n] === s),
        )
        .sort((x, y) => x.path.length - y.path.length);
    } else throw new Error("unexpected UI fixture query " + frame.method);
    const frameOut = { id: frame.id, ok: true, result, completeness: complete };
    if (this.nextReply === "partial")
      frameOut.completeness = {
        status: "partial",
        reasons: [{ code: "indexing" }],
      };
    if (this.nextReply === "duplicate" && frame.method === "inst.children")
      frameOut.result = {
        items: [this.data.children.get(frame.params.inst)[0]],
      };
    this.nextReply = null;
    this.emit(frameOut);
  }
}
const uiViews = new Map();
function trackSubscriptions(c, model, key) {
  const original = model.subscribe;
  const stats = (c.subscriptions[key] = {
    adds: 0,
    removes: 0,
    active: 0,
    deliveries: 0,
  });
  model.subscribe = function (listener) {
    stats.adds++;
    stats.active++;
    const off = Reflect.apply(original, this, [
      function (...args) {
        stats.deliveries++;
        c.notificationDepth++;
        try {
          return Reflect.apply(listener, this, args);
        } finally {
          c.notificationDepth--;
        }
      },
    ]);
    let live = true;
    return () => {
      if (live) {
        live = false;
        stats.removes++;
        stats.active--;
      }
      return off();
    };
  };
}
class UiCoreWire extends Wire {
  constructor(id) {
    super();
    this.id = id;
    this.abort = new AbortController();
    this.buffer = [];
    this.pollDone = this.poll();
  }
  onMessage(f) {
    const off = super.onMessage(f);
    queueMicrotask(() => {
      if (this.messages.size)
        for (const x of this.buffer.splice(0)) this.emit(x);
    });
    return off;
  }
  async poll() {
    try {
      while (!this.closed) {
        const response = await fetch(
          "/core/poll?id=" + encodeURIComponent(this.id),
          { signal: this.abort.signal },
        );
        if (!response.ok) throw new Error("B bridge HTTP " + response.status);
        const data = await response.json();
        for (const frame of data.frames) {
          if (this.messages.size) this.emit(frame);
          else this.buffer.push(frame);
        }
        if (data.closed) {
          this.localClose();
          break;
        }
      }
    } catch (error) {
      if (!this.closed) {
        this.localClose(error);
      }
    }
  }
  send(frame) {
    if (this.closed) throw new Error("B Core bridge closed");
    this.sent.push(structuredClone(frame));
    fetch("/core/send?id=" + encodeURIComponent(this.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frame),
      signal: this.abort.signal,
    })
      .then(
        (r) => {
          if (!r.ok) throw new Error("B bridge send");
        },
        (e) => {
          if (!this.closed) this.localClose(e);
        },
      )
      .catch((e) => {
        if (!this.closed) this.localClose(e);
      });
  }
  localClose(error = new Error("B Core bridge EOF")) {
    if (this.closed) return;
    this.closed = true;
    for (const f of [...this.closes]) f(error);
  }
  close() {
    if (!this.closeDone)
      this.closeDone = fetch("/core/close?id=" + encodeURIComponent(this.id), {
        method: "POST",
      }).then((r) => {
        if (!r.ok) throw new Error("B Core bridge close");
      });
    this.localClose();
    this.abort.abort();
  }
}
async function makeUiContext(options = {}) {
  const data = options.core
    ? { kind: "core", all: [], children: new Map() }
    : uiDataset(options.dataset ?? "mixed", options.count);
  const wire = options.core
    ? new UiCoreWire(options.core)
    : new UiWire(data, options.pageSize ?? 2);
  for (const method of options.hold ?? []) wire.hold.add(method);
  const client = new HierClient(wire, { cacheEntries: 0 });
  if (!options.core)
    wire.emit({
      event: "hello",
      protocol: 2,
      snapshot: snapshot(
        options.snapshotId ?? "B-general-" + contexts.length,
        data.roots,
      ),
      capabilities: ["cancel", "progress"],
    });
  let indexReady;
  const indexed = new Promise((resolve) => {
    indexReady = resolve;
  });
  const indexOff = client.onIndexReady(() => indexReady());
  const readySnapshot = await client.ready;
  if (readySnapshot.indexState === "ready") indexReady();
  const tree = new TreeModel(client, {
    pageSize: options.pageSize ?? 2,
    showGenerateScopes: options.scopes ?? true,
  });
  const selection = new SelectionModel({ snapshotId: tree.snapshotId });
  const c = {
    wire,
    client,
    tree,
    selection,
    data,
    calls: [],
    callbacks: [],
    marker: { B: "UI observer" },
    callbackMarker: { B: "UI callback" },
    callbackMode: "capture",
    fault: "",
    stale: "",
    strict: false,
    notifications: 0,
    subscriptions: {},
    notificationDepth: 0,
    reentrantCommands: 0,
    callbackAsync: 0,
    props: {},
    indexed,
    indexOff,
  };
  contexts.push(c);
  observe(c, tree, [
    "loadRoots",
    "setExpanded",
    "loadMore",
    "cancel",
    "reload",
    "reveal",
    "setShowGenerateScopes",
  ]);
  observe(c, selection, ["select", "back", "forward"]);
  for (const model of [tree, selection]) {
    const names =
      model === tree
        ? [
            "loadRoots",
            "setExpanded",
            "loadMore",
            "cancel",
            "reload",
            "reveal",
            "setShowGenerateScopes",
          ]
        : ["select", "back", "forward"];
    for (const name of names) {
      const delegate = model[name];
      model[name] = function (...args) {
        if (c.notificationDepth) c.reentrantCommands++;
        return Reflect.apply(delegate, this, args);
      };
    }
  }
  selection.subscribe(() => {
    if (c.fault === "select") {
      c.fault = "";
      throw c.marker;
    }
  });
  tree.subscribe(() => {
    c.notifications++;
    if (
      c.fault === "tree-any" ||
      (c.fault === "root-success" && tree.rootState.status === "success")
    ) {
      c.fault = "";
      throw c.marker;
    }
  });
  // Only subscriptions added after the fixture listeners are component/host consumers.
  trackSubscriptions(c, tree, "tree");
  trackSubscriptions(c, selection, "selection");
  return c;
}
function uiHandler(c) {
  return (failure) => {
    const origin = c.calls.findLast(
      (x) => x.failed && Object.is(x.raw, failure.error),
    );
    c.callbacks.push({
      failure,
      sameOriginal: Boolean(origin),
      checkpoint: origin?.checkpoint,
      returned: origin?.returned,
    });
    if (c.callbackMode === "throw") throw c.callbackMarker;
    if (c.callbackMode === "async-owned")
      return Promise.reject(c.callbackMarker).catch(() => {
        c.callbackAsync++;
      });
  };
}
function uiElement(c, options = {}) {
  const props = Object.freeze({
    tree: c.tree,
    selection: c.selection,
    ariaLabel: "B hierarchy",
    height: 560,
    ...(c.callbackMode === "none" ? {} : { onCommandError: uiHandler(c) }),
    ...c.props,
    ...options,
  });
  const node = (
    <Boundary>
      <HierarchyTree {...props} />
    </Boundary>
  );
  return c.strict ? <StrictMode>{node}</StrictMode> : node;
}
function uiMount(options = {}, number = 1) {
  if (typeof HierarchyTree !== "function")
    throw new Error("production HierarchyTree not exported");
  const old = uiViews.get(number);
  const host = document.getElementById("ui-view-" + number);
  const v = old ?? { root: createRoot(host), c: active, props: {} };
  v.c = active;
  Object.assign(v.props, options);
  uiViews.set(number, v);
  flushSync(() => v.root.render(uiElement(v.c, v.props)));
}
function uiUnmount(number = 1) {
  const v = uiViews.get(number);
  if (v) {
    flushSync(() => v.root.unmount());
    uiViews.delete(number);
  }
}
function uiRows(c) {
  const published = new Map(rows(c).map((r) => [r.id, r]));
  return c.tree.rows.map((r) => ({
    ...published.get(r.id),
    ...(r.kind === "instance"
      ? {
          name: r.instance.name,
          path: r.instance.path,
          expandable: r.expandable,
          childCount: r.instance.childCount,
          children: r.children,
        }
      : {}),
    ...(r.kind === "scope"
      ? { ownerRef: r.owner, scopePath: r.scopePath }
      : {}),
    ...(r.kind === "status" ? { statusState: r.state } : {}),
  }));
}
function uiState() {
  const c = active;
  return {
    ...state(),
    rows: uiRows(c),
    snapshotId: c.tree.snapshotId,
    treeFrozen: Object.isFrozen(c.tree),
    selectionFrozen: Object.isFrozen(c.selection),
    reveal: c.tree.revealState,
    back: c.selection.canGoBack,
    forward: c.selection.canGoForward,
    subscriptions: c.subscriptions,
    reentrantCommands: c.reentrantCommands,
    callbackAsync: c.callbackAsync,
    boundaryTypes: boundaries.map((x) => x instanceof TypeError),
    all: contexts.map((x) => ({
      snapshotId: x.tree.snapshotId,
      disposed: x.tree.disposed,
      selectionDisposed: x.selection.disposed,
      closed: x.wire.closed,
      subscriptions: x.subscriptions,
      calls: x.calls.map((y) => y.name),
      callbacks: x.callbacks.length,
      messageListeners: x.wire.messages.size,
      closeListeners: x.wire.closes.size,
    })),
    poisonReads: c.poisonReads ?? 0,
    wireCancels: c.wire.sent.filter((x) => x.method === "cancel").length,
  };
}
const uiOldShutdown = window.B.shutdown;
window.UI = {
  capable: typeof HierarchyTree === "function",
  async setup(options = {}) {
    active = await makeUiContext(options);
    return uiState();
  },
  async coreSetup() {
    const response = await fetch("/core/open", { method: "POST" });
    if (!response.ok) throw new Error("B core bridge unavailable");
    const { id } = await response.json();
    active = await makeUiContext({ core: id, pageSize: 1 });
    return uiState();
  },
  async coreTarget() {
    const c = active;
    let reply = await c.client.resolvePath("b_tree_top/g[2]/left/child");
    if (reply.completeness.status === "partial") {
      await c.indexed;
      reply = await c.client.resolvePath("b_tree_top/g[2]/left/child");
    }
    if (reply.completeness.status !== "complete" || reply.result.length !== 1)
      throw new Error("B fixture target mismatch");
    const owner = reply.result[0];
    const ports = await c.client.ports(owner);
    return { owner, port: ports.result.find((x) => x.name === "d").ref };
  },
  state: uiState,
  settle,
  mount: uiMount,
  unmount: uiUnmount,
  configure(options) {
    Object.assign(active, options);
  },
  props(options) {
    Object.assign(active.props, options);
  },
  runtimeProp(name, key) {
    const values = {
      zero: 0,
      negative: -1,
      nan: NaN,
      infinity: Infinity,
      minusInfinity: -Infinity,
      text: "28",
      nil: null,
      object: {},
      fraction: 0.5,
      empty: "",
      blank: " \t\n",
      undef: undefined,
      yes: true,
      bigint: 1n,
      array: [],
      number: 9,
    };
    active.props[name] = values[key];
  },
  invalidModel(kind) {
    if (kind === "tree") active.tree.dispose();
    if (kind === "selection") active.selection.dispose();
    if (kind === "unbound") {
      active.extras ??= [];
      const model = new SelectionModel();
      active.extras.push(model);
      active.props.selection = model;
      trackSubscriptions(active, model, "invalidSelection");
    }
    if (kind === "mismatch") {
      active.extras ??= [];
      const model = new SelectionModel({ snapshotId: "different-snapshot" });
      active.extras.push(model);
      active.props.selection = model;
      trackSubscriptions(active, model, "invalidSelection");
    }
  },
  async seed(full = false) {
    const c = active;
    await c.tree.loadRoots();
    if (c.data.kind === "deep") {
      for (let i = 0; i < 120; i++) {
        const row = c.tree.rows.find(
          (r) => r.kind === "instance" && r.instance.ref === "B-depth-" + i,
        );
        await c.tree.setExpanded(row.id, true);
      }
      // 121 committed instances through depth120, plus a real pending status.
      c.wire.hold.add("inst.children");
      const last = c.tree.rows.find(
        (r) => r.kind === "instance" && r.instance.ref === "B-depth-120",
      );
      c.hostPending = c.tree.setExpanded(last.id, true);
      c.hostPending.catch(() => {});
    } else if (full && c.data.kind === "mixed") {
      const r = c.tree.rows.find((r) => r.kind === "instance");
      await c.tree.setExpanded(r.id, true);
      while (c.tree.rows.find((x) => x.id === r.id).children.next)
        await c.tree.loadMore(r.id);
    }
    return uiState();
  },
  async command(name, ...args) {
    const model = ["select", "back", "forward"].includes(name)
      ? active.selection
      : active.tree;
    return Reflect.apply(model[name], model, args);
  },
  start(name, ...args) {
    const p = active.tree[name](...args);
    p.catch(() => {});
    active.hostPending = p;
  },
  async pending() {
    try {
      await active.hostPending;
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error.code };
    }
  },
  external(items, origin = "external") {
    active.selection.select({
      snapshotId: active.tree.snapshotId,
      origin,
      items,
    });
  },
  independentChildren(ref) {
    const c = active;
    c.independentPromise = c.client.children(ref, { limit: 2 });
    c.independentPromise.catch(() => {});
  },
  async independentResult() {
    return (await active.independentPromise).result;
  },
  hold(method) {
    active.wire.hold.add(method);
  },
  release(method, failure = false, context = null) {
    (context === null ? active : contexts[context]).wire.settle(
      method,
      failure,
    );
  },
  malformed(mode) {
    active.wire.nextReply = mode;
  },
  emptyReload() {
    active.wire.roots = [];
    return active.tree.reload(null);
  },
  async replace(options = {}) {
    active = await makeUiContext(options);
    uiMount({}, 1);
    return uiState();
  },
  useContext(index) {
    active = contexts[index];
  },
  coordinator() {
    const c = active;
    c.coordinatorOff = c.selection.subscribe((s) => {
      const ref = s.items.find((x) => x.ref)?.ref;
      if (ref)
        queueMicrotask(() => {
          c.tree.reveal(ref).catch(() => {});
        });
    });
  },
  async probeSubscriptions() {
    const c = active;
    let delivered = 0;
    const offTree = c.tree.subscribe(() => {
      delivered++;
    });
    const offSelection = c.selection.subscribe(() => {
      delivered++;
    });
    await c.tree.setShowGenerateScopes(!c.tree.showGenerateScopes);
    c.selection.select({
      snapshotId: c.tree.snapshotId,
      origin: "external",
      items: [{ def: "B-ui-def" }],
    });
    offTree();
    offSelection();
    return {
      delivered,
      activeTree: c.subscriptions.tree.active,
      activeSelection: c.subscriptions.selection.active,
      reentrant: c.reentrantCommands,
    };
  },
  faultPoison() {
    const c = active;
    c.poisonReads = 0;
    c.marker = new Proxy(Object.create(null), {
      get() {
        c.poisonReads++;
        throw new Error("B poison get");
      },
      ownKeys() {
        c.poisonReads++;
        throw new Error("B poison enumerate");
      },
      getPrototypeOf() {
        c.poisonReads++;
        throw new Error("B poison prototype");
      },
    });
    c.fault = "select";
  },
  dom(number = 1) {
    const host = document.getElementById("ui-view-" + number);
    const t = host.querySelector('[role="tree"]');
    if (!t) return { tree: null, html: host.innerHTML };
    const outer = t.getBoundingClientRect();
    const list = [...t.querySelectorAll('[role="treeitem"]')];
    const scroll =
      [t, ...t.querySelectorAll("*")].find(
        (x) =>
          x.scrollHeight > x.clientHeight + 2 &&
          ["auto", "scroll"].includes(getComputedStyle(x).overflowY),
      ) ?? t;
    const attr = (e, name) => e.getAttribute(name);
    const info = (e) => {
      const r = e.getBoundingClientRect();
      return {
        id: e.id,
        text: e.textContent,
        level: attr(e, "aria-level"),
        selected: attr(e, "aria-selected"),
        expanded: attr(e, "aria-expanded"),
        pos: attr(e, "aria-posinset"),
        size: attr(e, "aria-setsize"),
        tabindex: attr(e, "tabindex"),
        top: r.top,
        bottom: r.bottom,
        height: r.height,
      };
    };
    const activeId = attr(t, "aria-activedescendant");
    const activeNode = activeId ? document.getElementById(activeId) : null;
    return {
      tree: {
        label: attr(t, "aria-label"),
        multi: attr(t, "aria-multiselectable"),
        tabindex: t.tabIndex,
        focus: document.activeElement === t,
        activeId,
        activeOwn: Boolean(activeNode && t.contains(activeNode)),
        active: activeNode ? info(activeNode) : null,
        top: outer.top,
        bottom: outer.bottom,
        width: outer.width,
        height: outer.height,
      },
      rows: list.map(info),
      scroll: {
        top: scroll.scrollTop,
        height: scroll.clientHeight,
        total: scroll.scrollHeight,
      },
      focused: document.activeElement?.id,
      focusableDescendants: [...t.querySelectorAll("*")].filter(
        (x) => x.tabIndex >= 0 && !x.disabled,
      ).length,
    };
  },
  scroll(top, number = 1) {
    const t = document
      .getElementById("ui-view-" + number)
      .querySelector('[role="tree"]');
    if (!t) throw new Error("no mounted tree for scroll");
    const s =
      [t, ...t.querySelectorAll("*")].find(
        (x) =>
          x.scrollHeight > x.clientHeight + 2 &&
          ["auto", "scroll"].includes(getComputedStyle(x).overflowY),
      ) ?? t;
    s.scrollTop = top;
    s.dispatchEvent(new Event("scroll"));
  },
  width(value) {
    document.getElementById("ui-view-1").style.width = value + "px";
  },
  async shutdown() {
    for (const n of [...uiViews.keys()]) uiUnmount(n);
    for (const c of contexts) {
      c.coordinatorOff?.();
      c.indexOff?.();
      for (const x of c.extras ?? []) x.dispose();
    }
    const old = await uiOldShutdown();
    for (const c of contexts)
      if (c.wire.closeDone) {
        await c.wire.closeDone;
        await c.wire.pollDone;
      }
    return { ...old, all: active ? uiState().all : [] };
  },
};
