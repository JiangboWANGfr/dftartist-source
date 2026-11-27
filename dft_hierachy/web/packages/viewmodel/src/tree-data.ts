import { HierError } from "@hier/client";
import { captureDiagnosticData } from "./diagnostic-data.js";
import { TreeError } from "./tree-types.js";
import type {
  RowId,
  TreeCompleteness,
  TreeFailure,
  TreeInstance,
  TreePageState,
  TreeRow,
} from "./tree-types.js";

export type TreeTaskError = TreeError | HierError;
export class TreeNode {
  #children: TreePageState | TreePage;
  constructor(
    readonly info: TreeInstance,
    readonly parent: TreeNode | null,
  ) {
    this.#children = info.childCount === 0
      ? Object.freeze({
          status: "success",
          loadedCount: 0,
          completeness: complete,
        })
      : idlePage();
  }
  get childrenState(): TreePageState {
    return "owner" in this.#children ? this.#children.state : this.#children;
  }
  get materializedPage(): TreePage | undefined {
    return "owner" in this.#children ? this.#children : undefined;
  }
  get page(): TreePage {
    // Rows need an initial state, not an empty list and cursor set per node.
    // Replace that state with its sole owning page only on actual page use.
    if ("owner" in this.#children) return this.#children;
    return this.#children = {
      owner: this,
      items: [],
      error: undefined,
      cursors: new Set(),
      state: this.#children,
    };
  }
}
export interface TreePage {
  readonly owner: TreeNode | null;
  items: TreeNode[];
  state: TreePageState;
  error: TreeTaskError | undefined;
  readonly cursors: Set<string>;
}

const complete: TreeCompleteness = Object.freeze({
  status: "complete",
  reasons: Object.freeze([]),
});
export function idlePage(): TreePageState {
  return Object.freeze({ status: "idle", loadedCount: 0 });
}

/** Own diagnostics without freezing callers or letting their accessors commit state. */
export function treeFailure(error: TreeError): TreeFailure;
export function treeFailure(
  error: TreeTaskError,
  isDisposed: () => boolean,
): TreeFailure | undefined;
export function treeFailure(
  error: TreeTaskError,
  isDisposed: () => boolean = () => false,
): TreeFailure | undefined {
  const fields = {
    code: error.code,
    origin: error instanceof HierError ? error.origin : "tree",
    message: error.message,
  } as const;
  const empty = Object.freeze({});
  if (!(error instanceof HierError))
    return Object.freeze({ ...fields, data: empty });

  const diagnostic = captureDiagnosticData(error, isDisposed);
  return diagnostic === undefined
    ? undefined
    : Object.freeze({ ...fields, ...diagnostic });
}

export function inconsistent(message: string): never {
  throw new TreeError("inconsistent_reply", message);
}
export function pathPrefix(
  prefix: readonly string[],
  path: readonly string[],
): boolean {
  return (
    prefix.length < path.length &&
    prefix.every((part, index) => part === path[index])
  );
}
export function checkChild(parent: TreeInstance, child: TreeInstance): void {
  if (!pathPrefix(parent.path, child.path) || child.path.at(-1) !== child.name)
    inconsistent(
      "Child path must extend its owner's path and end with its name",
    );
}

interface ScopeGroup {
  readonly kind: "group";
  readonly owner: TreeNode;
  readonly path: readonly string[];
  readonly children: ProjectedChild[];
  readonly groups: Map<string, ScopeGroup>;
}
type ProjectedChild = TreeNode | ScopeGroup;
interface PageProjection {
  readonly items: TreeNode[];
  children: ProjectedChild[];
  groups: Map<string, ScopeGroup> | undefined;
  loaded: number;
}
let nextModelId = 0n;

/** Loaded instance prefixes and their projection. No transport or async ownership here. */
export class TreeData {
  readonly root: TreePage = {
    owner: null,
    items: [],
    state: idlePage(),
    error: undefined,
    cursors: new Set(),
  };
  readonly nodes = new Map<string, TreeNode>();
  readonly #modelId = String(++nextModelId);
  readonly #identities = new Map<string, RowId>();
  readonly #expanded = new Map<RowId, boolean>();
  #groupedPages = new WeakMap<TreePage, PageProjection>();
  #projectedRows = new WeakMap<TreeNode | ScopeGroup | TreePage, TreeRow>();
  readonly #changedPages = new Set<TreePage>();
  #structureChanged = true;
  #appendProjection: { page: TreePage; from: number } | undefined;
  #projectedScopes: boolean | undefined;
  rows: readonly TreeRow[] = Object.freeze([]);
  readonly visible = new Map<RowId, TreeRow>();

