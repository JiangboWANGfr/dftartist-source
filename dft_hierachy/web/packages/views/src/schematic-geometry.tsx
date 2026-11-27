import { memo } from "react";
import type { LayoutEdgeGeometry, LayoutNodeGeometry } from "@hier/viewmodel";

/** Immutable SVG geometry only; selection, annotations and event fences stay in the view. */
export const SchematicGeometry = memo(function SchematicGeometry(props: {
  node: Pick<LayoutNodeGeometry, "x" | "y" | "width" | "height" | "ports"> | undefined;
  edge: Pick<LayoutEdgeGeometry, "sections"> | undefined;
  label: string;
  marker: string;
}) {
  const { node, edge, label, marker } = props;
  return node ? (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className="hier-schematic-view__node"
    >
      <rect width={node.width} height={node.height} rx="4" />
      <text x="8" y="22">
        {label.length > 22 ? `${label.slice(0, 21)}…` : label}
      </text>
      {node.ports.map((port) => (
        <rect
          key={port.key}
          className="hier-schematic-view__port"
          x={port.x}
          y={port.y}
          width={port.width}
          height={port.height}
        />
      ))}
    </g>
  ) : edge ? (
    <g className="hier-schematic-view__edge">
      {edge.sections.map((section, i) => (
        <path
          key={i}
          d={section.map((point, j) => `${j ? "L" : "M"}${point.x},${point.y}`).join(" ")}
          markerEnd={`url(#${marker})`}
        />
      ))}
    </g>
  ) : null;
});
