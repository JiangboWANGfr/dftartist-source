import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { path } from "./projection.mjs";
import { start } from "./shell.mjs";
function createRenderer(host, pick) {
  const root = createRoot(host);
  function hit(item) {
    return {
      "data-hit": item.id,
      "data-label": item.label,
      "data-selected": String(item.selected),
      tabIndex: 0,
      role: "button",
      "aria-label": item.label,
      "aria-pressed": item.selected,
      onClick: () => pick(item.id),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(item.id);
        }
      },
    };
  }
  return {
    render(display) {
      flushSync(() =>
        root.render(
          <svg
            className="canvas"
            width="900"
            height="460"
            viewBox={`-20 -20 ${display.width} ${display.height}`}
            aria-label="Graph experiment"
          >
            {display.edges.map((e) => (
              <g key={e.id} {...hit(e)} className="edge">
                <path d={path(e.sections)} />
                <title>{e.label}</title>
              </g>
            ))}
            {display.nodes.map((n) => (
              <g key={n.id} {...hit(n)} className="node" transform={`translate(${n.x} ${n.y})`}>
                <rect width={n.width} height={n.height} rx="8" />
                <text x="12" y="36">
                  {n.label}
                </text>
                {n.ports.map((p) => (
                  <rect
                    key={p.key}
                    className="port"
                    data-port={p.key}
                    x={p.x}
                    y={p.y}
                    width={p.width}
                    height={p.height}
                  />
                ))}
              </g>
            ))}
          </svg>,
        ),
      );
    },
    dispose() {
      root.unmount();
    },
  };
}
start("React / SVG", createRenderer);
