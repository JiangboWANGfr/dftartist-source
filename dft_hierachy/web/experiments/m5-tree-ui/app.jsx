import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { Tree } from "react-arborist";
import { createSession } from "./fixture.mjs";

const HEIGHT = 336,
  ROW = 28;
const mode = new URLSearchParams(location.search).get("mode") ?? "virtual";
const expandable = (r) =>
  r.kind === "scope" || (r.kind === "instance" && r.expandable);
const label = (r) =>
  r.kind === "instance"
    ? r.instance.name
    : r.kind === "scope"
      ? r.label
      : r.state.status === "pending"
        ? "Loading — cancel"
        : r.state.status === "failed"
          ? `Retry — ${r.state.error.message}`
          : r.state.status === "cancelled"
            ? "Cancelled — retry"
            : "Load more";
const rowKey = (r) =>
  r.kind === "instance"
    ? r.instance.ref
    : r.kind === "scope"
      ? `scope:${r.scopePath.join("/")}`
      : "page-status";

function useModels(session) {
  const { tree, selection } = session;
  const rows = useSyncExternalStore(
    useCallback((fn) => tree.subscribe(fn), [tree]),
    () => tree.rows,
  );
  const selected = useSyncExternalStore(
    useCallback((fn) => selection.subscribe(fn), [selection]),
    () => selection.current,
  );
  return { rows, selected };
}

// Presentation metadata only; no second semantic tree or query cache.
function metadata(rows, session) {
  const groups = new Map(),
    result = new Map(),
    byId = new Map(),
    instances = new Map();
  for (const r of rows) {
    session.work.ariaVisits++;
    byId.set(r.id, r);
    if (r.kind === "instance") instances.set(r.instance.ref, r);
    const group = groups.get(r.parentId) ?? [];
    group.push(r);
    groups.set(r.parentId, group);
  }
  for (const group of groups.values()) {
    const parent = byId.get(group[0].parentId);
    const owner =
      parent?.kind === "scope" ? instances.get(parent.owner) : parent;
    const page =
      owner?.kind === "instance" ? owner.children : session.tree.rootState;
    const incomplete = page.status !== "success" || page.next !== undefined;
    group.forEach((r, i) =>
      result.set(r.id, {
        "aria-posinset": i + 1,
        "aria-setsize": incomplete ? -1 : group.length,
      }),
    );
  }
  return result;
}

function usePresentation(session) {
  const { tree, selection } = session;
  const { rows, selected } = useModels(session);
  const [focusId, setFocus] = useState(null),
    [error, setError] = useState("");
  const active = useRef(true),
    previous = useRef(rows);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const run = useCallback(
    (operation) => {
      setError("");
      return Promise.resolve()
        .then(operation)
        .catch((e) => {
          session.errors.push({ code: e?.code, message: e?.message });
          // Cancellation is visible in the model. Other command-only errors need a surface.
          if (
            active.current &&
            e?.code !== "cancelled" &&
            e?.code !== "disposed"
          )
            setError(`${e.code ?? e.name}: ${e.message}`);
        });
    },
    [session],
  );
  useLayoutEffect(() => {
    let next = focusId;
    const old = new Map(previous.current.map((r) => [r.id, r]));
    const visible = new Set(rows.map((r) => r.id));
    while (next && !visible.has(next)) next = old.get(next)?.parentId ?? null;
    next ??= rows[0]?.id ?? null;
    if (next !== focusId) setFocus(next);
    previous.current = rows;
  }, [rows, focusId]);
  const meta = useMemo(() => metadata(rows, session), [rows, session]);
  const isSelected = (r) =>
    r.kind === "instance" &&
    selected.items.some(
      (item) =>
        item.ref === r.instance.ref ||
        (tree.revealState.status === "success" &&
          tree.revealState.ref === item.ref &&
          tree.revealState.rowId === r.id),
    );
  const activate = (r) => {
    if (r.kind === "instance")
      void run(() =>
        selection.select({
          items: [{ ref: r.instance.ref }],
          origin: "tree",
          snapshotId: tree.snapshotId,
        }),
      );
    else if (r.kind === "scope")
      void run(() => tree.setExpanded(r.id, !r.expanded));
    else
      void run(() =>
        r.state.status === "pending"
          ? tree.cancel(r.owner)
          : r.owner === null
            ? tree.loadRoots()
            : tree.loadMore(r.owner),
      );
  };
  return { rows, focusId, setFocus, error, run, meta, isSelected, activate };
}

function Cell({ row, toggle }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="disclosure"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {expandable(row)
          ? row.expanded
            ? "▾"
            : "▸"
          : row.kind === "status"
            ? "↻"
            : "·"}
      </span>
      <span>{label(row)}</span>
    </>
  );
}

