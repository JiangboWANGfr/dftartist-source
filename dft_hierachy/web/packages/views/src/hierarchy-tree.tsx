import { useSelectionMembership } from "./selection-membership.js";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { defaultRangeExtractor } from "@tanstack/virtual-core";
import {
  resolveObjectAnnotations,
  SelectionModel,
  TreeModel,
  type RowId,
  type StatusTreeRow,
  type TreeRow,
} from "@hier/viewmodel";
import type { HierarchyTreeProps } from "./hierarchy-tree-types.js";
import { useTreeCommands } from "./hierarchy-tree-commands.js";
import { useTreeVirtualizer } from "./tree-virtualizer.js";
import { projectTreeRows } from "./hierarchy-tree-projection.js";
import { useAnnotations } from "./annotation-subscription.js";
import { indexAnnotations } from "./annotation-lookup.js";
import {
  AnnotationBadges,
  createAnnotationDescriptions,
} from "./annotation-presentation.js";

const treeDisposed = Object.getOwnPropertyDescriptor(
  TreeModel.prototype,
  "disposed",
)!.get!;
const selectionDisposed = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "disposed",
)!.get!;
const treeSnapshotId = Object.getOwnPropertyDescriptor(
  TreeModel.prototype,
  "snapshotId",
)!.get!;
const selectionSnapshotId = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "snapshotId",
)!.get!;

function validate(props: HierarchyTreeProps): void {
  const positive = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n > 0;
  if (typeof props.ariaLabel !== "string" || props.ariaLabel.trim() === "")
    throw new TypeError("HierarchyTree ariaLabel must be a nonblank string");
  if (!positive(props.height))
    throw new TypeError("HierarchyTree height must be finite and positive");
  if (props.rowHeight !== undefined && !positive(props.rowHeight))
    throw new TypeError("HierarchyTree rowHeight must be finite and positive");
  if (
    props.overscan !== undefined &&
    (typeof props.overscan !== "number" ||
      !Number.isInteger(props.overscan) ||
      props.overscan < 0)
  )
    throw new TypeError("HierarchyTree overscan must be a nonnegative integer");
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("HierarchyTree className must be a string");
  if (
    props.onCommandError !== undefined &&
    typeof props.onCommandError !== "function"
  )
    throw new TypeError("HierarchyTree onCommandError must be a function");
  // Private-field getters check genuine instances, including proxy rejection.
  if (
    treeDisposed.call(props.tree) ||
    selectionDisposed.call(props.selection) ||
    selectionSnapshotId.call(props.selection) === undefined ||
    selectionSnapshotId.call(props.selection) !==
      treeSnapshotId.call(props.tree)
  )
    throw new TypeError(
      "HierarchyTree requires live models for the same snapshot",
    );
}

function useTreeSnapshot(tree: TreeModel) {
  const store = useMemo(() => {
    const read = () => ({
      rows: tree.rows,
      root: tree.rootState,
      reveal: tree.revealState,
    });
    let current = read();
    return {
      subscribe: (notify: () => void) => tree.subscribe(notify),
      snapshot: () => {
        const next = read();
        if (
          current.rows !== next.rows ||
          current.root !== next.root ||
          current.reveal !== next.reveal
        )
          current = next;
        return current;
      },
    };
  }, [tree]);
  return useSyncExternalStore(store.subscribe, store.snapshot);
}

function statusLabel(row: StatusTreeRow): string {
  switch (row.state.status) {
    case "idle":
      return row.owner === null ? "加载层次" : "加载子实例";
    case "pending":
      return "加载中，取消";
    case "failed":
      return "加载失败，重试";
    case "cancelled":
      return "已取消，重试";
    case "success":
      return "加载更多";
  }
}

