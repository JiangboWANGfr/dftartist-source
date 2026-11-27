// "早期阶段...floorplan图,显示memory所在的位置,根据CCR/SCR显示mbist plan,以虚线框显示mbist
// controller以及用虚线显示它与memory之间的关系" — a physical (die X/Y) view, unlike every other
// canvas in this app (schematic/GenConnection/scan tree all lay out a GRAPH, never real
// coordinates). Reuses mbist-plan's own memory x/y/placed + controller member indices; the die
// bounding box is the one thing mbist-plan doesn't carry, so a plain memory-map call (same
// libDir/defFile) fetches it — no C++ changes needed for this view.
//
// "参考 innovus 显示 floorplan 的功能" — pan/zoom (wheel + drag, same imperative-stage pattern as
// SchematicTab's onWheel/draggable) and a micron ruler grid, closer to a real P&R floorplan view
// than a flat scatter of boxes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Text, Group } from "react-konva";
import type Konva from "konva";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { MbistPlanResult } from "../core-bridge/model.ts";
import { buildFloorplan, type FloorplanLayout } from "./core/floorplan.ts";

/** A round-number grid step (1/2/5 * 10^n) close to `range / targetDivisions` — the same
 *  "nice ruler tick" rule every EDA/CAD floorplan grid uses, so labels read as 500/1000/2000 µm
 *  rather than an arbitrary fraction of the die. */
