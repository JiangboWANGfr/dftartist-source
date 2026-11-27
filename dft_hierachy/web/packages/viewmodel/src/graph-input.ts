import { validateDefinition } from "@hier/protocol-types";
import type { SnapshotId } from "@hier/protocol-types";
import { captureJSON } from "./json-input.js";
import { QueryInput } from "./query-input.js";
import { GraphSessionError } from "./graph-types.js";
import type { GraphFragment, GraphSourceOptions, GraphNodeInput } from "./graph-types.js";

type Fields = Record<string, unknown>;
type Reader = QueryInput<"invalid_argument">;

function record(value: unknown, required: string[], optional: string[], reader: Reader): Fields {
  const fields = reader.record(value);
  if (
    required.some((key) => !Object.hasOwn(fields, key)) ||
    Object.keys(fields).some((key) => !required.includes(key) && !optional.includes(key))
  )
    reader.invalid("Graph record has missing or unknown fields");
  return fields;
}
function schema(
  name: Parameters<typeof validateDefinition>[0],
  value: unknown,
  reader: Reader,
): void {
  if (!validateDefinition(name, value)) reader.invalid(`Invalid ${name} in graph input`);
}
function key(value: unknown, reader: Reader): asserts value is string {
  if (typeof value !== "string" || !value.length || value.includes("\0"))
    reader.invalid("Graph keys must be nonempty strings without NUL");
}
function label(value: unknown, reader: Reader): void {
  if (typeof value !== "string") reader.invalid("Graph labels must be strings");
}
function array(value: unknown, reader: Reader): unknown[] {
  if (!Array.isArray(value)) reader.invalid("Graph members must be arrays");
  return value;
}
function readerFor(isDisposed: () => boolean): Reader {
  const reader = new QueryInput(GraphSessionError, "invalid_argument", "Graph session", isDisposed);
  reader.assertActive();
  return reader;
}
export function readGraphSource(input: unknown, isDisposed: () => boolean): GraphSourceOptions {
  const reader = readerFor(isDisposed);
  const owned = record(captureJSON(input, reader, "Graph"), ["origin", "label"], [], reader);
  label(owned.label, reader);
  if (!["design", "analysis", "plan"].includes(owned.origin as string))
    reader.invalid("Invalid graph source origin");
  return owned as unknown as GraphSourceOptions;
}
export function graphNodeKey(node: GraphNodeInput): string {
  return JSON.stringify(
    node.kind === "design" ? ["design", node.value.id] : ["external", node.key],
  );
}
export function readGraphFragment(
  input: unknown,
  options: GraphSourceOptions,
  snapshotId: SnapshotId,
  isDisposed: () => boolean,
): GraphFragment {
  const r: Reader = readerFor(isDisposed);
  // All caller reads finish before Schema or cross-member validation.
  const owned = record(
    captureJSON(input, r, "Graph"),
    ["snapshotId", "nodes", "edges", "completeness", "frontier", "hasConservative"],
    [],
    r,
  );
  schema("SnapshotId", owned.snapshotId, r);
  schema("Completeness", owned.completeness, r);
  for (const point of array(owned.frontier, r)) schema("TraceFrontier", point, r);
  if (typeof owned.hasConservative !== "boolean") r.invalid("hasConservative must be boolean");
  const nodes = new Map<string, Fields>();
  for (const value of array(owned.nodes, r)) {
    const n = r.record(value);
    if (n.kind === "design") {
      record(n, ["kind", "value"], [], r);
      schema("TraceNode", n.value, r);
    } else if (n.kind === "external" && options.origin !== "design") {
      record(n, ["kind", "key", "label", "ports"], ["target"], r);
      key(n.key, r);
      label(n.label, r);
      const ports = new Set<string>();
      for (const value of array(n.ports, r)) {
        const p = record(value, ["key", "label"], [], r);
        key(p.key, r);
        label(p.label, r);
        if (ports.has(p.key)) r.invalid("Duplicate graph port key");
        ports.add(p.key);
      }
      if (Object.hasOwn(n, "target")) {
        const target = record(n.target, ["ref"], ["bits", "side"], r);
        schema("ObjectRef", target.ref, r);
        if (Object.hasOwn(target, "bits")) {
          const bits = record(target.bits, ["lsb", "width"], [], r);
          schema("UInt", bits.lsb, r);
          schema("UInt", bits.width, r);
        }
        if (Object.hasOwn(target, "side")) schema("Side", target.side, r);
      }
    } else r.invalid("Invalid graph node kind for source");
    const id = graphNodeKey(n as unknown as GraphNodeInput);
    if (nodes.has(id)) r.invalid("Duplicate graph node identity");
    nodes.set(id, n);
  }
  const endpoint = (input: unknown): void => {
    const e = record(input, ["node"], ["port"], r);
    const n = r.record(e.node);
    if (n.kind === "design") {
      record(n, ["kind", "id"], [], r);
      schema("NodeId", n.id, r);
    } else if (n.kind === "external") {
      record(n, ["kind", "key"], [], r);
      key(n.key, r);
    } else r.invalid("Invalid graph endpoint kind");
    const node = nodes.get(JSON.stringify([n.kind, n.kind === "design" ? n.id : n.key]));
    if (!node) r.invalid("Graph endpoint missing from its own fragment");
    if (Object.hasOwn(e, "port")) {
      key(e.port, r);
      if (node.kind !== "external" || !(node.ports as Fields[]).some((p) => p.key === e.port))
        r.invalid("Unknown graph endpoint port");
    }
  };
  const edges = new Set<string>();
  for (const value of array(owned.edges, r)) {
    const e = r.record(value);
    let id: string;
    if (e.kind === "design") {
      record(e, ["kind", "value"], [], r);
      schema("TraceEdge", e.value, r);
      const wire = e.value as Fields;
      for (const id of [wire.from, wire.to])
        if (!nodes.has(JSON.stringify(["design", id])))
          r.invalid("Design edge endpoint missing from its own fragment");
      id = JSON.stringify(["design", wire.id]);
    } else if (e.kind === "external" && options.origin !== "design") {
      record(e, ["kind", "key", "label", "from", "to"], [], r);
      key(e.key, r);
      label(e.label, r);
      endpoint(e.from);
      endpoint(e.to);
      id = JSON.stringify(["external", e.key]);
    } else r.invalid("Invalid graph edge kind for source");
    if (edges.has(id)) r.invalid("Duplicate graph edge identity");
    edges.add(id);
  }
  if (owned.snapshotId !== snapshotId)
    throw new GraphSessionError("snapshot_mismatch", "Graph fragment belongs to another snapshot");
  return owned as unknown as GraphFragment;
}
