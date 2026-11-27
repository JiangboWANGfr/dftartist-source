import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { GraphSessionState, GraphNodeId, GraphEdgeId } from "./graph-types.js";
import type {
  LayoutProjection,
  LayoutIdentity,
  LayoutResult,
  LayoutPoint,
  LayoutNodeInput,
  LayoutEdgeInput,
  LayoutNodeGeometry,
  LayoutEdgeGeometry,
} from "./layout-types.js";
import { LayoutInput } from "./layout-input.js";

const rootId = "layout-root";
const nodeId = (id: string) => JSON.stringify(["node", id]);
const portId = (id: string, key: string) => JSON.stringify(["port", id, key]);
const edgeId = (id: string) => JSON.stringify(["edge", id]);
/** Internal geometry boundary; public original IDs stay narrow at the service entry. */
export interface LayoutPrepared<
  NodeId extends string = GraphNodeId,
  EdgeId extends string = GraphEdgeId,
> {
  readonly projection: Omit<LayoutProjection, "nodes" | "edges"> & {
    readonly nodes: readonly (Omit<LayoutNodeInput, "id"> & { readonly id: NodeId })[];
    readonly edges: readonly (Omit<LayoutEdgeInput, "id"> & { readonly id: EdgeId })[];
  };
  readonly nodes: readonly NodeId[];
  readonly edges: readonly {
    readonly id: EdgeId;
    readonly from: NodeId;
    readonly to: NodeId;
  }[];
}
/** Owned expectations for one Worker attempt; never derived from its mutable message. */
export interface LayoutEncoding<NodeId extends string, EdgeId extends string> {
  readonly nodes: ReadonlyMap<NodeId, {
    readonly key: string;
    readonly input: Omit<LayoutNodeInput, "id"> & { readonly id: NodeId };
    readonly ports: ReadonlyMap<string, string> | undefined;
  }>;
  readonly edges: ReadonlyMap<EdgeId, {
    readonly key: string;
    readonly input: Omit<LayoutEdgeInput, "id"> & { readonly id: EdgeId };
  }>;
}
export function encodeLayout<NodeId extends string, EdgeId extends string>(
  input: LayoutPrepared<NodeId, EdgeId>,
): LayoutEncoding<NodeId, EdgeId> {
  return {
    nodes: new Map(input.projection.nodes.map((node) => [node.id, {
      key: nodeId(node.id),
      input: node,
      ports: node.ports.length
        ? new Map(node.ports.map((port) => [port.key, portId(node.id, port.key)]))
        : undefined,
    }])),
    edges: new Map(input.projection.edges.map((edge) => [edge.id, {
      key: edgeId(edge.id),
      input: edge,
    }])),
  };
}
function encodedEndpoint<NodeId extends string, EdgeId extends string>(
  encoding: LayoutEncoding<NodeId, EdgeId>, id: NodeId, port: string | undefined,
): string {
  const node = encoding.nodes.get(id)!;
  return port === undefined ? node.key : node.ports!.get(port)!;
}
export type GeometryResult<
  NodeId extends string,
  EdgeId extends string,
  Identity extends LayoutIdentity,
> = Identity &
  Omit<LayoutResult, "nodes" | "edges"> & {
    readonly nodes: readonly (Omit<LayoutNodeGeometry, "id"> & { readonly id: NodeId })[];
    readonly edges: readonly (Omit<LayoutEdgeGeometry, "id" | "from" | "to"> & {
      readonly id: EdgeId;
      readonly from: NodeId;
      readonly to: NodeId;
    })[];
  };
export function prepareLayout(
  projection: LayoutProjection,
  graph: GraphSessionState,
): LayoutPrepared {
  return {
    projection,
    nodes: graph.nodes.map((n) => n.id),
    edges: graph.edges.map(({ id, from, to }) => ({ id, from, to })),
  };
}
/** Build only a fresh mutable display graph; no semantic DTO reaches ELK. */
export function elkProjection<NodeId extends string, EdgeId extends string>(
  input: LayoutPrepared<NodeId, EdgeId>,
  encoding: LayoutEncoding<NodeId, EdgeId> = encodeLayout(input),
): ElkNode {
  return {
    id: rootId,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": input.projection.direction,
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: input.nodes.map((id) => {
      const encoded = encoding.nodes.get(id)!, n = encoded.input;
      return {
        id: encoded.key,
        width: n.width,
        height: n.height,
        layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
        ports: n.ports.map((p, index) => ({
          id: encoded.ports!.get(p.key)!,
          width: p.width,
          height: p.height,
          layoutOptions: {
            "elk.port.side": p.side,
            "elk.port.index": String(index),
          },
        })),
      };
    }),
    edges: input.edges.map((e) => {
      const encoded = encoding.edges.get(e.id)!, anchor = encoded.input;
      return {
        id: encoded.key,
        sources: [encodedEndpoint(encoding, e.from, anchor.fromPort)],
        targets: [encodedEndpoint(encoding, e.to, anchor.toPort)],
      };
    }),
  };
}
export function readLayoutResult<
  NodeId extends string,
  EdgeId extends string,
  Identity extends LayoutIdentity,