function VirtualTree({ session }) {
  const p = usePresentation(session),
    { tree } = session,
    scroll = useRef(null);
  session.work.renders++;
  const focusedIndex = p.rows.findIndex((r) => r.id === p.focusId);
  const virtual = useVirtualizer({
    count: p.rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => ROW,
    overscan: 2,
    getItemKey: (i) => p.rows[i].id,
    rangeExtractor: (range) =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...(focusedIndex >= 0 ? [focusedIndex] : []),
        ]),
      ].sort((a, b) => a - b),
  });
  const move = (index) => {
    const row = p.rows[Math.max(0, Math.min(index, p.rows.length - 1))];
    if (!row) return;
    p.setFocus(row.id);
    virtual.scrollToIndex(p.rows.indexOf(row), { align: "auto" });
  };
  const keyDown = (e) => {
    const row = p.rows[focusedIndex];
    if (!row) return;
    switch (e.key) {
      case "ArrowDown":
        move(focusedIndex + 1);
        break;
      case "ArrowUp":
        move(focusedIndex - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(p.rows.length - 1);
        break;
      case "ArrowRight":
        if (expandable(row)) {
          if (row.expanded) move(focusedIndex + 1);
          else void p.run(() => tree.setExpanded(row.id, true));
        }
        break;
      case "ArrowLeft":
        if (expandable(row) && row.expanded)
          void p.run(() => tree.setExpanded(row.id, false));
        else if (row.parentId)
          move(p.rows.findIndex((r) => r.id === row.parentId));
        break;
      case "Enter":
      case " ":
        p.activate(row);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  return (
    <>
      <div
        ref={scroll}
        role="tree"
        aria-label="Design hierarchy"
        tabIndex={0}
        className="viewport"
        style={{ height: HEIGHT }}
        onKeyDown={keyDown}
        aria-activedescendant={p.focusId ? `row-${p.focusId}` : undefined}
      >
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((v) => {
            const r = p.rows[v.index];
            return (
              <div
                key={r.id}
                id={`row-${r.id}`}
                role="treeitem"
                data-row={rowKey(r)}
                data-focused={r.id === p.focusId}
                aria-level={r.depth + 1}
                aria-expanded={expandable(r) ? r.expanded : undefined}
                aria-selected={
                  r.kind === "instance" ? p.isSelected(r) : undefined
                }
                {...p.meta.get(r.id)}
                className="tree-row"
                style={{
                  position: "absolute",
                  top: v.start,
                  height: ROW,
                  left: 0,
                  right: 0,
                  paddingLeft: r.depth * 20,
                }}
                onClick={() => {
                  p.setFocus(r.id);
                  scroll.current.focus({ preventScroll: true });
                  p.activate(r);
                }}
              >
                <Cell
                  row={r}
                  toggle={() => {
                    if (expandable(r))
                      void p.run(() => tree.setExpanded(r.id, !r.expanded));
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <output role="alert">{p.error}</output>
    </>
  );
}

function ArboristTree({ session }) {
  const p = usePresentation(session),
    { tree } = session,
    api = useRef(null),
    syncing = useRef(false);
  session.work.renders++;
  const data = useMemo(() => {
    const roots = [],
      nodes = new Map();
    for (const row of p.rows) {
      session.work.projectionVisits++;
      const node = { id: row.id, row, children: expandable(row) ? [] : null };
      nodes.set(row.id, node);
      if (row.parentId) nodes.get(row.parentId).children.push(node);
      else roots.push(node);
    }
    return roots;
  }, [p.rows, session]);
  const initialOpen = useRef(
    Object.fromEntries(
      p.rows.filter(expandable).map((r) => [r.id, r.expanded]),
    ),
  );
  useLayoutEffect(() => {
    const a = api.current;
    if (!a) return;
    syncing.current = true;
    try {
      for (const r of p.rows)
        if (expandable(r) && a.isOpen(r.id) !== r.expanded) {
          if (r.expanded) a.open(r.id);
          else a.close(r.id);
        }
      const selected = p.rows.filter(p.isSelected).map((r) => r.id);
      if (
        selected.length !== a.selectedIds.size ||
        selected.some((id) => !a.selectedIds.has(id))
      )
        a.setSelection({ ids: selected, anchor: null, mostRecent: null });
      if (p.focusId && a.focusedNode?.id !== p.focusId)
        a.focus(p.focusId, { scroll: false });
    } finally {
      syncing.current = false;
    }
  });
  return (
    <>
      <div
        className="arborist-host"
        onKeyDownCapture={(e) => {
          // Default Arborist Enter edits; Space toggles internal nodes. Map to this proposal.
          if (e.key !== "Enter" && e.key !== " ") return;
          const r = p.rows.find((r) => r.id === api.current?.focusedNode?.id);
          if (r) {
            e.preventDefault();
            e.stopPropagation();
            p.activate(r);
          }
        }}
      >
        <Tree
          ref={api}
          data={data}
          width={720}
          height={HEIGHT}
          rowHeight={ROW}
          overscanCount={2}
          aria-label="Design hierarchy"
          initialOpenState={initialOpen.current}
          openByDefault={false}
          disableDrag
          disableDrop
          disableEdit
          disableMultiSelection
          selectionFollowsFocus={false}
          idAccessor={(n) => {
            session.work.idReads++;
            return n.id;
          }}
          childrenAccessor={(n) => {
            session.work.childrenReads++;
            return n.children;
          }}
          onToggle={(id) => {
            if (!syncing.current)
              void p.run(() => tree.setExpanded(id, api.current.isOpen(id)));
          }}
          onFocus={(node) => {
            if (!syncing.current) p.setFocus(node.id);
          }}
          renderRow={({ node, attrs, innerRef, children }) => {
            const r = node.data.row;
            return (
              <div
                {...attrs}
                {...p.meta.get(r.id)}
                ref={innerRef}
                data-row={rowKey(r)}
                data-focused={r.id === p.focusId}
                className="tree-row"
                aria-expanded={expandable(r) ? r.expanded : undefined}
                aria-selected={
                  r.kind === "instance" ? p.isSelected(r) : undefined
                }
                onFocus={(e) => e.stopPropagation()}
                onClick={() => {
                  api.current.focus(r.id);
                  p.activate(r);
                }}
              >
                {children}
              </div>
            );
          }}
        >
          {({ node, style }) => (
            <div style={style}>
              <Cell
                row={node.data.row}
                toggle={() => {
                  if (expandable(node.data.row))
                    void p.run(() =>
                      tree.setExpanded(node.id, !node.data.row.expanded),
                    );
                }}
              />
            </div>
          )}
        </Tree>
      </div>
      <output role="alert">{p.error}</output>
    </>
  );
}

let current = await createSession(),
  previousSessions = [],
  generation = 1;
function App() {
  const [session, setSession] = useState(current),
    [mounted, setMounted] = useState(true);
  const { rows, selected } = useModels(session);
  // Host navigation policy, shared by both renderers. The borrowed view has no
  // second selection-to-query coordinator and does not cancel host work on unmount.
  useEffect(() => {
    if (selected.origin === "tree" || !selected.items[0]?.ref) return;
    void session.tree.reveal(selected.items[0].ref).catch((e) => {
      session.errors.push({ code: e?.code, message: e?.message });
    });
  }, [selected, session]);
  const reset = async (shape = "small", size = 6) => {
    // Unmount before disposing borrowed models (dispose intentionally sends no notification).
    setMounted(false);
    previousSessions.push(current);
    const next = await createSession(shape, size, ++generation);
    current.dispose();
    current = next;
    setSession(next);
    setMounted(true);
  };
  window.lab = {
    reset,
    async expand(ref) {
      await current.tree.setExpanded(current.row(ref).id, true);
    },
    async collapse(ref) {
      await current.tree.setExpanded(current.row(ref).id, false);
    },
    async more(ref = "top") {
      await current.tree.loadMore(current.row(ref).id);
    },
    async reveal(ref) {
      await current.tree.reveal(ref);
    },
    select(ref) {
      current.select(ref);
    },
    scopes(show) {
      return current.tree.setShowGenerateScopes(show);
    },
    hold() {
      current.wire.hold = true;
    },
    fail() {
      current.wire.failNext = true;
    },
    release() {
      current.wire.release();
    },
    releaseOld() {
      for (const s of previousSessions) s.wire.release();
    },
    mount(value) {
      setMounted(value);
    },
    clearWork() {
      for (const k of Object.keys(current.work)) current.work[k] = 0;
    },
    state() {
      return {
        rows: current.tree.rows,
        selected: current.selection.current,
        root: current.tree.rootState,
        reveal: current.tree.revealState,
        errors: current.errors,
        work: { ...current.work },
        deliveredInstances: current.wire.deliveredInstances.size,
        observedCommittedInstances: current.observedCommitted.size,
        pending: current.wire.pending.length,
        sent: current.wire.sent,
        snapshotId: current.tree.snapshotId,
      };
    },
  };
  const Renderer = mode === "arborist" ? ArboristTree : VirtualTree;
  return (
    <main>
      <header>
        <p className="eyebrow">M5 · bounded research prototype</p>
        <h1>
          Design hierarchy{" "}
          <span>{mode === "arborist" ? "Arborist" : "TanStack Virtual"}</span>
        </h1>
        <p>
          Real SDK and shared models · controlled Transport fixture · no
          Electron or Core simulation claim
        </p>
      </header>
      <nav>
        <button onClick={() => void reset()}>Reset</button>
        <button onClick={() => session.select("port-tail")}>
          External port selection
        </button>
        <button
          onClick={() =>
            void session.tree
              .setShowGenerateScopes(!session.tree.showGenerateScopes)
              .catch((e) => session.errors.push(e))
          }
        >
          Toggle scopes
        </button>
        <button onClick={() => setMounted(!mounted)}>
          {mounted ? "Unmount" : "Remount"}
        </button>
      </nav>
      <section key={session.generation}>
        {mounted ? (
          <Renderer session={session} />
        ) : (
          <p>View unmounted; host retains the models.</p>
        )}
      </section>
      <footer>
        <strong>{rows.length} visible model rows</strong>
        <span data-testid="selection">
          Selection: {selected.items[0]?.ref ?? "none"}
        </span>
        <p>
          Arrow keys / Home / End move focus. Enter or Space selects an
          instance; scope and page rows perform their action.
        </p>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
