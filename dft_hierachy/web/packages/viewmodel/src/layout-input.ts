import { captureJSON } from "./json-input.js";
import { LayoutError } from "./layout-types.js";
import type { LayoutProjection, LayoutServiceOptions } from "./layout-types.js";
import type { GraphSessionState } from "./graph-types.js";

export function layoutCause(error: LayoutError, cause: unknown): LayoutError {
  Object.defineProperty(error, "cause", {
    value: cause,
    writable: true,
    configurable: true,
  });
  return error;
}
/** Every external operation rechecks lifecycle, including exceptional returns. */
export class LayoutInput {
  constructor(
    private readonly guard: () => void,
    private readonly code: "invalid_argument" | "invalid_result" = "invalid_argument",
  ) {}
  read<T>(operation: () => T): T {
    let value: T;
    try {
      value = operation();
    } catch (cause) {
      try {
        this.guard();
      } catch (error) {
        throw layoutCause(error as LayoutError, cause);
      }
      throw layoutCause(new LayoutError(this.code, "Layout input access failed"), cause);
    }
    this.guard();
    return value;
  }
  invalid(message: string): never {
    throw new LayoutError(this.code, message);
  }
  capture(value: unknown): unknown {
    return captureJSON(value, this, "Layout");
  }
  record(
    value: unknown,
    required?: readonly string[],
    optional: readonly string[] = [],
  ): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      this.invalid("Expected a layout record");
    const fields = value as Record<string, unknown>;
    if (
      required &&
      (required.some((key) => !Object.hasOwn(fields, key)) ||
        Object.keys(fields).some((key) => !required.includes(key) && !optional.includes(key)))
    )
      this.invalid("Layout record has missing or unknown fields");
    return fields;
  }
  array(value: unknown): unknown[] {
    if (!Array.isArray(value)) this.invalid("Expected a layout array");
    return value;
  }
  number(value: unknown, positive = false): number {
    if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0))
      this.invalid("Invalid layout size");
    return value;
  }
  key(value: unknown): string {
    if (typeof value !== "string" || !value.length) this.invalid("Invalid layout key");
    return value;
  }
}

export function readLayoutOptions(input: unknown, guard: () => void): LayoutServiceOptions {
  const r: LayoutInput = new LayoutInput(guard);
  guard();
  const isArray = r.read(() => Array.isArray(input));
  if (!input || typeof input !== "object" || isArray) r.invalid("Expected a layout options record");
  const fields = input as Record<string, unknown>;
  const proto = r.read(() => Object.getPrototypeOf(fields));
  if (proto !== Object.prototype && proto !== null) r.invalid("Expected plain layout options");
  const keys = r.read(() => Reflect.ownKeys(fields));
  const owned: Record<string, unknown> = {};
  for (const key of keys) {
    if (key !== "workerFactory" && key !== "timeoutMs") r.invalid("Unknown layout option");
    owned[key] = r.read(() => Reflect.get(fields, key));
  }
  if (
    typeof owned.workerFactory !== "function" ||
    typeof owned.timeoutMs !== "number" ||
    !Number.isInteger(owned.timeoutMs) ||
    owned.timeoutMs < 1 ||
    owned.timeoutMs > 2147483647
  )
    r.invalid("Layout requires a Worker factory and an integer timeoutMs in 1..2147483647");
  return Object.freeze(owned) as unknown as LayoutServiceOptions;
}

export function readLayoutProjection(
  input: unknown,
  graph: GraphSessionState,
  guard: () => void,
): LayoutProjection {
  const r: LayoutInput = new LayoutInput(guard);
  guard();
  const p = r.record(r.capture(input), [
    "sessionId",
    "graphRevision",
    "direction",
    "nodes",
    "edges",
  ]);
  if (
    typeof p.graphRevision !== "number" ||
    !Number.isSafeInteger(p.graphRevision) ||
    p.graphRevision < 0
  )
    r.invalid("Invalid graph revision");
  if (p.sessionId !== graph.sessionId || p.graphRevision !== graph.revision)
    throw new LayoutError(
      "stale_graph",
      "Layout input does not belong to the current graph revision",
    );
  if (!["RIGHT", "DOWN", "LEFT", "UP"].includes(p.direction as string))
    r.invalid("Invalid layout direction");
  const nodes = new Map<string, Set<string>>();
  const members = new Set(graph.nodes.map((n) => n.id as string));
  for (const item of r.array(p.nodes)) {
    const n = r.record(item, ["id", "width", "height", "ports"]);
    const id = r.key(n.id);
    if (!members.has(id) || nodes.has(id)) r.invalid("Unknown or duplicate layout node");
    r.number(n.width, true);
    r.number(n.height, true);
    const ports = new Set<string>();
    for (const item of r.array(n.ports)) {
      const port = r.record(item, ["key", "width", "height", "side"]);
      const key = r.key(port.key);
      if (ports.has(key)) r.invalid("Duplicate layout port");
      r.number(port.width);
      r.number(port.height);
      if (!["NORTH", "EAST", "SOUTH", "WEST"].includes(port.side as string))
        r.invalid("Invalid port side");
      ports.add(key);
    }
    nodes.set(id, ports);
  }
  if (nodes.size !== graph.nodes.length) r.invalid("Layout must include all graph nodes");
  const edges = new Map(graph.edges.map((e) => [e.id as string, e]));
  const seen = new Set<string>();
  for (const item of r.array(p.edges)) {
    const e = r.record(item, ["id"], ["fromPort", "toPort"]);
    const id = r.key(e.id),
      member = edges.get(id);
    if (!member || seen.has(id)) r.invalid("Unknown or duplicate layout edge");
    for (const [key, node] of [
      ["fromPort", member.from],
      ["toPort", member.to],
    ] as const) {
      if (Object.hasOwn(e, key) && !nodes.get(node)!.has(r.key(e[key])))
        r.invalid("Unknown layout endpoint port");
    }
    seen.add(id);
  }
  if (seen.size !== graph.edges.length) r.invalid("Layout must include all graph edges");
  guard();
  return p as unknown as LayoutProjection;
}