function niceStep(range: number, targetDivisions: number): number {
  if (range <= 0) return 1;
  const raw = range / Math.max(1, targetDivisions);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

/** A translucent backing chip behind a label so it reads over any box/line/grid it lands on —
 *  width approximated from character count (no canvas text measurement needed for this). */
function LabelChip({ x, y, text, color, align = "left" }: {
  x: number; y: number; text: string; color: string; align?: "left" | "right";
}) {
  const w = Math.max(10, text.length * 5.6) + 6;
  const cx = align === "right" ? x - w : x;
  return (
    <Group>
      <Rect x={cx} y={y - 1} width={w} height={13} fill="#0009" cornerRadius={2} />
      <Text x={cx + 3} y={y} text={text} fontSize={10} fill={color} />
    </Group>
  );
}

export function FloorplanView({ plan, dir, def }: {
  plan: MbistPlanResult | null; dir: string; def: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [die, setDie] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [err, setErr] = useState("");
  const [zoomPct, setZoomPct] = useState(100);   // display only — the stage transform is imperative

  useEffect(() => {
    let dead = false;
    setErr("");
    if (!dir.trim() || !def.trim()) { setDie(null); return; }
    void hs.memoryMap(dir, { defFile: def }).then((mm) => {
      if (dead) return;
      if (!mm.placedCount) setErr("DEF matched no placed instances — check the component names");
      setDie(mm.die);
    }).catch((e) => { if (!dead) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [dir, def, plan]);

  // Recomputed only when the inputs that actually change its geometry change — NOT on every
  // wheel/drag tick (zoom/pan are applied imperatively to the Stage, never through this).
  const layout: FloorplanLayout | null = useMemo(
    () => (plan && die ? buildFloorplan(die, plan.memories, plan.controllers, size.w, size.h) : null),
    [plan, die, size.w, size.h]);

  // The wrapRef div only exists once `layout` is non-empty (every state before that early-returns
  // a plain <div> with no ref) — `die` arrives asynchronously, so wrapRef is still null on the
  // observer's first attach attempt. Re-run once the real branch mounts, or the container is
  // stuck at the 1x1 fallback forever (the mclko/ELK lesson, same root cause: an effect with an
  // empty dep list that ran once too early).
  const hasLayout = !!layout && !layout.empty;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasLayout]);

  useEffect(() => {
    (window as unknown as { __floorplanForTest?: FloorplanLayout | null }).__floorplanForTest = layout;
  }, [layout]);

  // A resize/replan re-fits the base layout to scale 1 at origin — reset any user zoom/pan so
  // the stage transform and the freshly-rebuilt `layout` (already fit to the new size) agree.
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
    setZoomPct(100);
  }, []);
  useEffect(fit, [layout?.die.w, layout?.die.h, fit]);

  // The stage transform itself is applied imperatively (immediate, every wheel tick — that part
  // was never the problem). `setZoomPct` is the only React state touched here, purely for the
  // toolbar's "100%" readout; committing it on EVERY wheel tick forced a full re-render of every
  // Konva node in the layer (memories/controllers/grid/labels) at wheel-event frequency, which on
  // a trackpad can be well over 60/s — that was the actual stutter. Coalesced to one commit per
  // animation frame instead, same pattern as the drag-pan throttle below.
  const zoomRaf = useRef<number | null>(null);
  const pendingZoom = useRef<number | null>(null);
  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const old = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const to = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
    const next = e.evt.deltaY < 0 ? old * 1.08 : old / 1.08;
    const scale = Math.max(0.2, Math.min(8, next));
    stage.scale({ x: scale, y: scale });
    stage.position({ x: pointer.x - to.x * scale, y: pointer.y - to.y * scale });
    stage.batchDraw();
    pendingZoom.current = scale;
    if (zoomRaf.current === null) {
      zoomRaf.current = requestAnimationFrame(() => {
        zoomRaf.current = null;
        if (pendingZoom.current !== null) setZoomPct(Math.round(pendingZoom.current * 100));
      });
    }
  }, []);

  const panRaf = useRef<number | null>(null);
  const onDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return;
    if (panRaf.current !== null) return;
    panRaf.current = requestAnimationFrame(() => {
      panRaf.current = null;
      stageRef.current?.batchDraw();
    });
  }, []);

  if (!plan) return <div className="muted pad">先在 Controller Matrix 页出一次计划。</div>;
  if (!def.trim()) return <div className="muted pad">floorplan 需要一份 DEF —— 在上面的 DEF 输入框填一个,再切回本页。</div>;
  if (err) return <div className="crnote">⚠ {err}</div>;
  if (!layout || layout.empty) return <div className="muted pad">DEF 里没有匹配上的已放置实例。</div>;

  const dieW = die!.x1 - die!.x0, dieH = die!.y1 - die!.y0;
  const stepX = niceStep(dieW, 8), stepY = niceStep(dieH, 8);
  const scaleX = layout.die.w / dieW, scaleY = layout.die.h / dieH;
  const vLines: number[] = [];
  for (let v = Math.ceil(die!.x0 / stepX) * stepX; v <= die!.x1; v += stepX) vLines.push(v);
  const hLines: number[] = [];
  for (let v = Math.ceil(die!.y0 / stepY) * stepY; v <= die!.y1; v += stepY) hLines.push(v);

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }} data-view="floorplan">
      <div className="schtools">
        <span style={{ fontSize: 10, opacity: 0.75, alignSelf: "center", marginRight: 2 }}>
          {zoomPct}%</span>
        <button className="findbtn" data-btn="fp-fit" title="Reset zoom/pan to fit" onClick={fit}>Fit</button>
      </div>
      <div style={{ position: "absolute", left: 8, top: 8, zIndex: 1, pointerEvents: "none",
                    fontSize: 11, color: "#9fb3c8" }}>
        <div style={{ fontWeight: 600, color: "#d6e4f0" }}>MBIST Floorplan</div>
        <div style={{ opacity: 0.8 }}>die {Math.round(dieW)} × {Math.round(dieH)} µm</div>
      </div>
      <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 1, pointerEvents: "none",
                    fontSize: 10, color: "#9fb3c8", display: "flex", gap: 10 }}>
        <span><span style={{ color: "#5b9bd5" }}>■</span> memory</span>
        <span><span style={{ color: "#2ecc71" }}>▭</span> controller</span>
      </div>
      <Stage ref={stageRef} width={size.w} height={size.h} draggable
             onWheel={onWheel} onDragMove={onDragMove}>
        {/* Nothing here is individually interactive — the Stage itself owns drag/wheel — so
            listening={false} skips Konva's hit-graph rebuild on every redraw. */}
        <Layer listening={false}>
          {/* die outline + a subtle micron ruler grid, Innovus-style */}
          <Rect x={layout.die.x} y={layout.die.y} width={layout.die.w} height={layout.die.h}
                fill="#12161c" stroke="#556" strokeWidth={1} />
          {vLines.map((v) => {
            const x = layout.die.x + (v - die!.x0) * scaleX;
            return (
              <Group key={`vg:${v}`}>
                <Line points={[x, layout.die.y, x, layout.die.y + layout.die.h]}
                      stroke="#2a3542" strokeWidth={1} />
                <Text x={x + 2} y={layout.die.y + 2} text={String(Math.round(v))}
                      fontSize={9} fill="#5a6f85" />
              </Group>
            );
          })}
          {hLines.map((v) => {
            const y = layout.die.y + layout.die.h - (v - die!.y0) * scaleY;
            return (
              <Group key={`hg:${v}`}>
                <Line points={[layout.die.x, y, layout.die.x + layout.die.w, y]}
                      stroke="#2a3542" strokeWidth={1} />
                <Text x={layout.die.x + 2} y={y + 2} text={String(Math.round(v))}
                      fontSize={9} fill="#5a6f85" />
              </Group>
            );
          })}

          {layout.links.map((l, i) => (
            <Line key={i} points={[l.x1, l.y1, l.x2, l.y2]} stroke="#4fa3ff" strokeWidth={1}
                  dash={[4, 4]} opacity={0.7} />
          ))}

          {layout.controllers.map((c) => (
            <Rect key={`ctrl:${c.name}`} x={c.x} y={c.y} width={c.w} height={c.h}
                  cornerRadius={4} fill="#2ecc7114" stroke="#2ecc71" strokeWidth={1.5} dash={[6, 4]} />
          ))}
          {layout.memories.map((m) => (
            <Rect key={`mem:${m.path}`} x={m.x} y={m.y} width={m.w} height={m.h}
                  cornerRadius={2} fill={m.placed ? "#5b9bd5" : "#555"}
                  stroke={m.placed ? "#bcd6f2" : "#888"} strokeWidth={1}
                  shadowColor="#000" shadowBlur={4} shadowOpacity={0.5} shadowForStrokeEnabled={false}
                  opacity={m.placed ? 1 : 0.4} />
          ))}
          {layout.controllers.map((c) => (
            <LabelChip key={`ctrl-lbl:${c.name}`} x={c.x} y={c.y - 15} text={c.name} color="#5be8a0" />
          ))}
          {/* At real design scale (100s of memories), an always-on label per box is unreadable
              no matter how it's laid out — every real floorplan viewer hides instance labels
              until zoomed in far enough to have room for them. Small designs still get them for
              free (immediately useful, nothing to zoom past). */}
          {(layout.memories.length <= 30 || zoomPct >= 250) && layout.memories.map((m) => (
            <LabelChip key={`mem-lbl:${m.path}`} x={m.x + m.w + 4} y={m.y + m.h / 2 - 6}
                       text={m.path.slice(m.path.lastIndexOf(".") + 1)} color="#bcd6f2" />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