  #identity(key: string): RowId {
    let id = this.#identities.get(key);
    if (id === undefined) {
      id = `tree:${this.#modelId}:${this.#identities.size}` as RowId;
      this.#identities.set(key, id);
    }
    return id;
  }
  nodeId(node: TreeNode): RowId {
    // Disjoint identity domains keep refs literal; only scope path tuples
    // need JSON encoding. RowId allocation still uses this one registry.
    return (
      this.#projectedRows.get(node)?.id ??
      this.#identity(`i:${node.info.ref}`)
    );
  }
  scopeId(owner: TreeNode, path: readonly string[]): RowId {
    return this.#identity(`g:${JSON.stringify([owner.info.ref, path])}`);
  }
  nodeExpanded(node: TreeNode): boolean {
    return (
      node.info.childCount > 0 &&
      (this.#expanded.get(this.nodeId(node)) ?? false)
    );
  }
  setExpanded(id: RowId, expanded: boolean, initial: boolean): boolean {
    if ((this.#expanded.get(id) ?? initial) === expanded) return false;
    this.#expanded.set(id, expanded);
    this.#structureChanged = true;
    this.#appendProjection = undefined;
    return true;
  }
  openScopes(node: TreeNode): boolean {
    if (!node.parent) return false;
    const parts = node.info.path.slice(node.parent.info.path.length, -1);
    let changed = false;
    for (let length = 1; length <= parts.length; ++length)
      changed =
        this.setExpanded(
          this.scopeId(node.parent, parts.slice(0, length)),
          true,
          true,
        ) || changed;
    return changed;
  }
  setState(
    page: TreePage,
    state:
      | { status: "pending" }
      | {
          status: "failed" | "cancelled";
          error: TreeTaskError;
          diagnostic: TreeFailure;
        },
  ): void {
    const prefix = {
      loadedCount: page.items.length,
      ...(page.state.next === undefined ? {} : { next: page.state.next }),
      ...(page.state.completeness === undefined
        ? {}
        : { completeness: page.state.completeness }),
    };
    page.error = state.status === "pending" ? undefined : state.error;
    page.state =
      state.status === "pending"
        ? Object.freeze({ ...prefix, status: state.status })
        : Object.freeze({
            ...prefix,
            status: state.status,
            error: state.diagnostic,
          });
    this.#changedPages.add(page);
  }
  append(
    page: TreePage,
    items: readonly TreeInstance[],
    completeness: TreeCompleteness,
    next?: string,
  ): void {
    // Validate the whole page before publishing any member, cursor or identity.
    const refs = new Set<string>();
    for (const item of items) {
      if (refs.has(item.ref) || this.nodes.has(item.ref))
        inconsistent("An instance appears more than once in the loaded tree");
      refs.add(item.ref);
      if (item.path.length === 0 || item.path.at(-1) !== item.name)
        inconsistent("Instance path must end with its name");
      if (page.owner) checkChild(page.owner.info, item);
    }
    if (next !== undefined && page.cursors.has(next))
      inconsistent("Pagination cursor repeats or forms a cycle");
    const count = page.items.length + items.length;
    if (
      page.owner &&
      (count > page.owner.info.childCount ||
        (next === undefined && count !== page.owner.info.childCount))
    )
      inconsistent("Loaded child count disagrees with the owning instance");
    if (
      page.owner &&
      next !== undefined &&
      (items.length === 0 || count >= page.owner.info.childCount)
    )
      inconsistent(
        "A continuing child page must make progress and leave unreturned children",
      );
    const additions = items.map((info) => new TreeNode(info, page.owner));
    const append = this.#structureChanged
      ? this.#appendProjection
      : { page, from: page.items.length };
    this.#appendProjection = append?.page === page ? append : undefined;
    for (const node of additions) {
      this.nodes.set(node.info.ref, node);
      page.items.push(node);
    }
    if (next !== undefined) page.cursors.add(next);
    page.error = undefined;
    page.state = Object.freeze({
      status: "success",
      loadedCount: count,
      completeness,
      ...(next === undefined ? {} : { next }),
    });
    this.#structureChanged = true;
    this.#changedPages.add(page);
  }
  clear(page: TreePage): void {
    this.#appendProjection = undefined;
    for (const node of this.#walk(page.items, "nodes")) {
      const childPage = node.materializedPage;
      if (childPage) {
        this.#groupedPages.delete(childPage);
        this.#projectedRows.delete(childPage);
        this.#changedPages.delete(childPage);
      }
      this.nodes.delete(node.info.ref);
      this.#projectedRows.delete(node);
    }
    this.#groupedPages.delete(page);
    this.#projectedRows.delete(page);
    this.#changedPages.delete(page);
    page.items = [];
    page.error = undefined;
    page.cursors.clear();
    page.state = idlePage();
    this.#structureChanged = true;
  }
  *subtree(page: TreePage, materializedOnly = false): Generator<TreePage> {
    yield page;
    for (const node of this.#walk(page.items, materializedOnly ? "pages" : "allPages")) {
      const childPage = node.materializedPage;
      if (childPage) yield childPage;
    }
  }
  *#walk(
    items: readonly TreeNode[],
    mode: "nodes" | "pages" | "allPages",
  ): Generator<TreeNode> {
    const pending: { items: readonly TreeNode[]; index: number }[] = [];
    const enter = (children: readonly TreeNode[]) => {
      // The default page iterator still materializes each direct list LTR
      // before yielding its last sibling, including across iterator pauses.
      if (mode === "allPages") for (const node of children) void node.page;
      if (children.length) pending.push({ items: children, index: children.length - 1 });
    };
    enter(items);
    while (pending.length) {
      const frame = pending[pending.length - 1]!;
      const node = frame.items[frame.index--]!;
      if (frame.index < 0) pending.pop();
      const childPage = node.materializedPage;
      if (mode === "nodes" || childPage) yield node;
      if (childPage) enter(childPage.items);
    }
  }
  #group(page: TreePage, showScopes: boolean): ProjectedChild[] {
    if (!page.owner || !showScopes) return page.items;
    let projection = this.#groupedPages.get(page);
    if (!projection || projection.items !== page.items) {
      projection = {
        items: page.items,
        children: page.items,
        groups: undefined,
        loaded: 0,
      };
      this.#groupedPages.set(page, projection);
    }
    // Only successful append changes this prefix. State changes and scope
    // visibility do not require regrouping its immutable instance paths.
    for (let i = projection.loaded; i < page.items.length; ++i) {
      const node = page.items[i]!;
      if (node.info.path.length === page.owner.info.path.length + 1) {
        // Until the first scope, the fact list already is the projection.
        // Only a separate grouped list may be appended to here.
        if (projection.groups) projection.children.push(node);
        continue;
      }
      if (!projection.groups) {
        projection.children = page.items.slice(0, i);
        projection.groups = new Map();
      }
      const path = node.info.path.slice(page.owner.info.path.length, -1);
      let siblings = projection.children,
        index = projection.groups;
      for (let offset = 0; offset < path.length; ++offset) {
        const part = path[offset]!;
        let group = index.get(part);
        if (!group) {
          group = {
            kind: "group",
            owner: page.owner,
            path: Object.freeze(path.slice(0, offset + 1)),
            children: [],
            groups: new Map(),
          };
          siblings.push(group);
          index.set(part, group);
        }
        siblings = group.children;
        index = group.groups;
      }
      siblings.push(node);
    }
    projection.loaded = page.items.length;
    return projection.children;
  }
  project(showScopes: boolean): void {
    if (
      !this.#structureChanged && this.#projectedScopes === showScopes &&
      this.#projectStates()
    ) return;
    if (
      this.#projectedScopes === showScopes && this.#appendProjection &&
      this.#projectAppend(showScopes)
    ) return;
    type Frame = {
      children: readonly ProjectedChild[];
      index: number;
      parentId: RowId | null;
      depth: number;
      status: TreePage | undefined;
    };
    const pending: Frame[] = [],
      rows: TreeRow[] = [];
    const pushPage = (
      page: TreePage,
      parentId: RowId | null,
      depth: number,
    ) => {
      const status =
        page.state.status !== "success" || page.state.next !== undefined
          ? page
          : undefined;
      pending.push({
        children: this.#group(page, showScopes),
        index: 0,
        parentId,
        depth,
        status,
      });
    };
    pushPage(this.root, null, 0);
    while (pending.length) {
      // Keep one cursor per active child list rather than one frame per sibling.
      // A page's status follows every child and its descendants, as before.
      const frame = pending[pending.length - 1]!;
      const { parentId, depth } = frame;
      let entry: ProjectedChild | TreePage;
      if (frame.index < frame.children.length) {
        entry = frame.children[frame.index++]!;
        // A consumed tail with no page status needs no deferred return frame.
        if (frame.index === frame.children.length && !frame.status) pending.pop();
      } else {
        pending.pop();
        if (!frame.status) continue;
        entry = frame.status;
      }
      const previous = this.#projectedRows.get(entry);
      const samePosition =
        previous?.parentId === parentId && previous.depth === depth;
      let row: TreeRow;
      if ("state" in entry) {
        const id = previous?.id ??
          this.#identity(entry.owner ? `p:${entry.owner.info.ref}` : "root");
        row =
          samePosition && previous.kind === "status" && previous.state === entry.state
            ? previous
            : Object.freeze({
                kind: "status",
                id,
                parentId,
                depth,
                owner: parentId,
                state: entry.state,
              });
      } else if ("kind" in entry) {
        const id = previous?.id ?? this.scopeId(entry.owner, entry.path),
          expanded = this.#expanded.get(id) ?? true;
        row =
          samePosition && previous.kind === "scope" && previous.expanded === expanded
            ? previous
            : Object.freeze({
                kind: "scope",
                id,
                parentId,
                depth,
                owner: entry.owner.info.ref,
                scopePath: entry.path,
                label: entry.path.at(-1)!,
                expanded,
              });
        if (expanded)
          pending.push({
            children: entry.children,
            index: 0,
            parentId: id,
            depth: depth + 1,
            status: undefined,
          });
      } else {
        const id = this.nodeId(entry),
          expanded = this.nodeExpanded(entry),
          children = entry.childrenState;
        row =
          samePosition && previous.kind === "instance" &&
          previous.expanded === expanded && previous.children === children
            ? previous
            : Object.freeze({
                kind: "instance",
                id,
                parentId,
                depth,
                instance: entry.info,
                expanded,
                expandable: entry.info.childCount > 0,
                children,
              });
        if (expanded) pushPage(entry.page, id, depth + 1);
      }
      if (row !== previous) this.#projectedRows.set(entry, row);
      rows.push(row);
    }
    this.rows = Object.freeze(rows);
    this.visible.clear();
    for (const row of rows) this.visible.set(row.id, row);
    this.#changedPages.clear();
    this.#structureChanged = false;
    this.#appendProjection = undefined;
    this.#projectedScopes = showScopes;
  }
  #projectAppend(showScopes: boolean): boolean {
    const { page, from } = this.#appendProjection!;
    for (const changed of this.#changedPages)
      if (changed !== page) return false;
    const cachedOwner = page.owner && this.#projectedRows.get(page.owner);
    const owner = cachedOwner?.kind === "instance" &&
      this.visible.get(cachedOwner.id) === cachedOwner ? cachedOwner : undefined;
    if (page.owner && !owner?.expanded) {
      // Hidden additions do not change visible topology. A later complete
      // projection will group their immutable paths with the loaded prefix.
      if (!this.#projectStates()) return false;
      this.#structureChanged = false;
      this.#appendProjection = undefined;
      return true;
    }
    const cachedStatus = this.#projectedRows.get(page);
    if (cachedStatus?.kind !== "status" ||
      this.visible.get(cachedStatus.id) !== cachedStatus) return false;
    for (let index = from; index < page.items.length; ++index) {
      const node = page.items[index]!;
      if (node.info.childCount !== 0 ||
        (showScopes && page.owner &&
          node.info.path.length !== page.owner.info.path.length + 1)) return false;
    }
    const at = this.rows.indexOf(cachedStatus);
    const ownerAt = owner ? this.rows.indexOf(owner) : -1;
    if (at < 0 || (owner && (ownerAt < 0 || ownerAt >= at))) return false;

    // Direct leaves follow the old loaded subtree, immediately before its
    // status. Build the entire next array before updating either lookup cache.
    const rows = this.rows.slice(0, at);
    const nextOwner = owner && Object.freeze({ ...owner, children: page.state });
    if (nextOwner) rows[ownerAt] = nextOwner;
    for (let index = from; index < page.items.length; ++index) {
      const node = page.items[index]!;
      rows.push(Object.freeze({
        kind: "instance",
        id: this.nodeId(node),
        parentId: cachedStatus.parentId,
        depth: cachedStatus.depth,
        instance: node.info,
        expanded: false,
        expandable: false,
        children: node.childrenState,
      }));
    }
    const needsStatus = page.state.status !== "success" || page.state.next !== undefined;
    const nextStatus = needsStatus
      ? Object.freeze({ ...cachedStatus, state: page.state }) : undefined;
    if (nextStatus) rows.push(nextStatus);
    for (let index = at + 1; index < this.rows.length; ++index)
      rows.push(this.rows[index]!);

    // Preserve visible's DFS iteration order too, including a middle-page
    // insertion. Prefix entries are reused; only the affected suffix is rebuilt.
    for (let index = at; index < this.rows.length; ++index)
      this.visible.delete(this.rows[index]!.id);
    if (nextOwner && page.owner) {
      this.#projectedRows.set(page.owner, nextOwner);
      this.visible.set(nextOwner.id, nextOwner);
    }
    for (let index = from; index < page.items.length; ++index)
      this.#projectedRows.set(page.items[index]!, rows[at + index - from]!);
    if (nextStatus) this.#projectedRows.set(page, nextStatus);
    for (let index = at; index < rows.length; ++index)
      this.visible.set(rows[index]!.id, rows[index]!);
    this.rows = Object.freeze(rows);
    this.#changedPages.clear();
    this.#structureChanged = false;
    this.#appendProjection = undefined;
    return true;
  }
  #projectStates(): boolean {
    const changes = new Map<TreeRow, {
      entry: TreeNode | TreePage;
      row: TreeRow;
    }>();
    for (const page of this.#changedPages) {
      const cachedOwner = page.owner && this.#projectedRows.get(page.owner);
      const owner = cachedOwner?.kind === "instance" &&
        this.visible.get(cachedOwner.id) === cachedOwner ? cachedOwner : undefined;
      const cachedStatus = this.#projectedRows.get(page);
      const status = cachedStatus?.kind === "status" &&
        this.visible.get(cachedStatus.id) === cachedStatus ? cachedStatus : undefined;
      const pageVisible = page.owner === null || owner?.expanded === true;
      const needsStatus = page.state.status !== "success" || page.state.next !== undefined;
      // Status insertion/removal changes topology. Decide every page before
      // publishing any replacement, so a batch can fall back atomically.
      if ((pageVisible && needsStatus) !== (status !== undefined)) return false;
      if (owner && page.owner && owner.children !== page.state)
        changes.set(owner, {
          entry: page.owner,
          row: Object.freeze({ ...owner, children: page.state }),
        });
      if (status && status.state !== page.state)
        changes.set(status, {
          entry: page,
          row: Object.freeze({ ...status, state: page.state }),
        });
    }
    // One linear replacement pass also handles many simultaneous page changes;
    // no per-page full-array search or additional per-node position index.
    const rows = changes.size
      ? this.rows.map((row) => changes.get(row)?.row ?? row)
      : this.rows.slice();
    for (const [previous, change] of changes) {
      this.visible.set(previous.id, change.row);
      this.#projectedRows.set(change.entry, change.row);
    }
    this.rows = Object.freeze(rows);
    this.#changedPages.clear();
    return true;
  }
  dispose(): void {
    this.clear(this.root);
    this.#identities.clear();
    this.#expanded.clear();
    this.#groupedPages = new WeakMap();
    this.#projectedRows = new WeakMap();
    this.#changedPages.clear();
    this.visible.clear();
    this.rows = Object.freeze([]);
  }
}
