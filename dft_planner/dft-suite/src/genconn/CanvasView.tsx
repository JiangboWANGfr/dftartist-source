// F3 — Konva 画布（只读渲染）：盒子 + 接口条 + 配对/未连接标记 + 平移/缩放/网格。

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Stage, Layer, Rect, Text, Line, Group, Circle, Label, Tag } from "react-konva";
import type Konva from "konva";
import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import type { BusInterface, BusWire, HardenLibrary } from "./core/model.ts";
import { computeLayout, barAnchor, defOutline, selfBars, outlineLocate, labelCorner, pointInPolygon, BUS_COLOR, hexTint, mapPoint, defResizeDims, busTypeLabel, triPoints, type BoxView, type BarView } from "./layout.ts";
import { canvasColors, type CanvasColors } from "./theme.ts";
import { orthAppend, orthFinish, bindWire, selfCrossings, notchDepth } from "./wire.ts";
import { layerStateOf, type BusType } from "./layers.ts";
import { ContextMenu, type MenuItem } from "./ContextMenu.tsx";
import { HIER_DND_MIME } from "./HierarchyPanel.tsx";
import { dataSourceChannels, isPrimaryDataSource, DS_LABEL, type DsChannel } from "./dataSource.ts";

const BAR_LEN = 28; // 接口条沿边长度
const BAR_THICK = 10; // 接口条向盒内的厚度
const DS_PIN = 6; // DS 三角脚长
const DS_PIN_HALF = 4; // DS 三角半宽
const NEST_LEN = 14;
const NEST_THICK = 5;
const NEST_DEPTH = 2; // 子块内部最多再嵌套渲染几层（只读预览）
const GRID = 20; // 网格 & 盒子拖动吸附步长
const gsnap = (v: number): number => Math.round(v / GRID) * GRID;

type Side = "top" | "bottom" | "left" | "right";

/** 接口条相对"边上锚点"的矩形（始终在盒子内侧）+ 其中心点。 */
function barGeom(side: Side, len: number, thick: number) {
  let r: { x: number; y: number; w: number; h: number };
  switch (side) {
    case "left": r = { x: 0, y: -len / 2, w: thick, h: len }; break;
    case "right": r = { x: -thick, y: -len / 2, w: thick, h: len }; break;
    case "top": r = { x: -len / 2, y: 0, w: len, h: thick }; break;
    default: r = { x: -len / 2, y: -thick, w: len, h: thick };
  }
  return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

/** DS 条引脚几何（相对条锚点）：盒内方向、条 1/4·3/4 两端根点、盒内极点（=连线锚点）。Bar 渲染与 wire 端点绑定共用。 */
function dsBarPins(side: Side, dsFlip: boolean | undefined) {
  const g = barGeom(side, BAR_LEN, BAR_THICK);
  const vert = side === "left" || side === "right";
  const d = side === "left" ? { dx: 1, dy: 0 } : side === "right" ? { dx: -1, dy: 0 } : side === "top" ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 };
  const axis: "h" | "v" = vert ? "h" : "v";
  const face = vert ? (side === "left" ? g.x + g.w : g.x) : (side === "top" ? g.y + g.h : g.y);
  const end0 = vert ? { x: face, y: g.y + g.h * 0.25 } : { x: g.x + g.w * 0.25, y: face };
  const end1 = vert ? { x: face, y: g.y + g.h * 0.75 } : { x: g.x + g.w * 0.75, y: face };
  const [outR, inR] = dsFlip ? [end1, end0] : [end0, end1]; // 翻转 → 交换进/出脚
  const ext = (p: { x: number; y: number }) => ({ x: p.x + d.dx * DS_PIN, y: p.y + d.dy * DS_PIN });
  return { d, axis, outR, inR, outExt: ext(outR), inExt: ext(inR) };
}

/** 内部 DS 卡各通道引脚锚点（相对盒原点）+ 进入轴。几何常量与 InstanceNode 的卡渲染一致（改一处要同步另一处）。 */
function dsCardPinLocals(i: BusInterface, channels: DsChannel[], posOverride?: { x: number; y: number }): { axis: "h" | "v"; pins: { ifId: string; pd?: string; out: { x: number; y: number }; in: { x: number; y: number } }[] } {
  const side = i.edge?.side ?? (i.role === "client" ? "left" : "right");
  const COLW = 44, PADX = 9, H = 48;
  const nCol = Math.max(channels.length, 1);
  const W = Math.max(72, nCol * COLW + 2 * PADX);
  const pinTop = side === "top";
  const lr = side === "left" || side === "right";
  const pos = posOverride ?? i.innerPos ?? { x: 40, y: 40 };
  const toOuter = (lx: number, ly: number) =>
    side === "left" ? { x: H - ly, y: lx }
    : side === "right" ? { x: ly, y: W - lx }
    : { x: lx, y: ly };
  const eyTip = pinTop ? 0 : H;
  const pins = channels.map((ch, k) => {
    const cx = PADX + k * COLW + COLW / 2;
    const outX = cx + (i.dsFlip ? 6 : -6), inX = cx + (i.dsFlip ? -6 : 6);
    const o = toOuter(outX, eyTip), n = toOuter(inX, eyTip);
    return { ifId: ch.ifId, pd: ch.pd, out: { x: pos.x + o.x, y: pos.y + o.y }, in: { x: pos.x + n.x, y: pos.y + n.y } };
  });
  return { axis: lr ? "h" : "v", pins };
}


type DsAnchors = Map<string, { out: { x: number; y: number }; in: { x: number; y: number } }>;

/** 全画布 DS 引脚锚点（open def 坐标，key=`${instId}|${ifId}|${pd??""}`）。live 给了则叠加实例/条/卡拖动的实时覆盖。 */
function computeDsAnchors(
  boxes: BoxView[],
  defs: HardenLibrary["defs"],
  activeLayer: BusType | null,
  hiddenLayers: Set<BusType>,
  live: {
    inst: { anchorId: string; dx: number; dy: number; group: boolean } | null;
    bar: { instId: string; ifId: string; x: number; y: number; side: Side } | null;
    card: { instId: string; ifId: string; x: number; y: number } | null;
    selectedIds: string[];
  } | null,
): DsAnchors {
  const map: DsAnchors = new Map();
  const defById = new Map(defs.map((d) => [d.id, d]));
  const liveOff = (b: BoxView) => {
    const g = live?.inst;
    if (!g) return { x: 0, y: 0 };
    if (g.anchorId === b.instanceId || (g.group && live!.selectedIds.includes(b.instanceId))) return { x: g.dx, y: g.dy };
    return { x: 0, y: 0 };
  };
  for (const b of boxes) {
    const bdef = defById.get(b.hardenId);
    if (!bdef) continue;
    const off = liveOff(b);
    for (const bar of b.bars) {  // pin DS 条（bars 的 side/t 已含旋转换算，几何同 Bar 渲染）
      if (!bar.isDataSource) continue;
      const lb = live?.bar && live.bar.instId === b.instanceId && live.bar.ifId === bar.interfaceId ? live.bar : null;
      const a = lb ? { x: lb.x, y: lb.y } : barAnchor(b, bar);
      const p = dsBarPins(lb?.side ?? bar.side, bar.dsFlip);
      map.set(`${b.instanceId}|${bar.interfaceId}|`, {
        out: { x: b.x + off.x + a.x + p.outExt.x, y: b.y + off.y + a.y + p.outExt.y },
        in: { x: b.x + off.x + a.x + p.inExt.x, y: b.y + off.y + a.y + p.inExt.y },
      });
    }
    for (const i of bdef.interfaces) {  // 内部 DS 卡（primary 渲染，通道按可见图层过滤，与卡渲染列位一致）
      if (!(i.placement === "other" && i.isDataSource && isPrimaryDataSource(i, bdef))) continue;
      const channels = dataSourceChannels(i, bdef).filter((ch) => layerStateOf(ch.busType, activeLayer, hiddenLayers) !== "hidden");
      const lc = live?.card && live.card.instId === b.instanceId && live.card.ifId === i.id ? { x: live.card.x, y: live.card.y } : undefined;
      for (const p of dsCardPinLocals(i, channels, lc).pins) {
        map.set(`${b.instanceId}|${p.ifId}|${p.pd ?? ""}`, {
          out: { x: b.x + off.x + p.out.x, y: b.y + off.y + p.out.y },
          in: { x: b.x + off.x + p.in.x, y: b.y + off.y + p.in.y },
        });
      }
    }
  }
  return map;
}

/**
 * 每条 wire 的显示折线与换脚集：换脚判定用「已提交」锚点（拖动中稳定），端点绑定用「实时」锚点。
 * 正常/换脚二选一：换脚后自交更少才换（引线打叉自动理顺）。
 */
function computeWireBinding(wires: BusWire[], committed: DsAnchors, liveA: DsAnchors): { bound: Map<string, { x: number; y: number }[]>; flip: Map<string, Set<string>> } {
  const bound = new Map<string, { x: number; y: number }[]>();
  const flip = new Map<string, Set<string>>();
  const of = (m: DsAnchors, instId?: string, ifId?: string, pd?: string) =>
    instId && ifId ? (m.get(`${instId}|${ifId}|${pd ?? ""}`) ?? m.get(`${instId}|${ifId}|`)) : undefined;
  for (const w of wires) {
    const srcC = of(committed, w.sourceInstanceId, w.sourceInterfaceId, w.pd);
    const dstC = of(committed, w.inInstanceId, w.inInterfaceId, w.pd);
    let swap = false;
    if (srcC && dstC) {
      const normal = bindWire(w.points, srcC.out, dstC.in);
      const swapped = bindWire(w.points, srcC.in, dstC.out);
      swap = selfCrossings(swapped) < selfCrossings(normal);
      if (swap) {
        const mark = (instId: string, ifId: string) => (flip.get(instId) ?? flip.set(instId, new Set<string>()).get(instId)!).add(ifId);
        mark(w.sourceInstanceId, w.sourceInterfaceId);
        if (w.inInstanceId && w.inInterfaceId) mark(w.inInstanceId, w.inInterfaceId);
      }
    }
    const srcL = of(liveA, w.sourceInstanceId, w.sourceInterfaceId, w.pd);
    const dstL = of(liveA, w.inInstanceId, w.inInterfaceId, w.pd);
    bound.set(w.id, bindWire(w.points, (swap ? srcL?.in : srcL?.out) ?? null, (swap ? dstL?.out : dstL?.in) ?? null));
  }
  return { bound, flip };
}

