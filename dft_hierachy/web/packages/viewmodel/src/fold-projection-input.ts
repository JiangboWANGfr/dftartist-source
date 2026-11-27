import { captureJSON } from "./json-input.js";
import type { JSONInputReader } from "./json-input.js";
import type { GraphSessionState } from "./graph-types.js";
import { FoldProjectionError } from "./fold-projection-types.js";
import type { GraphFoldOptions, FoldedGraphTarget } from "./fold-projection-types.js";

function invalid(message: string): never {
  throw new FoldProjectionError("invalid_argument", message);
}

/** Guard every operation on caller data, including throwing Proxy traps/getters. */
function reader(guard: () => void): JSONInputReader {
  return {
    invalid,
    read<T>(operation: () => T): T {
      let value: T;
      try {
        value = operation();
      } catch (cause) {
        let failure = new FoldProjectionError("invalid_argument", "Cannot read fold input");
        try {
          guard();
        } catch (e) {
          failure = e as FoldProjectionError;
        }
        Object.defineProperty(failure, "cause", {
          value: cause,
          configurable: true,
          writable: true,
        });
        throw failure;
      }
      guard();
      return value;
    },
  };
}

// These validators only inspect the owned, frozen JSON copy, never caller objects.
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Expected fold record");
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, names: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length !== names.length || keys.some((key) => !names.includes(key)))
    invalid("Unexpected or missing fold field");
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid("Expected nonblank fold string");
  return value;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) invalid("Expected fold array");
  return value;
}

export function readFoldOptions(
  input: unknown,
  state: GraphSessionState,
  guard: () => void,
): GraphFoldOptions {
  const owned = record(captureJSON(input, reader(guard), "Fold options"));
  fields(owned, ["groups", "collapsed"]);
  const nodeIds = new Set<string>(state.nodes.map((n) => n.id));
  const edgeIds = new Set<string>(state.edges.map((e) => e.id));
  const keys = new Set<string>();
  const hierarchies: Set<string>[] = [];
  const busEdges = new Set<string>();
  for (const value of array(owned.groups)) {
    const group = record(value);
    if (group.kind !== "hierarchy" && group.kind !== "bus") invalid("Unknown fold group kind");
    const hierarchy = group.kind === "hierarchy";
    fields(group, ["kind", "key", "label", hierarchy ? "nodes" : "edges"]);
    const key = text(group.key);
    text(group.label);
    if (keys.has(key)) invalid("Duplicate fold group key");
    keys.add(key);
    const members = array(hierarchy ? group.nodes : group.edges);
    if (members.length < (hierarchy ? 1 : 2)) invalid("Fold group has too few members");
    const ids = new Set<string>();
    for (const member of members) {
      const id = text(member);
      if (!(hierarchy ? nodeIds : edgeIds).has(id) || ids.has(id))
        invalid("Unknown or duplicate fold member");
      ids.add(id);
      if (!hierarchy) {
        if (busEdges.has(id)) invalid("Bus groups must be disjoint");
        busEdges.add(id);
      }
    }
    if (hierarchy) hierarchies.push(ids);
  }
  // Larger groups first: a new group cannot strictly contain any processed group.
  // All its nodes must therefore be in the same nearest processed ancestor (or
  // all unclaimed). Mixed ownership means partial overlap; equal sets also fail.
  // Only this private array is sorted. Cost is O(G log G + total member count),
  // including expanded groups, without comparing every pair of disjoint groups.
  const owners = new Map<string, Set<string>>();
  hierarchies.sort((a, b) => b.size - a.size);
  for (const ids of hierarchies) {
    const parent = owners.get(ids.values().next().value!);
    if (parent?.size === ids.size) invalid("Hierarchy groups must be disjoint or strictly nested");
    for (const id of ids) {
      if (owners.get(id) !== parent)
        invalid("Hierarchy groups must be disjoint or strictly nested");
    }
    for (const id of ids) owners.set(id, ids);
  }
  const collapsed = new Set<string>();
  for (const value of array(owned.collapsed)) {
    const key = text(value);
    if (!keys.has(key) || collapsed.has(key)) invalid("Unknown or duplicate collapsed group");
    collapsed.add(key);
  }
  return owned as unknown as GraphFoldOptions;
}

export function readFoldTarget(input: unknown, guard: () => void): FoldedGraphTarget {
  const owned = record(captureJSON(input, reader(guard), "Fold target"));
  fields(owned, ["projectionId", "kind", "id"]);
  text(owned.projectionId);
  text(owned.id);
  if (owned.kind !== "node" && owned.kind !== "edge") invalid("Unknown fold target kind");
  return owned as unknown as FoldedGraphTarget;
}