/** A virtual presentation of the host's published hierarchy and selection. */
export function HierarchyTree(props: HierarchyTreeProps): ReactElement {
  validate(props);
  const annotationSnapshot = treeSnapshotId.call(props.tree) as string;
  const {
    tree,
    selection,
    height,
    ariaLabel,
    className,
    rowHeight = 28,
    overscan = 2,
  } = props;
  const { rows, root, reveal } = useTreeSnapshot(tree);
  const subscribeSelection = useCallback(
    (notify: () => void) => selection.subscribe(notify),
    [selection],
  );
  const readSelection = useCallback(() => selection.current, [selection]);
  const selected = useSyncExternalStore(subscribeSelection, readSelection);
  const commands = useTreeCommands(props);
  const { session } = commands;
  const annotations = useAnnotations(
    annotationSnapshot,
    props.annotations,
    session,
  );
  const projection = useMemo(() => projectTreeRows(rows, root), [rows, root]);
  const previous = useRef({ session, projection });
  const [focus, setFocus] = useState<{ session: object; id: RowId } | null>(
    null,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const rowDomId = (id: RowId) => `${prefix}-${id}`;
  const { objects: selectionRefs } = useSelectionMembership(selected);
  const isSelected = (row: TreeRow) =>
    row.kind === "instance" &&
    (selectionRefs.has(row.instance.ref) ||
      (reveal.status === "success" &&
        reveal.rowId === row.id &&
        selectionRefs.has(reveal.ref)));

  let activeId = focus?.session === session ? focus.id : null;
  if (activeId !== null && !projection.byId.has(activeId)) {
    const oldRows =
      previous.current.session === session
        ? previous.current.projection.byId
        : null;
    while (activeId !== null && !projection.byId.has(activeId))
      activeId = oldRows?.get(activeId)?.row.parentId ?? null;
  }
  activeId ??= rows[0]?.id ?? null;
  const activeIndex =
    activeId === null ? -1 : projection.byId.get(activeId)!.index;
  // Virtual Core invalidates measurements when this callback changes.
  const getItemKey = useCallback((index: number) => rows[index]!.id, [rows]);
  const virtual = useTreeVirtualizer({
    count: rows.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey,
    initialRect: { height, width: 0 },
    rangeExtractor: (range) => {
      const indices = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !indices.includes(activeIndex))
        indices.push(activeIndex);
      return indices.sort((a, b) => a - b);
    },
  });

  useLayoutEffect(() => {
    previous.current = { session, projection };
    // Commit fallback before the previous projection is lost on another update.
    if (
      focus?.session === session &&
      activeId !== null &&
      focus.id !== activeId
    )
      setFocus({ session, id: activeId });
    if (rows.length === 0) setFocus(null);
  }, [session, projection, focus, activeId, rows.length]);
  useLayoutEffect(() => {
    virtual.scrollToOffset(0);
    if (viewport.current) viewport.current.scrollLeft = 0;
  }, [session]);
  useLayoutEffect(() => {
    virtual.measure();
  }, [rowHeight, virtual]);
  const lastReveal = useRef<{ session: object; reveal: typeof reveal } | null>(
    null,
  );
  useLayoutEffect(() => {
    if (
      lastReveal.current?.session === session &&
      lastReveal.current.reveal === reveal
    )
      return;
    lastReveal.current = { session, reveal };
    if (reveal.status === "success") {
      const target = projection.byId.get(reveal.rowId);
      if (target) virtual.scrollToIndex(target.index, { align: "auto" });
    }
  }, [session, reveal, projection, virtual]);

  function move(id: RowId): void {
    setFocus({ session, id });
    const target = projection.byId.get(id);
    if (target) virtual.scrollToIndex(target.index, { align: "auto" });
  }
  function expand(row: TreeRow, expanded: boolean): void {
    commands.run("setExpanded", row.id, () =>
      tree.setExpanded(row.id, expanded),
    );
  }
  function activate(row: TreeRow): void {
    if (row.kind === "instance") {
      commands.run("select", row.id, () =>
        selection.select({
          items: [{ ref: row.instance.ref }],
          origin: "tree",
          snapshotId: tree.snapshotId,
        }),
      );
    } else if (row.kind === "scope") {
      expand(row, !row.expanded);
    } else if (row.state.status === "pending") {
      commands.run("cancel", row.id, () => tree.cancel(row.owner));
    } else if (row.owner === null) {
      commands.run("loadRoots", row.id, () => tree.loadRoots());
    } else {
      const owner = row.owner;
      commands.run("loadMore", row.id, () => tree.loadMore(owner));
    }
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const row = activeIndex < 0 ? undefined : rows[activeIndex];
    if (!row) return;
    const expandable =
      row.kind === "scope" || (row.kind === "instance" && row.expandable);
    switch (event.key) {
      case "ArrowDown":
        move(rows[Math.min(activeIndex + 1, rows.length - 1)]!.id);
        break;
      case "ArrowUp":
        move(rows[Math.max(activeIndex - 1, 0)]!.id);
        break;
      case "Home":
        move(rows[0]!.id);
        break;
      case "End":
        move(rows[rows.length - 1]!.id);
        break;
      case "ArrowRight":
        if (expandable && !row.expanded) expand(row, true);
        else if (expandable && rows[activeIndex + 1]?.parentId === row.id)
          move(rows[activeIndex + 1]!.id);
        break;
      case "ArrowLeft":
        if (expandable && row.expanded) expand(row, false);
        else if (row.parentId !== null) move(row.parentId);
        break;
      case "Enter":
      case " ":
        activate(row);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const totalSize = virtual.getTotalSize();
  const renderedRows = virtual.getVirtualItems().map((item) => ({ item, row: rows[item.index]! }));
  const annotationFor = indexAnnotations(resolveObjectAnnotations(
    annotationSnapshot,
    renderedRows.flatMap(({ row }) => row.kind === "instance" ? [row.instance.ref] : []),
    annotations,
  ));
  const describeAnnotations = createAnnotationDescriptions();
  return (
    <div
      className={["hier-hierarchy-tree", className].filter(Boolean).join(" ")}
      style={{ minWidth: 0, width: "100%" }}
    >
      <div
        ref={viewport}
        role="tree"
        aria-label={ariaLabel}
        aria-multiselectable={true}
        aria-activedescendant={
          activeId === null ? undefined : rowDomId(activeId)
        }
        tabIndex={0}
        style={{
          height,
          width: "100%",
          overflow: "auto",
          position: "relative",
          boxSizing: "border-box",
        }}
        onKeyDown={keyDown}
        onFocus={() => {
          if (focus?.session !== session) {
            const first = rows.find(isSelected) ?? rows[0];
            if (first) move(first.id);
          }
        }}
      >
        {rows.length === 0 && root.status === "success" ? (
          <div>无顶层实例</div>
        ) : null}
        <div
          style={{
            height: totalSize,
            position: "relative",
            minWidth: "100%",
            width: "max-content",
          }}
        >
          {renderedRows.map(({ item, row }) => {
            const marks = annotationFor(row.kind === "instance" ? [row.instance.ref] : []);
            const description = describeAnnotations(marks);
            const metadata = projection.byId.get(row.id)!;
            const expandable =
              row.kind === "scope" ||
              (row.kind === "instance" && row.expandable);
            const label =
              row.kind === "instance"
                ? row.instance.name
                : row.kind === "scope"
                  ? row.label
                  : statusLabel(row);
            return (
              <div
                key={row.id}
                id={rowDomId(row.id)}
                role="treeitem"
                title={description}
                aria-label={
                  description === undefined
                    ? undefined
                    : `${label}\n${description}`
                }
                aria-level={row.depth + 1}
                aria-expanded={expandable ? row.expanded : undefined}
                aria-selected={
                  row.kind === "instance" ? isSelected(row) : undefined
                }
                aria-posinset={metadata.position}
                aria-setsize={
                  metadata.page.status !== "success" ||
                  metadata.page.next !== undefined
                    ? -1
                    : projection.counts.get(row.parentId)
                }
                data-active={row.id === activeId ? "true" : undefined}
                className="hier-hierarchy-tree__row"
                style={{
                  position: "absolute",
                  top: item.start,
                  height: rowHeight,
                  minWidth: "100%",
                  width: "max-content",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  whiteSpace: "nowrap",
                  paddingLeft: row.depth * 18,
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  viewport.current?.focus({ preventScroll: true });
                  move(row.id);
                  activate(row);
                }}
                onContextMenu={(event) => {
                  // macOS delivers a Control-click as contextmenu, without click.
                  if (!event.ctrlKey || event.button !== 0) return;
                  event.preventDefault();
                  viewport.current?.focus({ preventScroll: true });
                  move(row.id);
                  activate(row);
                }}
              >
                {expandable ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="hier-hierarchy-tree__expand"
                    aria-label={`${row.expanded ? "折叠" : "展开"} ${label}`}
                    style={{
                      flex: "0 0 24px",
                      width: 24,
                      height: "100%",
                      padding: 0,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      viewport.current?.focus({ preventScroll: true });
                      move(row.id);
                      expand(row, !row.expanded);
                    }}
                    onContextMenu={(event) => {
                      if (!event.ctrlKey || event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      viewport.current?.focus({ preventScroll: true });
                      move(row.id);
                      expand(row, !row.expanded);
                    }}
                  >
                    {row.expanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ width: 24, flexShrink: 0 }}
                  />
                )}
                <span>{label}</span>
                <AnnotationBadges matches={marks} />
                {row.kind === "status" &&
                (row.state.status === "failed" ||
                  row.state.status === "cancelled") ? (
                  <span className="hier-hierarchy-tree__diagnostic">
                    {" "}
                    {row.state.error.code}: {row.state.error.message}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {commands.failed ? (
        <div role="alert" className="hier-hierarchy-tree__error">
          操作失败
        </div>
      ) : null}
    </div>
  );
}