/** 接口标识文字相对锚点的摆放（朝盒内）。 */
function labelPos(side: Side): { x: number; y: number; w: number; align: "left" | "right" | "center" } {
  switch (side) {
    case "left": return { x: BAR_THICK + 4, y: -6, w: 90, align: "left" };
    case "right": return { x: -BAR_THICK - 4 - 90, y: -6, w: 90, align: "right" };
    case "top": return { x: -45, y: BAR_THICK + 3, w: 90, align: "center" };
    default: return { x: -45, y: -BAR_THICK - 15, w: 90, align: "center" };
  }
}

function Bar({
  box,
  bar,
  selected,
  ported,
  colors,
  onClick,
  onReposition,
  onContextMenu,
  wiring,
  onPinDown,
  onPinHover,
  onToggleFlip,
  autoFlip,
  onDragLiveAnchor,
  dim,
}: {
  box: BoxView;
  bar: BarView;
  selected: boolean;
  ported: boolean; // 该接口已被提升（子接口端点 或 边界提升目标）→ 显示标记
  colors: CanvasColors;
  onClick: (additive: boolean) => void; // additive = 按住 ctrl/⌘（多选提升用）
  onReposition: (side: Side, value: number, isPerimeter: boolean) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  wiring?: boolean; // 全局是否处于画线态（wire 非空）
  onPinDown?: (role: "out" | "in", at: { x: number; y: number }, axis: "h" | "v") => void; // 引脚按下 → begin/commit（at = open def 坐标；axis=末段进入方向）
  onPinHover?: (snap: { x: number; y: number; axis: "h" | "v" } | null) => void; // 画线态悬停 in 脚 → 预览磁吸
  onToggleFlip?: (next: boolean) => void; // data source 双击翻转进/出脚
  autoFlip?: boolean; // 引线打叉自动换脚（纯视图，▶/◀ 位置与 wire 绑定同步互换）
  onDragLiveAnchor?: (p: { x: number; y: number; side: Side } | null) => void; // DS 条拖动实时锚点（wire 端点实时跟随）
  dim?: boolean; // 非活动图层：变灰 + 不可交互
}) {
  const a = barAnchor(box, bar); // 边上锚点（相对盒子原点）
  const color = BUS_COLOR[bar.busType];
  const [liveSide, setLiveSide] = useState<Side | null>(null); // 拖动中按当前所在边实时定向
  const [hover, setHover] = useState(false); // 悬停 → 浮出完整标签
  const effSide = liveSide ?? bar.side;
  const g = barGeom(effSide, BAR_LEN, BAR_THICK);
  const fill = bar.paired ? color : colors.boxFill;
  const strokeColor = bar.unconnected ? colors.warn : color;
  const lbl0 = labelPos(effSide);
  // DS 条：标签沿盒内方向多让出三角长度，避免压 ▶/◀
  const lbl = !bar.isDataSource ? lbl0
    : effSide === "left" ? { ...lbl0, x: lbl0.x + DS_PIN }
    : effSide === "right" ? { ...lbl0, x: lbl0.x - DS_PIN }
    : effSide === "top" ? { ...lbl0, y: lbl0.y + DS_PIN }
    : { ...lbl0, y: lbl0.y - DS_PIN };
  const poly = box.vertices && box.vertices.length >= 3 ? box.vertices : null;
  const stop = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    onClick(e.evt.ctrlKey || e.evt.metaKey);
  };
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  // 投影本地点到边界：多边形→沿整条外轮廓；矩形→最近的一条边。返回点 + 朝向 + 归一化参数。
  const project = (lx: number, ly: number): { side: Side; x: number; y: number; value: number } => {
    if (poly) {
      const l = outlineLocate(poly, lx, ly);
      return { side: l.side, x: l.x, y: l.y, value: l.t };
    }
    const dl = Math.abs(lx), dr = Math.abs(box.w - lx), dt = Math.abs(ly), db = Math.abs(box.h - ly);
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { side: "left", x: 0, y: clamp(ly, box.h), value: clamp(ly, box.h) / box.h };
    if (m === dr) return { side: "right", x: box.w, y: clamp(ly, box.h), value: clamp(ly, box.h) / box.h };
    if (m === dt) return { side: "top", x: clamp(lx, box.w), y: 0, value: clamp(lx, box.w) / box.w };
    return { side: "bottom", x: clamp(lx, box.w), y: box.h, value: clamp(lx, box.w) / box.w };
  };
  const dragBound = function (this: Konva.Node, pos: { x: number; y: number }) {
    const parent = this.getParent();
    if (!parent) return pos;
    const at = parent.getAbsoluteTransform();
    const local = at.copy().invert().point(pos);
    const p = project(local.x, local.y);
    return at.point({ x: p.x, y: p.y });
  };
  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const side = project(e.target.x(), e.target.y()).side;
    setLiveSide(side); // 实时朝向（a.x/a.y 不变 → 不打断拖动）
    if (bar.isDataSource) onDragLiveAnchor?.({ x: e.target.x(), y: e.target.y(), side }); // wire 端点实时跟随
  };
  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const p = project(e.target.x(), e.target.y());
    setLiveSide(null);
    onDragLiveAnchor?.(null);
    onReposition(p.side, p.value, !!poly);
  };
  return (
    <Group x={a.x} y={a.y} opacity={dim ? 0.25 : 1} listening={!dim} draggable dragBoundFunc={dragBound} onClick={stop} onTap={() => onClick(false)} onDblClick={bar.isDataSource ? (e) => { e.cancelBubble = true; onToggleFlip?.(!bar.dsFlip); } : undefined} onDragMove={onDragMove} onDragEnd={onDragEnd} onContextMenu={onContextMenu} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {selected && <Rect x={g.x - 3} y={g.y - 3} width={g.w + 6} height={g.h + 6} stroke={colors.accent} strokeWidth={2} dash={[3, 2]} />}
      <Rect x={g.x} y={g.y} width={g.w} height={g.h} fill={fill} stroke={strokeColor} strokeWidth={2} />
      {/* 已提升标记：橙色虚线外框 + 小橙点 */}
      {ported && <Rect x={g.x - 2} y={g.y - 2} width={g.w + 4} height={g.h + 4} stroke={colors.ported} strokeWidth={1.5} dash={[3, 2]} listening={false} />}
      {bar.paired && <Circle x={g.cx} y={g.cy} radius={4} fill={colors.pair} />}
      {bar.unconnected && <Circle x={g.cx} y={g.cy} radius={4} fill={colors.warn} />}
      {ported && !bar.paired && !bar.unconnected && <Circle x={g.cx} y={g.cy} radius={3} fill={colors.ported} />}
      {/* data source 标记：条外侧一个小 ◆（纯视图，不影响生成） */}
      {bar.isDataSource && <Text x={g.x} y={g.y - 10} text="◆" fontSize={9} fill={color} listening={false} />}
      {/* 默认单行省略；选中/悬停时浮出完整名字 */}
      <Text x={lbl.x} y={lbl.y} width={lbl.w} align={lbl.align} text={bar.label} fontSize={10} fill={colors.textDim} wrap="none" ellipsis listening={false} />
      {(selected || hover) && (
        <Label x={g.cx} y={g.y - 16} listening={false}>
          <Tag fill={colors.tooltipBg} cornerRadius={3} opacity={0.95} />
          <Text text={bar.label} fontSize={10} fill={colors.tooltipText} padding={3} />
        </Label>
      )}
      {/* data source 引脚：▶out(绿,起线)/◀in(蓝,收线) 三角在条 1/4·3/4 处、贴条的盒内侧面（连线在盒内，语义同内部 DS 卡）。 */}
      {bar.isDataSource && onPinDown && (() => {
        const { d, axis, outR, inR, outExt, inExt } = dsBarPins(effSide, autoFlip ? !bar.dsFlip : bar.dsFlip);
        const world = (l: { x: number; y: number }) => ({ x: box.x + a.x + l.x, y: box.y + a.y + l.y });
        return (
          <>
            <Line points={triPoints(outR, d, true, DS_PIN, DS_PIN_HALF)} closed fill={colors.pair} hitStrokeWidth={4}
              onMouseDown={(e) => { e.cancelBubble = true; if (!wiring) onPinDown("out", world(outExt), axis); }}
              onClick={(e) => { e.cancelBubble = true; }} />
            <Line points={triPoints(inR, d, false, DS_PIN, DS_PIN_HALF)} closed fill={colors.accent} hitStrokeWidth={4}
              onMouseDown={(e) => { e.cancelBubble = true; if (wiring) onPinDown("in", world(inExt), axis); }}
              onMouseEnter={() => { if (wiring) onPinHover?.({ ...world(inExt), axis }); }}
              onMouseLeave={() => onPinHover?.(null)}
              onClick={(e) => { e.cancelBubble = true; }} />
          </>
        );
      })()}
    </Group>
  );
}

/** 子块内部的只读嵌套预览（递归、限深）。坐标即子 def 的 footprint 空间。 */
function NestedPreview({ def, lib, depth, colors }: { def: HardenLibrary["defs"][number]; lib: HardenLibrary; depth: number; colors: CanvasColors }) {
  if (depth <= 0) return null;
  const boxes = computeLayout(def, lib);
  return (
    <Group listening={false}>
      {boxes.map((b) => {
        const childDef = lib.defs.find((d) => d.id === b.hardenId);
        const ntStroke = childDef?.color ?? colors.boxStroke;
        const ntFill = childDef?.color ? hexTint(childDef.color) : colors.boxFill;
        return (
          <Group key={b.instanceId} x={b.x} y={b.y}>
            {b.vertices ? (
              <Line points={b.vertices.flatMap((p) => [p.x, p.y])} closed fill={ntFill} stroke={ntStroke} strokeWidth={1} />
            ) : (
              <Rect width={b.w} height={b.h} fill={ntFill} stroke={ntStroke} strokeWidth={1} />
            )}
            {b.bars.map((bar) => {
              const a = barAnchor(b, bar);
              const color = BUS_COLOR[bar.busType];
              const g = barGeom(bar.side, NEST_LEN, NEST_THICK);
              return (
                <Group key={bar.interfaceId} x={a.x} y={a.y}>
                  <Rect x={g.x} y={g.y} width={g.w} height={g.h} fill={bar.paired ? color : colors.boxFill} stroke={bar.unconnected ? colors.warn : color} strokeWidth={1.5} />
                  {bar.paired && <Circle x={g.cx} y={g.cy} radius={2.5} fill={colors.pair} />}
                </Group>
              );
            })}
            {childDef && !childDef.hideChildren && <NestedPreview def={childDef} lib={lib} depth={depth - 1} colors={colors} />}
          </Group>
        );
      })}
    </Group>
  );
}

