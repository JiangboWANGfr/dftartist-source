// 一个 DFT IP 节点（新视觉）：缩写彩盒 / 梯形 MUX + 正显文字（不随旋转）+ 悬停四边连接点起线。
// 几何走 ipgeom（rotation/mirror 生效）；wiring 时整盒身 = 收线靶（由父组件决定落哪个 in 口）。
import { useState } from "react";
import { Group, Line, Text, Circle } from "react-konva";
import type Konva from "konva";
import { catalogEntry } from "./catalog.ts";
import { ipStyle } from "./ipvisual.ts";
import { portGeom, ipBoxCorners, dftIpDispSize } from "./ipgeom.ts";
import type { Side } from "../genconn/layout.ts";
import type { DftIpInstance, DftEndpoint } from "../genconn/core/dft-model.ts";
import type { BusType } from "../genconn/layers.ts";

/** M/S 小标签相对锚点的摆位（按显示边，文字永远正显）。 */
const slotLabel = (side: Side): { dx: number; dy: number } =>
  side === "left" ? { dx: 7, dy: -4 } : side === "right" ? { dx: -14, dy: -4 } :
  side === "top" ? { dx: -3, dy: 7 } : { dx: -3, dy: -16 };

export function DftIpNode({ ip, pos, activeLayer, selected, wiring, dim, dropHover, onSelect, onMove, onDragMove, onOpenConfig, onPortDown, onSlotEnter, onSlotLeave, onBodyEnter, onBodyLeave, onContextMenu }: {
  ip: DftIpInstance; pos: { x: number; y: number }; activeLayer: BusType | null; selected: boolean; wiring: boolean;
  dim?: boolean;              // 非活动图层：变灰 + 不可交互
  dropHover: string | null;   // wiring 中本节点被磁吸为落点时 = 目标 in 口名，否则 null
  onSelect: (additive: boolean) => void;
  onMove: (p: { x: number; y: number }) => void;
  onDragMove: (p: { x: number; y: number }) => void;
  onOpenConfig: () => void;
  onPortDown: (ep: DftEndpoint, at: { x: number; y: number }) => void;
  onSlotEnter: (ep: DftEndpoint) => void;      // mux M/S 点悬停（收线磁吸）
  onSlotLeave: () => void;
  onBodyEnter: () => void;                     // wiring 时盒身悬停（父组件定落点）
  onBodyLeave: () => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}) {
  const r = ip.rotation ?? 0, m = ip.mirror ?? false;
  const st = ipStyle(ip.ipType);
  const { w, h } = dftIpDispSize(ip);
  const corners = ipBoxCorners(ip.ipType, r, m);
  const [hover, setHover] = useState(false);
  const isMux = ip.ipType === "Multiplexer";
  const ports = catalogEntry(ip.ipType).ports;
  const outPort = ip.ipType === "DesignInstance"
    ? ports.find((p) => p.dir === "out" && p.bus === activeLayer)
    : ports.find((p) => p.dir === "out" && p.role !== "clock");
  const title = ip.ipType === "DesignInstance" ? (ip.moduleName ?? "DesignInstance") : st.abbr;

  // A custom chain group is topology — which EDTs share a group is exactly what this canvas is
  // for — so it shows on the box, not only inside the config dialog. Default (own name) stays
  // silent to keep the common case clean.
  const chainTag = (() => {
    if (ip.ipType !== "Edt") return null;
    const conn = (ip.config as Record<string, unknown> | undefined)?.Connections;
    const g = conn && typeof conn === "object" && !Array.isArray(conn)
      ? (conn as Record<string, unknown>).ssh_chain_group : undefined;
    return typeof g === "string" && g.trim() && g.trim() !== ip.instanceName ? g.trim() : null;
  })();
  // With the tag present the box holds three lines, so the usual two move up to make room —
  // stacked, never overlapping (the 40px box has no slack for centered-plus-bottom layering).
  const titleY = chainTag ? 2 : h / 2 - 15;
  const nameY = chainTag ? 15 : h / 2 + 2;

  // 起线点：普通盒 = 悬停四边中点（都代表 out 口，落定后浮动）；MUX = 仅输出短边一个点；无 out 口(EDT) = 无起线点。
  const startDots: { x: number; y: number }[] = !outPort ? []
    : isMux
    ? [(() => { const g = portGeom(ip.ipType, outPort.name, r, m)!; return { x: g.x, y: g.y }; })()]
    : [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }];

  return (
    <Group x={pos.x} y={pos.y} draggable opacity={dim ? 0.25 : 1} listening={!dim}
      onClick={(e) => { e.cancelBubble = true; onSelect(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey); }}
      onDblClick={(e) => { e.cancelBubble = true; onOpenConfig(); }}
      onContextMenu={onContextMenu}
      onDragMove={(e) => onDragMove({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onMove({ x: Math.round(e.target.x() / 20) * 20, y: Math.round(e.target.y() / 20) * 20 })}
      onMouseEnter={() => { setHover(true); if (wiring) onBodyEnter(); }}
      onMouseLeave={() => { setHover(false); if (wiring) onBodyLeave(); }}
    >
      <Line points={corners.flatMap((p) => [p.x, p.y])} closed fill={st.fill}
        stroke={st.stroke} strokeWidth={selected || dropHover ? 3 : 2}
        shadowColor={st.stroke} shadowBlur={selected || dropHover ? 8 : 0} shadowOpacity={0.35} />
      {/* 文字永远正显：缩写/module 名 + 实例名，居中、超宽省略号 */}
      <Text x={4} y={titleY} width={w - 8} align="center" text={title}
        fontStyle="bold" fontSize={12} fill={st.text} wrap="none" ellipsis listening={false} />
      <Text x={4} y={nameY} width={w - 8} align="center" text={ip.instanceName}
        fontSize={9} fill={st.text} opacity={0.75} wrap="none" ellipsis listening={false} />
      {chainTag && (
        <Text x={4} y={h - 12} width={w - 8} align="center" text={`⛓ ${chainTag}`}
          fontSize={8} fill={st.stroke} wrap="none" ellipsis listening={false} />
      )}
      {/* 连线起点带：整条边框都能起线（仿 flow editor 从边缘拖拽），不必精准点小圆点；盒内部仍拖动=移动。 */}
      {!wiring && !dim && outPort && (
        <Line points={corners.flatMap((p) => [p.x, p.y])} closed stroke="transparent" strokeWidth={2}
          fillEnabled={false} hitStrokeWidth={14}
          onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "crosshair"; }}
          onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
          onMouseDown={(e) => {
            e.cancelBubble = true; // 阻止冒泡到 Group → 不触发移动/选中，改为起线
            onPortDown({ kind: "ip", ipId: ip.id, port: outPort.name }, { x: pos.x + w / 2, y: pos.y + h / 2 });
          }}
        />
      )}
      {/* MUX：M/S 常显收线点 + 正显小标签 */}
      {isMux && ports.filter((p) => p.role === "master" || p.role === "secondary").map((p) => {
        const g = portGeom(ip.ipType, p.name, r, m)!;
        const lb = slotLabel(g.side);
        const ep: DftEndpoint = { kind: "ip", ipId: ip.id, port: p.name };
        return (
          <Group key={p.name}>
            <Text x={g.x + lb.dx} y={g.y + lb.dy} text={p.role === "master" ? "M" : "S"}
              fontStyle="bold" fontSize={9} fill={st.text} listening={false} />
            <Circle x={g.x} y={g.y} radius={dropHover === p.name ? 6.5 : 4.5} fill={st.stroke} stroke="#fff" strokeWidth={1.5}
              hitStrokeWidth={wiring ? 16 : undefined}
              onMouseEnter={wiring ? () => onSlotEnter(ep) : undefined}
              onMouseLeave={wiring ? () => onSlotLeave() : undefined}
              onClick={(e) => { e.cancelBubble = true; }}
            />
          </Group>
        );
      })}
      {/* 悬停起线点（wiring 中不显示；MUX 只在输出短边）。四点都是同一个逻辑 out 口。 */}
      {hover && !wiring && outPort && startDots.map((d, i) => (
        <Circle key={i} x={d.x} y={d.y} radius={4} fill="#fff" stroke={st.stroke} strokeWidth={2}
          hitStrokeWidth={12}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            onPortDown({ kind: "ip", ipId: ip.id, port: outPort.name }, { x: pos.x + d.x, y: pos.y + d.y });
          }}
        />
      ))}
    </Group>
  );
}