>(
  raw: unknown,
  input: LayoutPrepared<NodeId, EdgeId>,
  identity: Identity,
  guard: () => void,
  includePortSides = false,
  encoding?: LayoutEncoding<NodeId, EdgeId>,
): GeometryResult<NodeId, EdgeId, Identity> {
  const r: LayoutInput = new LayoutInput(guard, "invalid_result");
  const root = r.record(r.capture(raw));
  const coord = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value))
      r.invalid("Invalid layout coordinate");
    return value;
  };
  const point = (value: unknown): LayoutPoint => {
    const p = r.record(value);
    return Object.freeze({ x: coord(p.x), y: coord(p.y) });
  };
  const index = (value: unknown, expected: readonly string[]) => {
    const found = new Map<string, Record<string, unknown>>();
    const allowed = new Set(expected);
    for (const item of r.array(value)) {
      const fields = r.record(item),
        id = r.key(fields.id);
      if (!allowed.has(id) || found.has(id)) r.invalid("Layout result changed member identities");
      found.set(id, fields);
    }
    if (found.size !== expected.length) r.invalid("Incomplete layout result");
    return found;
  };
  const flat = (value: Record<string, unknown>, keys: readonly string[]) => {
    for (const key of keys)
      if (Object.hasOwn(value, key) && r.array(value[key]).length)
        r.invalid("Unexpected hierarchy in flat layout result");
  };
  if (root.id !== rootId) r.invalid("Unexpected layout root");
  flat(root, ["ports"]);
  const encoded = encoding ?? encodeLayout(input);
  const ns = index(root.children, input.nodes.map((id) => encoded.nodes.get(id)!.key));
  const es = index(
    root.edges,
    input.edges.map((e) => encoded.edges.get(e.id)!.key),
  );
  const nodes = input.nodes.map((id) => {
    const metadata = encoded.nodes.get(id)!, n = ns.get(metadata.key)!,
      original = metadata.input;
    flat(n, ["children", "edges"]);
    const ps = index(
      n.ports,
      original.ports.map((p) => metadata.ports!.get(p.key)!),
    );
    return Object.freeze({
      id,
      ...point(n),
      width: r.number(n.width, true),
      height: r.number(n.height, true),
      ports: Object.freeze(
        original.ports.map((p) => {
          const value = ps.get(metadata.ports!.get(p.key)!)!;
          flat(value, ["children", "edges", "ports"]);
          return Object.freeze({
            key: p.key,
            // Display-mode metadata comes from captured anchors, never Worker output.
            ...(includePortSides ? { side: p.side } : {}),
            ...point(value),
            width: r.number(value.width),
            height: r.number(value.height),
          });
        }),
      ),
    });
  });
  const edges = input.edges.map((member) => {
    const metadata = encoded.edges.get(member.id)!, e = es.get(metadata.key)!,
      anchor = metadata.input;
    const from = encodedEndpoint(encoded, member.from, anchor.fromPort);
    const to = encodedEndpoint(encoded, member.to, anchor.toPort);
    const sources = r.array(e.sources),
      targets = r.array(e.targets);
    if (
      sources.length !== 1 ||
      sources[0] !== from ||
      targets.length !== 1 ||
      targets[0] !== to ||
      (Object.hasOwn(e, "container") && e.container !== rootId)
    )
      r.invalid("Layout changed an edge endpoint");
    const sections = r.array(e.sections).map((value) => {
      const section = r.record(value);
      const bends = Object.hasOwn(section, "bendPoints")
        ? r.array(section.bendPoints).map(point)
        : [];
      return Object.freeze([point(section.startPoint), ...bends, point(section.endPoint)]);
    });
    if (!sections.length) r.invalid("Layout edge has no route");
    return Object.freeze({
      ...member,
      ...(anchor.fromPort === undefined ? {} : { fromPort: anchor.fromPort }),
      ...(anchor.toPort === undefined ? {} : { toPort: anchor.toPort }),
      sections: Object.freeze(sections),
    });
  });
  const result = Object.freeze({
    ...identity,
    direction: input.projection.direction,
    width: r.number(root.width),
    height: r.number(root.height),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
  guard();
  return result;
}