/** 一个实例 = 一个可拖动的 Group（盒子 + 接口条都用相对坐标）。 */
function InstanceNode({
  box,
  lib,
  colors,
  selected,
  selectedIfId,
  multiSel,
  liveBox,
  liveOffset,
  onMove,
  onDragStart,
  onDragLive,
  onSelect,
  onDrill,
  onBarClick,
  onMoveBar,
  onSetInnerPos,
  onContextMenu,
  portedIfIds,
  onBarContextMenu,
  wiring,
  onWirePin,
  onPinHover,
  onToggleFlip,
  autoFlipIfs,
  onBarDragLive,
  onCardDragLive,
  activeLayer,
  hiddenLayers,
}: {
  box: BoxView;
  lib: HardenLibrary;
  colors: CanvasColors;
  selected: boolean;
  selectedIfId: string | null; // 该实例上被选中的接口 id（高亮）
  multiSel: Set<string>; // 该实例上 ctrl 多选待提升的接口 id（高亮）
  liveBox: { x: number; y: number; w: number; h: number } | null; // resize 进行中的实时盒
  liveOffset: { x: number; y: number } | null; // 多选一起拖时，非锚点盒子的实时偏移
  onMove: (pos: { x: number; y: number }, dx: number, dy: number) => void;
  onDragStart: () => void;
  onDragLive: (dx: number, dy: number) => void;
  onSelect: (additive: boolean) => void;
  onDrill: () => void;
  onBarClick: (ifId: string, role: BarView["role"], additive: boolean) => void;
  onMoveBar: (ifId: string, side: Side, value: number, isPerimeter: boolean) => void;
  onSetInnerPos: (ifId: string, pos: { x: number; y: number }) => void; // placement=other 盒内节点拖动落位
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  portedIfIds: Set<string>; // 该实例上"已提升"的接口 id（子接口端点 或 边界提升目标）→ 显示标记
  onBarContextMenu: (ifId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  wiring: boolean; // 全局是否处于画线态
  onWirePin: (instId: string, ifId: string, role: "out" | "in", at: { x: number; y: number }, pd?: string, axis?: "h" | "v") => void;
  onPinHover: (snap: { x: number; y: number; axis: "h" | "v" } | null) => void; // 画线态悬停 in 脚 → 预览磁吸
  onToggleFlip: (ifId: string, next: boolean) => void; // data source 双击翻转进/出脚
  autoFlipIfs?: Set<string>; // 本实例上引线打叉需换脚的 DS 接口（纯视图）
  onBarDragLive: (ifId: string, p: { x: number; y: number; side: Side } | null) => void; // DS 条拖动实时锚点
  onCardDragLive: (ifId: string, p: { x: number; y: number } | null) => void; // 内部 DS 卡拖动实时位置
  activeLayer: BusType | null; // 总线图层：活动层
  hiddenLayers: Set<BusType>; // 总线图层：隐藏集
}) {
  const def = lib.defs.find((x) => x.id === box.hardenId);
  // 自定义颜色：未选中→边框=本色、填充=浅色版；选中仍用蓝框（不被颜色淹没）。无 color→维持默认配色。
  const stroke = selected ? colors.accent : (def?.color ?? colors.boxStroke);
  const fillColor = def?.color ? hexTint(def.color) : colors.boxFill;
  const strokeWidth = selected ? 3 : 2;
  // resize 用 liveBox（位置+尺寸）；多选一起拖时非锚点盒用 liveOffset
  const vbox: BoxView = liveBox
    ? { ...box, x: liveBox.x, y: liveBox.y, w: liveBox.w, h: liveBox.h }
    : liveOffset
    ? { ...box, x: box.x + liveOffset.x, y: box.y + liveOffset.y }
    : box;
  // 拖动中把盒子位置实时吸附到网格（在开层坐标里取整）
  const gridBound = function (this: Konva.Node, p: { x: number; y: number }) {
    const layer = this.getParent();
    if (!layer) return p;
    const at = layer.getAbsoluteTransform();
    const local = at.copy().invert().point(p);
    return at.point({ x: gsnap(local.x), y: gsnap(local.y) });
  };
  const scaledVerts =
    box.vertices && (vbox.w !== box.w || vbox.h !== box.h)
      ? box.vertices.map((p) => ({ x: (p.x * vbox.w) / (box.w || 1), y: (p.y * vbox.h) / (box.h || 1) }))
      : box.vertices;
  return (
    <Group
      x={vbox.x}
      y={vbox.y}
      draggable
      dragBoundFunc={gridBound}
      onClick={(e) => onSelect(e.evt.shiftKey)}
      onTap={() => onSelect(false)}
      onContextMenu={onContextMenu}
      onDblClick={onDrill}
      onDblTap={onDrill}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragLive(e.target.x() - box.x, e.target.y() - box.y)}
      onDragEnd={(e) => {
        const nx = e.target.x();
        const ny = e.target.y();
        onMove({ x: Math.round(nx), y: Math.round(ny) }, nx - box.x, ny - box.y);
      }}
    >
      {scaledVerts ? (
        <Line points={scaledVerts.flatMap((p) => [p.x, p.y])} closed fill={fillColor} stroke={stroke} strokeWidth={strokeWidth} />
      ) : (
        <Rect width={vbox.w} height={vbox.h} fill={fillColor} stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {/* 名称放在多边形内部的角（避免落在凹口空白）；矩形用左上角 */}
      {(() => {
        const c = box.vertices ? labelCorner(box.vertices) : { x: 0, y: 0 };
        return (
          <>
            <Text x={c.x + 6} y={c.y + 6} text={box.instanceName} fontStyle="bold" fontSize={13} fill={colors.textStrong} />
            <Text x={c.x + 6} y={c.y + 22} text={`: ${box.designName}`} fontSize={11} fill={colors.textDim} />
          </>
        );
      })()}

      {/* 内部子块只读嵌套预览：形状随实例朝向整体旋转/镜像（def 局部 → 显示坐标） */}
      {(() => {
        const d = def;
        if (!d || d.childInstances.length === 0) return null;
        // 隐藏下层：画成黑盒——不画内部预览/子块名，只在右下角放一个最小 ⊞ 角标（提示内部已折叠、可下钻）
        if (d.hideChildren) {
          return <Text x={vbox.w - 15} y={vbox.h - 16} text="⊞" fontSize={13} fill={colors.textFaint} listening={false} />;
        }
        // 由显示尺寸反推 def 未变换尺寸，再用 mapPoint 把 def 原点定位到显示坐标。
        const { w: w0, h: h0 } = defResizeDims(box.rotation, box.w, box.h);
        const o = mapPoint(0, 0, box.rotation, box.mirror, w0, h0);
        // 直接子块标签：画在显示坐标系（不进旋转组）→ 天然正向，落在各子块变换后的左上角。
        const labels = computeLayout(d, lib).map((pb) => {
          const corners = [
            mapPoint(pb.x, pb.y, box.rotation, box.mirror, w0, h0),
            mapPoint(pb.x + pb.w, pb.y, box.rotation, box.mirror, w0, h0),
            mapPoint(pb.x + pb.w, pb.y + pb.h, box.rotation, box.mirror, w0, h0),
            mapPoint(pb.x, pb.y + pb.h, box.rotation, box.mirror, w0, h0),
          ];
          return { id: pb.instanceId, name: pb.instanceName, x: Math.min(...corners.map((c) => c.x)), y: Math.min(...corners.map((c) => c.y)) };
        });
        return (
          <>
            <Group x={o.x} y={o.y} rotation={box.rotation} scaleX={box.mirror ? -1 : 1} listening={false}>
              <NestedPreview def={d} lib={lib} depth={NEST_DEPTH} colors={colors} />
            </Group>
            {labels.map((l) => (
              <Text key={l.id} x={l.x + 4} y={l.y + 3} text={l.name} fontSize={10} fill={colors.textFaint} listening={false} />
            ))}
          </>
        );
      })()}

      {vbox.bars
        .filter((bar) => layerStateOf(bar.busType, activeLayer, hiddenLayers) !== "hidden") // pin DS 同普通接口走 Bar（多一对三角引脚）；图层隐藏 → 不画
        .map((bar) => (
          <Bar
            key={bar.interfaceId}
            box={vbox}
            bar={bar}
            colors={colors}
            selected={selectedIfId === bar.interfaceId || multiSel.has(bar.interfaceId)}
            ported={portedIfIds.has(bar.interfaceId)}
            onClick={(additive) => onBarClick(bar.interfaceId, bar.role, additive)}
            onReposition={(side, value, isPerimeter) => onMoveBar(bar.interfaceId, side, value, isPerimeter)}
            onContextMenu={(e) => onBarContextMenu(bar.interfaceId, e)}
            wiring={wiring}
            onPinDown={(role, at, axis) => onWirePin(vbox.instanceId, bar.interfaceId, role, at, undefined, axis)}
            onPinHover={onPinHover}
            autoFlip={autoFlipIfs?.has(bar.interfaceId) ?? false}
            onDragLiveAnchor={(p) => onBarDragLive(bar.interfaceId, p)}
            onToggleFlip={(next) => onToggleFlip(bar.interfaceId, next)}
            dim={layerStateOf(bar.busType, activeLayer, hiddenLayers) === "dim"} // 非活动层 → 变灰+锁
          />
        ))}

      {/* placement=other 内部 data source：specgen 三角芯片卡片，每通道一行 ▶out/◀in。组成员只由 primary 渲染。pin DS 走上面的 Bar。 */}
      {(def?.interfaces ?? [])
        .filter((i) => i.placement === "other" && (!i.isDataSource || isPrimaryDataSource(i, def!)))  // 内部：primary DS + 非 DS(JTAG1838)
        .map((i) => {
          const color = BUS_COLOR[i.busType];
          const allChannels = i.isDataSource ? dataSourceChannels(i, def!) : [];
          const channels = allChannels.filter((ch) => layerStateOf(ch.busType, activeLayer, hiddenLayers) !== "hidden");
          const cardHidden = i.isDataSource
            ? (allChannels.length > 0 && channels.length === 0)
            : layerStateOf(i.busType, activeLayer, hiddenLayers) === "hidden";
          if (cardHidden) return null;
          const otherDim = i.isDataSource
            ? (channels.length > 0 && channels.every((ch) => layerStateOf(ch.busType, activeLayer, hiddenLayers) === "dim"))
            : layerStateOf(i.busType, activeLayer, hiddenLayers) === "dim";
          // 朝向 = 接口所在边（与 Inspector 一致：缺省 client→左/secondary→右）。上/下=列布局；左/右=整卡旋转 ±90°。
          const side = i.edge?.side ?? (i.role === "client" ? "left" : "right");
          const COLW = 44, PADX = 9, H = 48, PIN = 6, HALF = 4;
          const nCol = Math.max(channels.length, 1);
          const W = Math.max(72, nCol * COLW + 2 * PADX);
          const pinTop = side === "top";
          const lr = side === "left" || side === "right";
          const fw = lr ? H : W, fh = lr ? W : H;        // 旋转后 footprint
          const pos = i.innerPos ?? { x: 40, y: 40 };
          const inner = side === "left" ? { x: H, y: 0, rotation: 90 }
            : side === "right" ? { x: 0, y: W, rotation: -90 }
            : { x: 0, y: 0, rotation: 0 };
          const toOuter = (lx: number, ly: number) =>
            side === "left" ? { x: H - ly, y: lx }
            : side === "right" ? { x: ly, y: W - lx }
            : { x: lx, y: ly };
          const pinWorld = (lx: number, ly: number) => { const o = toOuter(lx, ly); return { x: vbox.x + pos.x + o.x, y: vbox.y + pos.y + o.y }; };
          const dragBound = function (this: Konva.Node, p: { x: number; y: number }) {
            const parent = this.getParent();
            if (!parent) return p;
            const at = parent.getAbsoluteTransform();
            const local = at.copy().invert().point(p);
            const cx = Math.max(0, Math.min(vbox.w - fw, local.x));
            const cy = Math.max(0, Math.min(vbox.h - fh, local.y));
            return at.point({ x: cx, y: cy });
          };
          const onCardDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
            e.cancelBubble = true;
            if (i.isDataSource) onCardDragLive(i.id, null);
            onSetInnerPos(i.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
          };
          return (
            <Group
              key={i.id}
              x={pos.x}
              y={pos.y}
              opacity={otherDim ? 0.25 : 1}
              listening={!otherDim}
              draggable
              dragBoundFunc={dragBound}
              onDragStart={(e) => { e.cancelBubble = true; }}
              onDragMove={(e) => { e.cancelBubble = true; if (i.isDataSource) onCardDragLive(i.id, { x: e.target.x(), y: e.target.y() }); }}
              onDragEnd={onCardDragEnd}
              onMouseDown={(e) => { e.cancelBubble = true; }}
              onClick={(e) => { e.cancelBubble = true; onBarClick(i.id, i.role, e.evt.ctrlKey || e.evt.metaKey); }}
              onDblClick={i.isDataSource ? (e) => { e.cancelBubble = true; onToggleFlip(i.id, !i.dsFlip); } : undefined}
            >
              <Group x={inner.x} y={inner.y} rotation={inner.rotation}>
                <Rect x={0} y={0} width={W} height={H} fill={hexTint(color, 0.88)} stroke={color} strokeWidth={1.5} cornerRadius={6} />
                <Text x={6} y={pinTop ? H - 15 : 3} width={W - 12} text={i.busType === "JTAG1838" ? busTypeLabel(i.busType, i.role) : DS_LABEL[i.busType]} fontSize={10} fontStyle="bold" fill={color} wrap="none" ellipsis listening={false} />
                {channels.map((ch, k) => {
                  const cx = PADX + k * COLW + COLW / 2;
                  const eyTip = pinTop ? 0 : H;                 // 边界（out/in 锚点都在这，连线好接）
                  const outRootY = pinTop ? PIN : H - PIN;
                  const dOut = { dx: 0, dy: pinTop ? -1 : 1 };  // out 尖朝外（离开）
                  const dIn = { dx: 0, dy: pinTop ? 1 : -1 };   // in 尖朝内（接收）——与 out 相反
                  const chFlip = autoFlipIfs?.has(ch.ifId) ? !i.dsFlip : i.dsFlip; // 引线打叉自动换脚（纯视图）
                  const outX = cx + (chFlip ? 6 : -6), inX = cx + (chFlip ? -6 : 6);  // out/in 并排、dsFlip 交换
                  const chDim = layerStateOf(ch.busType, activeLayer, hiddenLayers) === "dim";
                  return (
                    <Group key={ch.key} opacity={chDim ? 0.35 : 1} listening={!chDim}>
                      <Text x={cx - COLW / 2} y={pinTop ? H - 25 : 25} width={COLW} align="center" text={ch.label} fontSize={9} fill={ch.color} wrap="none" ellipsis listening={false} />
                      <Line points={triPoints({ x: outX, y: outRootY }, dOut, true, PIN, HALF)} closed fill={colors.pair} hitStrokeWidth={4}
                        onMouseDown={(e) => { e.cancelBubble = true; if (!wiring) onWirePin(vbox.instanceId, ch.ifId, "out", pinWorld(outX, eyTip), ch.pd); }}
                        onClick={(e) => { e.cancelBubble = true; }} />
                      <Line points={triPoints({ x: inX, y: eyTip }, dIn, true, PIN, HALF)} closed fill={colors.accent} hitStrokeWidth={4}
                        onMouseDown={(e) => { e.cancelBubble = true; if (wiring) onWirePin(vbox.instanceId, ch.ifId, "in", pinWorld(inX, eyTip), undefined, lr ? "h" : "v"); }}
                        onMouseEnter={() => { if (wiring) onPinHover({ ...pinWorld(inX, eyTip), axis: lr ? "h" : "v" }); }}
                        onMouseLeave={() => onPinHover(null)}
                        onClick={(e) => { e.cancelBubble = true; }} />
                    </Group>
                  );
                })}
              </Group>
            </Group>
          );
        })}
    </Group>
  );
}

/** 已提交 wire 折线（可点选/右键删）。独立订阅拖动瞬态：拖动中只有本组件重算端点绑定（D13/D15），实例树不动。 */
function CommittedWires({ wires, boxes, defs, activeLayer, hiddenLayers, colors, selWireId, selectedIds, onSelect, onMenu }: {
  wires: BusWire[];
  boxes: BoxView[];
  defs: HardenLibrary["defs"];
  activeLayer: BusType | null;
  hiddenLayers: Set<BusType>;
  colors: CanvasColors;
  selWireId: string | null;
  selectedIds: string[];
  onSelect: (wireId: string) => void;
  onMenu: (wireId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
}) {
  const inst = useStore((s) => s.dragInstLive);
  const bar = useStore((s) => s.dragBarLive);
  const card = useStore((s) => s.dragCardLive);
  const committed = computeDsAnchors(boxes, defs, activeLayer, hiddenLayers, null);
  const liveA = inst || bar || card ? computeDsAnchors(boxes, defs, activeLayer, hiddenLayers, { inst, bar, card, selectedIds }) : committed;
  const { bound } = computeWireBinding(wires, committed, liveA);
  return (
    <>
      {wires
        .filter((w) => layerStateOf(w.busType, activeLayer, hiddenLayers) !== "hidden") // 图层隐藏 → 不画
        .map((w) => {
          const sel = selWireId === w.id;
          const dim = layerStateOf(w.busType, activeLayer, hiddenLayers) === "dim"; // 非活动层 → 变灰+不可点
          const pts = bound.get(w.id) ?? w.points; // 端点绑定：两端吸到 DS ▶/◀ 当前锚点（含拖动实时/换脚），中间拐点不动
          return (
            <Line
              key={w.id}
              points={pts.flatMap((p) => [p.x, p.y])}
              stroke={sel ? colors.accent : BUS_COLOR[w.busType]}
              strokeWidth={sel ? 3 : 1.5}
              opacity={dim ? 0.25 : 1}
              hitStrokeWidth={10}
              listening={!dim}
              onClick={(e) => { e.cancelBubble = true; onSelect(w.id); }}
              onContextMenu={(e) => onMenu(w.id, e)}
            />
          );
        })}
    </>
  );
}

/** 四角 resize 手柄（开层坐标，独立于盒子 Group，避免拖动时自移；网格吸附；实时预览经 onLive）。 */
function ResizeHandles({
  box,
  live,
  scale,
  pos,
  colors,
  onLive,
  onCommit,
}: {
  box: BoxView; // 已提交盒（对角锚点取自它，拖动期间稳定）
  live: { x: number; y: number; w: number; h: number } | null;
  scale: number;
  pos: { x: number; y: number };
  colors: CanvasColors;
  onLive: (b: { x: number; y: number; w: number; h: number }) => void;
  onCommit: (b: { x: number; y: number; w: number; h: number }) => void;
}) {
  const eff = live ?? { x: box.x, y: box.y, w: box.w, h: box.h }; // 手柄位置取实时盒
  const corners: { id: string; x: number; y: number; ax: number; ay: number }[] = [
    { id: "tl", x: eff.x, y: eff.y, ax: box.x + box.w, ay: box.y + box.h },
    { id: "tr", x: eff.x + eff.w, y: eff.y, ax: box.x, ay: box.y + box.h },
    { id: "bl", x: eff.x, y: eff.y + eff.h, ax: box.x + box.w, ay: box.y },
    { id: "br", x: eff.x + eff.w, y: eff.y + eff.h, ax: box.x, ay: box.y },
  ];
  const boxFrom = (gx: number, gy: number, ax: number, ay: number) => {
    const x = Math.min(gx, ax);
    const y = Math.min(gy, ay);
    return { x, y, w: Math.abs(gx - ax), h: Math.abs(gy - ay) };
  };
  // 把"角点"（节点位置，含 offset）吸附到网格——而非手柄左上角
  const dragBound = (p: { x: number; y: number }) => ({
    x: gsnap((p.x - pos.x) / scale) * scale + pos.x,
    y: gsnap((p.y - pos.y) / scale) * scale + pos.y,
  });
  const HS = 5 / scale;
  return (
    <Group>
      {corners.map((c) => (
        <Rect
          key={c.id}
          x={c.x}
          y={c.y}
          offsetX={HS}
          offsetY={HS}
          width={HS * 2}
          height={HS * 2}
          fill={colors.accent}
          draggable
          dragBoundFunc={dragBound}
          onDragMove={(e) => {
            e.cancelBubble = true;
            onLive(boxFrom(e.target.x(), e.target.y(), c.ax, c.ay));
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            onCommit(boxFrom(e.target.x(), e.target.y(), c.ax, c.ay));
          }}
        />
      ))}
    </Group>
  );
}

/** 下钻视图的外轮廓 + 当前 def 自身的边界接口（仅显示，不可交互）。 */
/** 下钻视图的外轮廓（虚线，只读）。边界接口条单独用可拖的 Bar 画（见 CanvasView）。 */
function Frame({ outline, colors }: { outline: { w: number; h: number; vertices?: { x: number; y: number }[] }; colors: CanvasColors }) {
  return (
    <Group listening={false}>
      {outline.vertices ? (
        <Line points={outline.vertices.flatMap((p) => [p.x, p.y])} closed stroke={colors.frame} strokeWidth={2} dash={[8, 6]} />
      ) : (
        <Rect width={outline.w} height={outline.h} stroke={colors.frame} strokeWidth={2} dash={[8, 6]} />
      )}
    </Group>
  );
}

export function CanvasView() {
  const doc = useStore((s) => s.doc);
  const moveInstance = useStore((s) => s.moveInstance);
  const selection = useStore((s) => s.selection);
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const selectInstance = useStore((s) => s.selectInstance);
  const selectInstances = useStore((s) => s.selectInstances);
  const moveSelectedBy = useStore((s) => s.moveSelectedBy);
  const setViewCenter = useStore((s) => s.setViewCenter);
  const selectInterface = useStore((s) => s.selectInterface);
  const drillInto = useStore((s) => s.drillInto);
  const resizeBox = useStore((s) => s.resizeBox);
  const setInterfaceEdge = useStore((s) => s.setInterfaceEdge);
  const setInterfacePerimeter = useStore((s) => s.setInterfacePerimeter);
  const setInterfaceInnerPos = useStore((s) => s.setInterfaceInnerPos);
  const updateInterface = useStore((s) => s.updateInterface);
  const reparentInstance = useStore((s) => s.reparentInstance);
  const dropHierarchyNode = useStore((s) => s.dropHierarchyNode);
  const polyDraw = useStore((s) => s.polyDraw);
  const setPolyDraw = useStore((s) => s.setPolyDraw);
  const addPolygonHarden = useStore((s) => s.addPolygonHarden);
  const navStack = useStore((s) => s.navStack);
  const clipboard = useStore((s) => s.clipboard);
  const rotateSelected = useStore((s) => s.rotateSelected);
  const mirrorSelected = useStore((s) => s.mirrorSelected);
  const copySelection = useStore((s) => s.copySelection);
  const cut = useStore((s) => s.cut);
  const paste = useStore((s) => s.paste);
  const duplicate = useStore((s) => s.duplicate);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const toggleDefChildren = useStore((s) => s.toggleDefChildren);
  const portInterface = useStore((s) => s.portInterface);
  const unportInterface = useStore((s) => s.unportInterface);
  const removeInterface = useStore((s) => s.removeInterface);
  const wire = useStore((s) => s.wire);
  const beginWire = useStore((s) => s.beginWire);
  const wirePoint = useStore((s) => s.wirePoint);
  const wireUndoPoint = useStore((s) => s.wireUndoPoint);
  const commitWire = useStore((s) => s.commitWire);
  const cancelWire = useStore((s) => s.cancelWire);
  const removeWire = useStore((s) => s.removeWire);
  const hideWires = useStore((s) => s.hideWires);
  const activeLayer = useStore((s) => s.activeLayer);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  // 画布 chrome 颜色随主题切换重算（Konva 读不了 CSS 变量 → 主题变化时重读 :root）。
  const theme = useDesign((s) => s.theme);
  const colors = useMemo(() => canvasColors(), [theme]);
  const openDef = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  const boxes = openDef ? computeLayout(openDef, doc.library) : [];
  const outline = openDef ? defOutline(openDef) : { w: 800, h: 560 };
  const selfInterfaceBars = openDef ? selfBars(openDef) : [];


  // 提升映射：open def 的边界接口若带 portedFrom → 记下"被提升的子接口端点"。
  //  portedChildIf: key=`${instId}/${ifId}` → 对应的边界接口 id（用于"取消提升"与子块条标记）。
  const portedChildIf = new Map<string, string>();
  for (const bi of openDef?.interfaces ?? []) {
    if (bi.portedFrom) portedChildIf.set(`${bi.portedFrom.instanceId}/${bi.portedFrom.interfaceId}`, bi.id);
  }
  const portedIfIdsByInst = (instId: string): Set<string> => {
    const s = new Set<string>();
    for (const key of portedChildIf.keys()) {
      const [i, f] = key.split("/");
      if (i === instId) s.add(f);
    }
    return s;
  };

  // 兄弟上下文：下钻时，把父层里"除当前实例外"的兄弟块按相对偏移淡显出来
  const siblingBoxes = (() => {
    if (navStack.length < 2) return [];
    const top = navStack[navStack.length - 1];
    const parent = doc.library.defs.find((d) => d.id === navStack[navStack.length - 2].defId);
    if (!top.instId || !parent) return [];
    const focus = parent.childInstances.find((i) => i.id === top.instId);
    if (!focus) return [];
    const fx = focus.position?.x ?? 0;
    const fy = focus.position?.y ?? 0;
    return computeLayout(parent, doc.library)
      .filter((b) => b.instanceId !== top.instId)
      .map((b) => ({ ...b, x: b.x - fx, y: b.y - fy }));
  })();

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }); // 初 0 → 首帧被 fit 的 <2 守卫挡掉，只在真实尺寸时 fit 一次（与原逻辑一致，避免用错尺寸算 pos）
  const setCanvasView = useStore((s) => s.setCanvasView);
  const [scale, setScale] = useState(() => useStore.getState().canvasView.scale); // 初值取自 store → 切 tab 重挂后恢复上次缩放
  const [pos, setPos] = useState(() => useStore.getState().canvasView.pos);

  // resize 进行中的实时盒（针对某个实例）
  const [rsz, setRsz] = useState<{ instId: string; x: number; y: number; w: number; h: number } | null>(null);
  // 多选一起拖：锚点 + 实时位移（非锚点盒据此实时跟随）。拖动实时状态另走 store 瞬态（dragInstLive 等,只有 CommittedWires 订阅）。
  const [groupDrag, setGroupDrag] = useState<{ anchorId: string; dx: number; dy: number; group: boolean } | null>(null);
  const setDragInstLive = useStore((st) => st.setDragInstLive);
  const setDragBarLive = useStore((st) => st.setDragBarLive);
  const setDragCardLive = useStore((st) => st.setDragCardLive);
  const [moving, setMoving] = useState(false); // 盒子正在被拖动 → 暂隐 resize 手柄（避免分离）
  // 右键上下文菜单：屏幕坐标 + 目标实例 id（null = 空画布，仅粘贴）
  const [menu, setMenu] = useState<{ x: number; y: number; instId: string | null } | null>(null);
  // 接口条右键菜单：提升 / 取消提升
  const [barMenu, setBarMenu] = useState<{ x: number; y: number; instId: string; ifId: string } | null>(null);
  // 已提交 wire 右键菜单：屏幕坐标 + wireId
  const [wireMenu, setWireMenu] = useState<{ x: number; y: number; wireId: string } | null>(null);
  // ctrl 多选的接口：key=`${instId}/${ifId}`（store 瞬态；右键批量提升/删除、Delete 键批量删除共用）
  const portSel = useStore((s) => s.portSel);
  const setPortSel = useStore((s) => s.setPortSel);
  const deletePortSel = useStore((s) => s.deletePortSel);
  const multiSelByInst = (instId: string): Set<string> => {
    const s = new Set<string>();
    for (const k of portSel) { const i = k.indexOf("/"); if (k.slice(0, i) === instId) s.add(k.slice(i + 1)); }
    return s;
  };
  // 切换层 → 清空多选（接口 id 只在当前层有意义）
  useEffect(() => { setPortSel(new Set()); }, [doc.ui.openDefId]);

  // 引线打叉自动换脚（已提交几何判定；▶/◀ 渲染据此互换,与 CommittedWires 的绑定接法一致）
  const autoFlipIfs = (() => {
    if (!openDef?.wires?.length) return new Map<string, Set<string>>();
    const a = computeDsAnchors(boxes, doc.library.defs, activeLayer, hiddenLayers, null);
    return computeWireBinding(openDef.wires, a, a).flip;
  })();

  // 右键拖动平移 / 左键空白处框选（取代原 Stage 左键拖平移）
  const panMovedRef = useRef(false); // 刚右键拖动过 → 抑制这次右键菜单（保留"点一下"弹菜单）
  const marqueeMovedRef = useRef(false); // 刚框选过 → 抑制这次 onClick 取消选中
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragMode, setDragMode] = useState<"pan" | "marquee" | null>(null);

  // 画多边形：草稿角点 + 光标（画布坐标）
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [snapIn, setSnapIn] = useState<{ x: number; y: number; axis: "h" | "v" } | null>(null); // 画线态悬停 in 脚 → 预览磁吸到对齐路径
  // 画线对齐辅助线（纯视图）：X/Y 对齐（绿）、凹口深度（洋红）、进入/出去高度（青）
  const [guides, setGuides] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null });
  const [notchGuide, setNotchGuide] = useState<{ kind: "v" | "h"; at: number; box: BoxView } | null>(null);
  const [heightGuides, setHeightGuides] = useState<{ kind: "v" | "h"; at: number; box: BoxView }[]>([]);
  const toCanvas = (pt: { x: number; y: number }) => ({ x: (pt.x - pos.x) / scale, y: (pt.y - pos.y) / scale });
  const ortho = (last: { x: number; y: number } | undefined, cur: { x: number; y: number }) => {
    if (!last) return { x: gsnap(cur.x), y: gsnap(cur.y) };
    return Math.abs(cur.x - last.x) >= Math.abs(cur.y - last.y) ? { x: gsnap(cur.x), y: last.y } : { x: last.x, y: gsnap(cur.y) };
  };
  // 画线对齐：基点吸到网格，再就近吸附到已有折线点的 X/Y（同水平/同竖直），返回吸附点 + 参考线坐标。
  const snapWire = (c: { x: number; y: number }): { x: number; y: number; gx: number | null; gy: number | null } => {
    const TOL = 6 / scale;
    const xs: number[] = [], ys: number[] = [];
    if (wire) for (const p of wire.points) { xs.push(p.x); ys.push(p.y); }
    for (const w of openDef?.wires ?? []) for (const p of w.points) { xs.push(p.x); ys.push(p.y); }
    let x = gsnap(c.x), y = gsnap(c.y), gx: number | null = null, gy: number | null = null, bx = TOL, by = TOL;
    for (const tx of xs) { const d = Math.abs(c.x - tx); if (d < bx) { bx = d; x = tx; gx = tx; } }
    for (const ty of ys) { const d = Math.abs(c.y - ty); if (d < by) { by = d; y = ty; gy = ty; } }
    return { x, y, gx, gy };
  };
  const insideBox = (b: BoxView, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  // 同 def 其他实例最早画的那个凹口（深度 + 进入边 + 进入/出去位置），作为参考
  const refNotch = (defId: string, exceptInstId: string): { depth: number; side: Side; entryPos: number; exitPos: number } | null => {
    if (!wire) return null;
    let best: ReturnType<typeof notchDepth> = null;
    for (const b of boxes) {
      if (b.hardenId !== defId || b.instanceId === exceptInstId) continue;
      const nd = notchDepth(b, wire.points);
      if (nd && (!best || nd.entryIndex < best.entryIndex)) best = nd;
    }
    return best ? { depth: best.depth, side: best.side as Side, entryPos: best.entryPos, exitPos: best.exitPos } : null;
  };
  // 画线吸附：X/Y 对齐 →（进盒时）凹口深度对齐 → 同 def 待画盒显示 进入+出去 目标位置并吸附。均纯视图。
  const snapDraw = (c: { x: number; y: number }): { x: number; y: number; gx: number | null; gy: number | null; notch: { kind: "v" | "h"; at: number; box: BoxView } | null; heights: { kind: "v" | "h"; at: number; box: BoxView }[] } => {
    const s = snapWire(c);
    let x = s.x, y = s.y;
    let notch: { kind: "v" | "h"; at: number; box: BoxView } | null = null;
    const heights: { kind: "v" | "h"; at: number; box: BoxView }[] = [];
    const TOL = 6 / scale;
    const L = wire?.points[wire.points.length - 1];
    if (wire && L) {
      // 深度：正在进盒（cursor 在盒内、L 在盒外）→ 垂直进入边的凹口深度对齐
      const B = boxes.find((b) => insideBox(b, { x, y }));
      if (B && !insideBox(B, L)) {
        const ref = refNotch(B.hardenId, B.instanceId);
        if (ref) {
          const horiz = Math.abs(x - L.x) >= Math.abs(y - L.y);
          if (horiz) { const at = L.x <= B.x ? B.x + ref.depth : B.x + B.w - ref.depth; x = at; notch = { kind: "v", at, box: B }; }
          else { const at = L.y <= B.y ? B.y + ref.depth : B.y + B.h - ref.depth; y = at; notch = { kind: "h", at, box: B }; }
        }
      }
      // 高度/进入位置：同 def 盒有参考凹口、但它自己的凹口**还没画完（未出去）** → 显示 进入 + 出去 两条目标线（横跨画布），吸附到最近一条
      for (const b of boxes) {
        if (notchDepth(b, wire.points)?.complete) continue; // 该盒凹口已画完（已出去）才停止提示；正在画时保留（含出去线）
        const ref = refNotch(b.hardenId, b.instanceId);
        if (!ref) continue;
        if (ref.side === "left" || ref.side === "right") {
          heights.push({ kind: "h", at: b.y + ref.entryPos * b.h, box: b }, { kind: "h", at: b.y + ref.exitPos * b.h, box: b });
        } else {
          heights.push({ kind: "v", at: b.x + ref.entryPos * b.w, box: b }, { kind: "v", at: b.x + ref.exitPos * b.w, box: b });
        }
      }
      let bestD = TOL, snapKind: "v" | "h" | null = null, snapAt = 0;
      for (const g of heights) { const d = Math.abs((g.kind === "h" ? y : x) - g.at); if (d < bestD) { bestD = d; snapKind = g.kind; snapAt = g.at; } }
      if (snapKind === "h") y = snapAt; else if (snapKind === "v") x = snapAt;
    }
    const vSnapped = notch?.kind === "v" || heights.some((g) => g.kind === "v" && g.at === x);
    const hSnapped = notch?.kind === "h" || heights.some((g) => g.kind === "h" && g.at === y);
    return { x, y, gx: vSnapped ? null : s.gx, gy: hSnapped ? null : s.gy, notch, heights };
  };
  const finalize = (pts: { x: number; y: number }[]) => {
    if (pts.length >= 3) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      let closed = pts;
      if (last.x !== first.x && last.y !== first.y) {
        const corner = prev && prev.y === last.y ? { x: last.x, y: first.y } : { x: first.x, y: last.y };
        closed = [...pts, corner];
      }
      addPolygonHarden(closed); // store action 会退出画图模式
    } else {
      setPolyDraw(false);
    }
    setDraft([]);
    setCursor(null);
  };

  useEffect(() => {
    if (!polyDraw) {
      setDraft([]);
      setCursor(null);
    }
  }, [polyDraw]);

  // 画图模式键盘：Enter 完成、Esc 取消
  useEffect(() => {
    if (!polyDraw) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finalize(draft);
      } else if (e.key === "Escape") {
        setPolyDraw(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyDraw, draft, scale, pos]);

  // 画线模式键盘：Esc 取消整条；Backspace(⌫) 或 Cmd/Ctrl+Z 退一个拐点（保持画线态）
  useEffect(() => {
    if (!wire) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelWire();
      else if (e.key === "Backspace" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z")) { e.preventDefault(); wireUndoPoint(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wire, cancelWire, wireUndoPoint]);

  // 退出画线态 → 清掉预览光标（避免残留一段虚线）
  useEffect(() => { if (!wire) { setCursor(null); setSnapIn(null); } }, [wire]);

  // 下钻/换层/改窗口 → 自动缩放使当前层外轮廓铺满视口（手动缩放在此之间保留）。
  const openDefId = doc.ui.openDefId;
  useEffect(() => {
    if (!openDef || size.w < 2 || size.h < 2) return;
    if (useStore.getState().canvasView.fittedDefId === openDefId) return; // 已 fit 过这层（含切 tab 卸载后重挂）→ 用 store 保留的缩放，不重置
    const o = defOutline(openDef);
    // 留余量（0.72）使下钻时四周的兄弟块能露出来
    const sc = Math.min(2, Math.max(0.1, 0.72 * Math.min(size.w / o.w, size.h / o.h)));
    const np = { x: (size.w - o.w * sc) / 2, y: (size.h - o.h * sc) / 2 };
    setScale(sc);
    setPos(np);
    setCanvasView({ fittedDefId: openDefId, scale: sc, pos: np });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDefId, size.w, size.h]);

  // 手动缩放/平移（wheel/pan）持久化到 store，跨工作区卸载/重挂保留
  useEffect(() => { setCanvasView({ scale, pos }); }, [scale, pos, setCanvasView]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // ≥1: a collapsed container gave Konva a 0×0 canvas, and drawing one throws (see safeCanvas).
    const ro = new ResizeObserver(() =>
      setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // 视口中心（画布坐标）→ 新 harden 落在这里
  useEffect(() => {
    setViewCenter({ x: (size.w / 2 - pos.x) / scale, y: (size.h / 2 - pos.y) / scale });
  }, [pos.x, pos.y, scale, size.w, size.h, setViewCenter]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const old = scale;
    const mouseTo = { x: (pointer.x - pos.x) / old, y: (pointer.y - pos.y) / old };
    const next = Math.min(4, Math.max(0.2, e.evt.deltaY > 0 ? old / 1.08 : old * 1.08));
    setScale(next);
    setPos({ x: pointer.x - mouseTo.x * next, y: pointer.y - mouseTo.y * next });
  };

  // 右键拖动 = 平移；左键在空白处拖动 = 框选。都走 window 监听（拖出画布也不中断）。
  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (polyDraw) return;
    const stage = e.target.getStage();
    if (e.evt.button === 2) {
      // 右键平移：记起点 client 坐标 + 当前 pos，移动按 delta 更新 pos
      panMovedRef.current = false;
      setDragMode("pan");
      const sx = e.evt.clientX, sy = e.evt.clientY, px = pos.x, py = pos.y;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 3 && !panMovedRef.current) {
          panMovedRef.current = true;
          setMenu(null); // macOS 上 contextmenu 在 mousedown 就触发、菜单已弹 → 拖动一开始就关掉它
          setBarMenu(null);
        }
        setPos({ x: px + dx, y: py + dy });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setDragMode(null);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    } else if (e.evt.button === 0 && e.target === stage && !wire) {
      // 左键空白处：框选（画线态不框选，留给 onClick 加拐点）。client→画布坐标（用 stage 容器 rect）。
      const rect = stage?.container().getBoundingClientRect();
      const toCv = (ev: MouseEvent) => ({ x: (ev.clientX - (rect?.left ?? 0) - pos.x) / scale, y: (ev.clientY - (rect?.top ?? 0) - pos.y) / scale });
      const start = toCv(e.evt);
      marqueeMovedRef.current = false;
      setDragMode("marquee");
      setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
      const onMove = (ev: MouseEvent) => {
        const c = toCv(ev);
        if (Math.abs(c.x - start.x) + Math.abs(c.y - start.y) > 2 / scale) marqueeMovedRef.current = true;
        setMarquee({ x0: start.x, y0: start.y, x1: c.x, y1: c.y });
      };
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setDragMode(null);
        if (marqueeMovedRef.current) {
          const c = toCv(ev);
          const rx1 = Math.min(start.x, c.x), rx2 = Math.max(start.x, c.x), ry1 = Math.min(start.y, c.y), ry2 = Math.max(start.y, c.y);
          const ids = boxes.filter((b) => !(b.x > rx2 || b.x + b.w < rx1 || b.y > ry2 || b.y + b.h < ry1)).map((b) => b.instanceId);
          selectInstances(ids);
        }
        setMarquee(null);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
  };

  // 网格：按当前视口动态铺满（平移/缩放后始终覆盖可见区域），线宽随缩放保持 1px。
  const gridLines: ReactElement[] = [];
  const G = GRID;
  if (G * scale >= 5) {
    const gx0 = Math.floor(-pos.x / scale / G) * G - G;
    const gy0 = Math.floor(-pos.y / scale / G) * G - G;
    const gx1 = Math.ceil((size.w - pos.x) / scale / G) * G + G;
    const gy1 = Math.ceil((size.h - pos.y) / scale / G) * G + G;
    for (let x = gx0; x <= gx1; x += G) gridLines.push(<Line key={`v${x}`} points={[x, gy0, x, gy1]} stroke={colors.grid} strokeWidth={1 / scale} />);
    for (let y = gy0; y <= gy1; y += G) gridLines.push(<Line key={`h${y}`} points={[gx0, y, gx1, y]} stroke={colors.grid} strokeWidth={1 / scale} />);
  }

  return (
    <div
      ref={wrapRef}
      className="canvas"
      id="gc-canvas"
      data-canvas-scale={scale}
      style={dragMode === "pan" ? { cursor: "grabbing" } : dragMode === "marquee" ? { cursor: "crosshair" } : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(HIER_DND_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
      }}
      onDrop={(e) => {
        const instId = e.dataTransfer.getData(HIER_DND_MIME);
        if (!instId || !wrapRef.current) return;
        e.preventDefault();
        const rect = wrapRef.current.getBoundingClientRect();
        const at = {
          x: gsnap((e.clientX - rect.left - pos.x) / scale),
          y: gsnap((e.clientY - rect.top - pos.y) / scale),
        };
        dropHierarchyNode(instId, at);
      }}
    >
      <Stage
        width={size.w}
        height={size.h}
        scaleX={scale}
        scaleY={scale}
        x={pos.x}
        y={pos.y}
        draggable={false}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={(e) => {
          if (!polyDraw && !wire) return;
          const pt = e.target.getStage()?.getPointerPosition();
          if (!pt) return;
          const c = toCanvas(pt);
          // 画线态：吸附（网格 + X/Y 对齐 + 凹口/高度）后设光标 + 参考线；多边形态直接用原始光标
          if (wire) { const s = snapDraw(c); setCursor({ x: s.x, y: s.y }); setGuides({ gx: s.gx, gy: s.gy }); setNotchGuide(s.notch); setHeightGuides(s.heights); }
          else setCursor(c);
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          if (polyDraw) return;
          if (wire) { cancelWire(); return; } // 画线态右键 → 取消整条（不弹粘贴菜单）
          if (panMovedRef.current) { panMovedRef.current = false; return; } // 刚右键拖动过 → 不弹菜单（保留"右键点一下"弹菜单）
          // 仅当点在空白画布（Stage 自身，非实例 Group）才开"粘贴"菜单
          if (e.target === e.target.getStage()) setMenu({ x: e.evt.clientX, y: e.evt.clientY, instId: null });
        }}
        onClick={(e) => {
          if (polyDraw) {
            const pt = e.target.getStage()?.getPointerPosition();
            if (!pt) return;
            const c = toCanvas(pt);
            if (draft.length >= 3 && Math.hypot(c.x - draft[0].x, c.y - draft[0].y) < 12 / scale) {
              finalize(draft);
            } else {
              setDraft([...draft, ortho(draft[draft.length - 1], c)]);
            }
            return;
          }
          if (wire) {
            // 画线态：背景/实例上的点击 = 增加一个折线拐点（吸附到网格 + 对齐参考线；引脚点击已 cancelBubble，不到这里）
            const pt = e.target.getStage()?.getPointerPosition();
            if (pt) { const s = snapDraw(toCanvas(pt)); wirePoint({ x: s.x, y: s.y }); }
            return;
          }
          if (marqueeMovedRef.current) { marqueeMovedRef.current = false; return; } // 刚框选 → 不要清掉选中
          if (e.target === e.target.getStage()) { select({ kind: null, id: null }); }
        }}
      >
        <Layer listening={false}>{gridLines}</Layer>
        <Layer listening={!polyDraw}>
          {/* 兄弟上下文（淡显、只读） */}
          {siblingBoxes.length > 0 && (
            <Group listening={false} opacity={0.35}>
              {siblingBoxes.map((b) => (
                <Group key={b.instanceId} x={b.x} y={b.y}>
                  {b.vertices ? (
                    <Line points={b.vertices.flatMap((p) => [p.x, p.y])} closed fill={colors.siblingFill} stroke={colors.siblingStroke} strokeWidth={1.5} />
                  ) : (
                    <Rect width={b.w} height={b.h} fill={colors.siblingFill} stroke={colors.siblingStroke} strokeWidth={1.5} />
                  )}
                  <Text x={6} y={6} text={`${b.instanceName} : ${b.designName}`} fontSize={11} fill={colors.textFaint} />
                </Group>
              ))}
            </Group>
          )}
          {navStack.length > 1 && <Frame outline={outline} colors={colors} />}
          {/* 当前层(open def)的边界接口条：可拖（沿 M 外轮廓投影）。拖动 portedFrom 接口 → 源子接口跟随。 */}
          {navStack.length > 1 && openDef && (() => {
            const fbox = { x: 0, y: 0, w: outline.w, h: outline.h, vertices: outline.vertices } as unknown as BoxView;
            return selfInterfaceBars.map((b) => (
              <Bar
                key={b.interfaceId}
                box={fbox}
                bar={{ ...b, paired: false, unconnected: false }}
                colors={colors}
                selected={false}
                ported={!!openDef.interfaces.find((i) => i.id === b.interfaceId)?.portedFrom}
                onClick={() => {}}
                onReposition={(side, value, isPerimeter) =>
                  isPerimeter
                    ? setInterfacePerimeter(openDef.id, b.interfaceId, side, value)
                    : setInterfaceEdge(openDef.id, b.interfaceId, side, value)}
                onContextMenu={(e) => e.evt.preventDefault()}
              />
            ));
          })()}
          {boxes.map((b) => (
            <InstanceNode
              key={b.instanceId}
              box={b}
              lib={doc.library}
              colors={colors}
              selected={selectedIds.includes(b.instanceId)}
              selectedIfId={selection.kind === "interface" && selection.instId === b.instanceId ? selection.id : null}
              multiSel={multiSelByInst(b.instanceId)}
              liveBox={rsz && rsz.instId === b.instanceId ? rsz : null}
              liveOffset={groupDrag?.group && groupDrag.anchorId !== b.instanceId && selectedIds.includes(b.instanceId) ? { x: groupDrag.dx, y: groupDrag.dy } : null}
              onDragStart={() => setMoving(true)}
              onDragLive={(dx, dy) => {
                const group = selectedIds.includes(b.instanceId) && selectedIds.length > 1;
                setDragInstLive({ anchorId: b.instanceId, dx, dy, group }); // store 瞬态 → 只有 CommittedWires 重算,不动实例树
                if (group) setGroupDrag({ anchorId: b.instanceId, dx, dy, group });
              }}
              onMove={(pos, dx, dy) => {
                setMoving(false);
                setGroupDrag(null);
                setDragInstLive(null);
                // 多选一起拖 → 整体平移（不做归属判定）
                if (selectedIds.includes(b.instanceId) && selectedIds.length > 1) {
                  moveSelectedBy(dx, dy);
                  return;
                }
                // 单个：落点中心若真的落在另一个更大 harden 内部 → 归属为它的子；否则只是移动（网格吸附）。
                // 多边形按真实轮廓判定（凹口空白区不算在内）。
                const cx = pos.x + b.w / 2;
                const cy = pos.y + b.h / 2;
                const area = b.w * b.h;
                const inside = (o: BoxView) =>
                  cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h &&
                  (o.vertices ? pointInPolygon(o.vertices, cx - o.x, cy - o.y) : true);
                const target = boxes.find((o) => o.instanceId !== b.instanceId && o.w * o.h > area * 1.2 && inside(o));
                if (target) reparentInstance(b.instanceId, target.hardenId, { x: gsnap(pos.x - target.x), y: gsnap(pos.y - target.y) });
                else moveInstance(b.instanceId, { x: gsnap(pos.x), y: gsnap(pos.y) });
              }}
              onSelect={(additive) => selectInstance(b.instanceId, additive)}
              onDrill={() => drillInto(b.instanceId, b.hardenId)}
              onBarClick={(ifId, _role, additive) => {
                const key = `${b.instanceId}/${ifId}`;
                if (additive) {
                  const n = new Set(portSel); if (n.has(key)) n.delete(key); else n.add(key); setPortSel(n);
                } else {
                  setPortSel(new Set());
                  selectInterface(b.instanceId, ifId);
                }
              }}
              onMoveBar={(ifId, side, value, isPerimeter) =>
                isPerimeter ? setInterfacePerimeter(b.hardenId, ifId, side, value) : setInterfaceEdge(b.hardenId, ifId, side, value)}
              onSetInnerPos={(ifId, pos) => setInterfaceInnerPos(b.hardenId, ifId, pos)}
              onToggleFlip={(ifId, next) => updateInterface(b.hardenId, ifId, { dsFlip: next })}
              onContextMenu={(e) => {
                e.evt.preventDefault();
                e.cancelBubble = true;
                if (polyDraw) return;
                if (wire) { cancelWire(); return; } // 画线态右键 → 取消整条
                if (panMovedRef.current) { panMovedRef.current = false; return; } // 刚右键拖动过 → 不弹菜单
                if (!selectedIds.includes(b.instanceId)) selectInstance(b.instanceId, false);
                setMenu({ x: e.evt.clientX, y: e.evt.clientY, instId: b.instanceId });
              }}
              portedIfIds={portedIfIdsByInst(b.instanceId)}
              onBarContextMenu={(ifId, e) => {
                e.evt.preventDefault();
                e.cancelBubble = true;
                if (polyDraw) return;
                if (wire) { cancelWire(); return; } // 画线态右键 → 取消整条
                if (panMovedRef.current) { panMovedRef.current = false; return; } // 刚右键拖动过 → 不弹菜单
                setMenu(null);
                setBarMenu({ x: e.evt.clientX, y: e.evt.clientY, instId: b.instanceId, ifId });
              }}
              wiring={wire != null}
              onWirePin={(instId, ifId, role, at, pd, axis) => {
                if (role === "out") { if (!wire) beginWire(instId, ifId, at, pd); }
                else if (wire) { commitWire(instId, ifId, at, axis); setSnapIn(null); }
              }}
              onPinHover={setSnapIn}
              autoFlipIfs={autoFlipIfs.get(b.instanceId)}
              onBarDragLive={(ifId, p) => setDragBarLive(p ? { instId: b.instanceId, ifId, ...p } : null)}
              onCardDragLive={(ifId, p) => setDragCardLive(p ? { instId: b.instanceId, ifId, ...p } : null)}
              activeLayer={activeLayer}
              hiddenLayers={hiddenLayers}
            />
          ))}

          {/* 已提交 wire：独立组件（单独订阅拖动瞬态 → 拖动中只重算线,不重渲染实例树）。隐藏连线时不画（配对/连接不动） */}
          {!hideWires && openDef && (
            <CommittedWires
              wires={openDef.wires ?? []}
              boxes={boxes}
              defs={doc.library.defs}
              activeLayer={activeLayer}
              hiddenLayers={hiddenLayers}
              colors={colors}
              selWireId={selection.kind === "wire" ? selection.id : null}
              selectedIds={selectedIds}
              onSelect={(id) => select({ kind: "wire", id })}
              onMenu={(id, e) => { e.evt.preventDefault(); e.cancelBubble = true; setWireMenu({ x: e.evt.clientX, y: e.evt.clientY, wireId: id }); }}
            />
          )}
          {/* 画线态：已落拐点 + 到光标的正交预览（橙色虚线） */}
          {wire && (
            <Line
              points={(snapIn ? orthFinish(wire.points, snapIn, snapIn.axis) : cursor ? orthAppend(wire.points, cursor) : wire.points).flatMap((p) => [p.x, p.y])}
              stroke="#f79009"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          )}
          {/* 对齐参考线（画线态，绿色虚线，跨可见画布） */}
          {wire && (guides.gx != null || guides.gy != null) && (() => {
            const a = toCanvas({ x: 0, y: 0 }), b = toCanvas({ x: size.w, y: size.h });
            return (
              <>
                {guides.gx != null && <Line points={[guides.gx, a.y, guides.gx, b.y]} stroke="#12b76a" strokeWidth={1} dash={[6, 4]} listening={false} />}
                {guides.gy != null && <Line points={[a.x, guides.gy, b.x, guides.gy]} stroke="#12b76a" strokeWidth={1} dash={[6, 4]} listening={false} />}
              </>
            );
          })()}
          {/* 凹口深度辅助线：往盒里扎时，与同 def 其他实例的凹口深度对齐（洋红虚线，跨该盒边） */}
          {wire && notchGuide && (
            notchGuide.kind === "v"
              ? <Line points={[notchGuide.at, notchGuide.box.y, notchGuide.at, notchGuide.box.y + notchGuide.box.h]} stroke="#d444f1" strokeWidth={1} dash={[5, 3]} listening={false} />
              : <Line points={[notchGuide.box.x, notchGuide.at, notchGuide.box.x + notchGuide.box.w, notchGuide.at]} stroke="#d444f1" strokeWidth={1} dash={[5, 3]} listening={false} />
          )}
          {/* 进入/出去位置辅助线：同 def 待画盒的 进入 + 出去 目标位置（青色虚线，横跨可见画布，便于从外面就对准） */}
          {wire && heightGuides.length > 0 && (() => {
            const a = toCanvas({ x: 0, y: 0 }), b = toCanvas({ x: size.w, y: size.h });
            return heightGuides.map((g, idx) => (
              g.kind === "h"
                ? <Line key={idx} points={[a.x, g.at, b.x, g.at]} stroke="#06aed4" strokeWidth={1} dash={[5, 3]} listening={false} />
                : <Line key={idx} points={[g.at, a.y, g.at, b.y]} stroke="#06aed4" strokeWidth={1} dash={[5, 3]} listening={false} />
            ));
          })()}

          {/* 选中实例的四角 resize 手柄（仅单选、未在移动；画多边形模式下不显示）。旋转/镜像下也可用：尺寸交换在 store.resizeBox 处理 */}
          {!polyDraw &&
            !moving &&
            selectedIds.length === 1 &&
            selection.kind === "instance" &&
            (() => {
              const sel = boxes.find((b) => b.instanceId === selection.id);
              if (!sel) return null;
              return (
                <ResizeHandles
                  box={sel}
                  live={rsz && rsz.instId === sel.instanceId ? rsz : null}
                  scale={scale}
                  pos={pos}
                  colors={colors}
                  onLive={(bx) => setRsz({ instId: sel.instanceId, ...bx })}
                  onCommit={(bx) => {
                    resizeBox(sel.instanceId, bx.x, bx.y, bx.w, bx.h);
                    setRsz(null);
                  }}
                />
              );
            })()}

          {/* 画多边形草稿（线宽/点随缩放保持屏幕恒定） */}
          {polyDraw && draft.length > 0 && (
            <Group listening={false}>
              <Line
                points={[
                  ...draft.flatMap((p) => [p.x, p.y]),
                  ...(cursor ? [ortho(draft[draft.length - 1], cursor).x, ortho(draft[draft.length - 1], cursor).y] : []),
                ]}
                stroke={colors.accent}
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
              />
              {draft.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={(i === 0 ? 6 : 4) / scale} fill={i === 0 ? colors.accent : colors.boxFill} stroke={colors.accent} strokeWidth={1.5 / scale} />
              ))}
            </Group>
          )}

          {/* 框选橡皮筋矩形（线宽随缩放保持屏幕恒定） */}
          {marquee && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill={colors.accent + "22"}
              stroke={colors.accent}
              strokeWidth={1 / scale}
              dash={[4 / scale, 3 / scale]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {menu &&
        (() => {
          // 解析右键目标实例引用的 def —— 用于"隐藏/显示下层"（仅对有子块的 def 有意义）
          const inst = menu.instId != null ? openDef?.childInstances.find((i) => i.id === menu.instId) : undefined;
          const idef = inst && doc.library.defs.find((d) => d.id === inst.hardenId);
          const items: MenuItem[] =
            menu.instId != null
              ? [
                  { label: "Rotate 90°", onClick: () => rotateSelected("cw") },
                  { label: "Flip Horizontal", onClick: () => mirrorSelected("h") },
                  { label: "Flip Vertical", onClick: () => mirrorSelected("v") },
                  ...(idef && idef.childInstances.length > 0
                    ? [{ label: idef.hideChildren ? "Show Children" : "Hide Children", onClick: () => toggleDefChildren(idef.id) }]
                    : []),
                  { label: "Copy", onClick: () => copySelection() },
                  { label: "Cut", onClick: () => cut() },
                  { label: "Paste", onClick: () => paste(), disabled: clipboard.length === 0 },
                  { label: "Duplicate", onClick: () => duplicate() },
                  { label: "Delete", onClick: () => deleteSelected(), danger: true },
                ]
              : [{ label: "Paste", onClick: () => paste(), disabled: clipboard.length === 0 }];
          return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />;
        })()}
      {barMenu &&
        (() => {
          const boundaryIfId = portedChildIf.get(`${barMenu.instId}/${barMenu.ifId}`);
          const inst = openDef?.childInstances.find((i) => i.id === barMenu.instId);
          const items: MenuItem[] = [];
          // ctrl 多选了多个接口 → 一次提升全部（提升幂等，已提升的自动跳过）
          if (portSel.size > 0) {
            items.push({
              label: `Promote ${portSel.size} selected interfaces to this layer's boundary`,
              onClick: () => {
                for (const k of portSel) { const i = k.indexOf("/"); portInterface(k.slice(0, i), k.slice(i + 1)); }
                setPortSel(new Set());
              },
            });
          }
          items.push(
            boundaryIfId
              ? { label: "Unpromote", onClick: () => unportInterface(boundaryIfId) }
              : { label: "Promote to this layer's boundary", onClick: () => portInterface(barMenu.instId, barMenu.ifId) },
          );
          // 删除接口（删子块 def 的该接口）；级联清掉指向它的提升边界接口（core 内完成）。
          if (portSel.size > 1) items.push({ label: `Delete ${portSel.size} Selected Interfaces`, danger: true, onClick: () => deletePortSel() });
          if (inst) items.push({ label: "Delete Interface", danger: true, onClick: () => removeInterface(inst.hardenId, barMenu.ifId) });
          return <ContextMenu x={barMenu.x} y={barMenu.y} items={items} onClose={() => setBarMenu(null)} />;
        })()}
      {wireMenu && (
        <ContextMenu
          x={wireMenu.x}
          y={wireMenu.y}
          items={[{ label: "Delete Wire", danger: true, onClick: () => removeWire(wireMenu.wireId) }]}
          onClose={() => setWireMenu(null)}
        />
      )}
      {wire && <div className="draw-hint">Draw wire: start from the ◆ data source's green pin · click to place a waypoint · click the blue pin to finish · Esc/right-click to cancel</div>}
      {polyDraw && <div className="draw-hint">Draw polygon: click corner points (auto right-angle + grid snap) · return to start or press Enter to finish · Esc to cancel</div>}
      {!polyDraw && boxes.length === 0 && <div className="placeholder">Empty canvas · drag in a "Blank harden" from the module library on the left to get started</div>}
    </div>
  );
}
