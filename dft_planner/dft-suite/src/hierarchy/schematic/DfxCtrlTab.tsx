// DFX Ctrl 原理图 tab（M3/T3，spec §5.2/D9/D10/D13）：在 hierarchy 工作区把
// genconn store 的 `doc.dfxInstances + doc.ctrlIps` 合成一张只读 schematic —— 每个实例
// 一个块、每条修改展开成 dfx源 → ctrl IP → mux → 目标（观测反向）。复用 hierarchy 的
// ELK 纯布局（buildDfxSchematicGraph→toElkGraph→layout→toLaid）+ Konva 静态图层
// （参照 SchematicTab.StaticBox / DfxDetail.DetailBox）。不追踪 fanin/fanout、不编辑：
// 双击实例块开「新建」配置弹窗、双击 ctrl 块开「编辑」弹窗。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Text, Line } from "react-konva";
import type Konva from "konva";
import { useStore as useHierStore } from "../store.ts";
import { useStore as useGenconnStore } from "../../genconn/store.ts";
import { splitDefId } from "../core/defId.ts";
import { dftDesign } from "../../core-bridge/client.ts";
import type { PortInfo } from "../../core-bridge/model.ts";
import { parentOf } from "../../genconn/dfx/judge.ts";
import { buildDfxSchematicGraph, type DfxInstanceMeta } from "../../genconn/dfx/dfxGraph.ts";
import { moduleNameOf, targetsFromSpec } from "../../genconn/dfx/edit.ts";
import { dftCtrlgen } from "../../core-bridge/ctrlgen.ts";
import { downloadText } from "../../genconn/persist.ts";
import { portId, toElkGraph, type SchNode } from "../core/schematic.ts";
import { layout } from "./elkLayout.ts";
import { boundsOf, fitTransform, toLaid, type Box, type Laid } from "./laid.ts";
import { InspectorShell, InspectorSection, InspectorRow } from "../../common/inspector/Inspector.tsx";
import { clampPanelWidth, loadPanelWidth, savePanelWidth } from "../../common/inspector/panelWidth.ts";
import { GenPreview, type GenFile } from "../../common/genpreview/GenPreview.tsx";
import { useProject, writeToProject } from "../../store/project.ts";
import { ipFiles } from "../../store/outputLayout.ts";
import { appConfirm } from "../../common/notify.ts";

const CTRL_PREFIX = "ctrl:";

const FILL: Record<SchNode["kind"], string> = {
  module: "#23262d", primitive: "#22282b", blackbox: "#2b2230", port: "#1c3a33", logic: "#3a2f1c",
};

/** 拉到端口的实例元数据（缓存，供 buildDfxSchematicGraph）。 */
type Meta = { instanceName: string; designName: string; ports: PortInfo[] };

/** 拖拽后的位置记忆（模块级，跨 tab 重挂载保留）：nodeId -> 屏幕坐标。
 *  作为 elk.position 排序提示回喂给下一次布局(spec §2.4 的做法)。 */
const dfxPrevPos: Record<string, { x: number; y: number }> = {};

export function DfxCtrlTab() {
  // 跨 store 响应式订阅 genconn 文档（数据源）。
  const dfxInstances = useGenconnStore((s) => s.doc.dfxInstances);
  const ctrlIps = useGenconnStore((s) => s.doc.ctrlIps);
  const projOpen = useProject((s) => !!s.path);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [metaMap, setMetaMap] = useState<Record<string, Meta>>({});
  const [laid, setLaid] = useState<Laid | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [relayoutTick, setRelayoutTick] = useState(0);
  const [focus, setFocus] = useState<string | null>(null); // 清单焦点（本 tab 内 state，去画布化）
  const [gen, setGen] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });
  const [genFiles, setGenFiles] = useState<GenFile[]>([]);
  const [genOpen, setGenOpen] = useState(false);
  const [sideW, setSideW] = useState(() => loadPanelWidth("hierarchy:dfxSideW"));
  const sideWRef = useRef(sideW); sideWRef.current = sideW;
  const dragSide = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = sideWRef.current;
    const move = (ev: MouseEvent) => setSideW(clampPanelWidth(startW + (startX - ev.clientX)));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); savePanelWidth("hierarchy:dfxSideW", sideWRef.current); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const dfxSet = useMemo(() => new Set(dfxInstances), [dfxInstances]);

  // 量测画布容器。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // ≥1: a collapsed container gave Konva a 0×0 canvas, and drawing one throws (see safeCanvas).
    const measure = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 拉端口：对每个尚未缓存的 dfxInstance 先 get-netlist(parent) 惰性注册（深层 nodeId 靠
  // 祖先展开）再 get-ports；失败降级为空端口。名字优先取 hierarchy 树（右键入口时已在树上），
  // 否则退回 nodeId 末段。alive 守卫防过期 setState。
  useEffect(() => {
    const missing = dfxInstances.filter((id) => !metaMap[id]);
    if (missing.length === 0) return;
    let alive = true;
    void (async () => {
      const additions: Record<string, Meta> = {};
      for (const id of missing) {
        const parent = parentOf(id);
        try { if (parent) await dftDesign.getNetlist({ ownerInstanceId: parent }); } catch { /* 惰性注册尽力而为 */ }
        let ports: PortInfo[] = [];
        try { ports = (await dftDesign.getPorts({ nodeId: id })).ports; } catch { /* 拉不到端口 → 空块 */ }
        const seg = id.split(".").pop() ?? id;
        const hier = useHierStore.getState().instances[id];
        additions[id] = {
          instanceName: hier?.instanceName ?? seg,
          designName: hier ? splitDefId(hier.definitionId).designName : seg,
          ports,
        };
      }
      if (alive) setMetaMap((m) => ({ ...m, ...additions }));
    })();
    return () => { alive = false; };
  }, [dfxInstances, metaMap]);

  // 建图（纯，记忆化）：只喂已拉到端口的实例 + 全部 ctrlIps。焦点高亮 + 布局共用它。
  const graph = useMemo(() => {
    const instances: DfxInstanceMeta[] = dfxInstances
      .filter((id) => metaMap[id])
      .map((id) => ({ nodeId: id, ...metaMap[id] }));
    return buildDfxSchematicGraph({ instances, ctrlIps });
  }, [dfxInstances, ctrlIps, metaMap]);

  // 用户拖拽后的绝对坐标（拖拽中的即时反馈）；落手时写入位置记忆并重排。
  const [manualPos, setManualPos] = useState<Record<string, { x: number; y: number }>>({});
  const skipFitRef = useRef(false);   // 拖拽引发的重排不重新取景

  // 布局：空图不布局；relayoutTick 强制重排。alive 守卫防过期。
  // 位置记忆(dfxPrevPos)作为 elk.position 排序提示回喂，使拖动过的盒子重排后仍保持其相对位置，
  // 且由 ELK 重新走线(它做的是全局通道分配,自己改 points 只会得到交叉/重叠的走线)。
  useEffect(() => {
    if (Object.keys(graph.nodes).length === 0) { setLaid(null); return; }
    let alive = true;
    const prev = Object.keys(dfxPrevPos).length ? dfxPrevPos : undefined;
    void layout(toElkGraph(graph, prev)).then((elk) => {
      if (alive) setLaid(toLaid(elk, graph.nodes, graph.edges));
    });
    return () => { alive = false; };
  }, [graph, relayoutTick]);

  const edgeById = useMemo(() => new Map(graph.edges.map((e) => [e.id, e] as const)), [graph]);

  // 叠加拖拽位移：移动盒子及其引脚，并给受影响的连线一条临时正交路径（ELK 的折点已失效）。
  // 松手后会触发重排，由 ELK 重新出干净的走线。
  const laidAdj = useMemo<Laid | null>(() => {
    if (!laid || Object.keys(manualPos).length === 0) return laid;
    const shift = (m: Record<string, { x: number; y: number }>, dx: number, dy: number) =>
      Object.fromEntries(Object.entries(m).map(([k, p]) => [k, { x: p.x + dx, y: p.y + dy }]));
    const boxes = laid.boxes.map((b) => {
      const p = manualPos[b.node.id];
      if (!p) return b;
      const dx = p.x - b.x, dy = p.y - b.y;
      return { ...b, x: p.x, y: p.y, ports: shift(b.ports, dx, dy), innerPorts: shift(b.innerPorts, dx, dy) };
    });
    const byId = new Map(boxes.map((b) => [b.node.id, b]));
    const moved = new Set(Object.keys(manualPos));
    const wires = laid.wires.map((w) => {
      const e = edgeById.get(w.id);
      if (!e || (!moved.has(e.fromNode) && !moved.has(e.toNode))) return w;
      const s = byId.get(e.fromNode)?.ports[portId(e.fromNode, e.fromPort)];
      const t = byId.get(e.toNode)?.ports[portId(e.toNode, e.toPort)];
      if (!s || !t) return w;
      const mx = (s.x + t.x) / 2;
      return { ...w, points: [s.x, s.y, mx, s.y, mx, t.y, t.x, t.y] };
    });
    return { boxes, wires };
  }, [laid, manualPos, edgeById]);

  // 焦点模块相关节点集合 = ctrl 块 ∪ 其邻居 ∪ 邻居里 mux 的邻居（mux 是每位唯一号，
  // 二跳展开安全触达目标/原驱动/dfx 源）。无焦点/焦点已删 → null（不调暗）。
  const relatedIds = useMemo(() => {
    if (!focus) return null;
    const ctrlId = `${CTRL_PREFIX}${focus}`;
    if (!graph.nodes[ctrlId]) return null;
    const set = new Set<string>([ctrlId]);
    const addNbrs = (id: string) => {
      for (const e of graph.edges) {
        if (e.fromNode === id) set.add(e.toNode);
        else if (e.toNode === id) set.add(e.fromNode);
      }
    };
    addNbrs(ctrlId);
    for (const id of [...set]) if (graph.nodes[id]?.kind === "blackbox") addNbrs(id);
    return set;
  }, [focus, graph]);

  // 焦点模块被删（或清单清空）→ 撤销焦点，避免高亮悬空。
  useEffect(() => {
    if (focus && !ctrlIps.some((c) => moduleNameOf(c.spec) === focus)) setFocus(null);
  }, [ctrlIps, focus]);

  // laid / 尺寸 / 焦点变化 → fit：有焦点时贴合该组，否则全图（初始取景 + 加块纳入视野）。
  // 拖拽落手引发的重排不自动取景 —— 否则每次移动完视图都会跳一下，手感很差。
  useEffect(() => {
    if (skipFitRef.current) { skipFitRef.current = false; return; }
    if (!laid || size.w <= 0 || size.h <= 0) return;
    const sub = relatedIds
      ? {
          boxes: laid.boxes.filter((b) => relatedIds.has(b.node.id)),
          wires: laid.wires.filter((w) => {
            const e = edgeById.get(w.id);
            return !!e && relatedIds.has(e.fromNode) && relatedIds.has(e.toNode);
          }),
        }
      : laid;
    const b = boundsOf(sub.boxes.length ? sub : laid);
    if (b) setView(fitTransform(b, size));
  }, [laid, size, relatedIds, edgeById]);

  const applyFit = useCallback(() => {
    if (!laid) return;
    const b = boundsOf(laid);
    if (!b || size.w <= 0 || size.h <= 0) return;
    setView(fitTransform(b, size));
  }, [laid, size]);

  // 滚轮缩放（以指针为锚，clamp 0.05~3）。
  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setView((v) => {
      const to = { x: (pointer.x - v.x) / v.scale, y: (pointer.y - v.y) / v.scale };
      const next = e.evt.deltaY < 0 ? v.scale * 1.08 : v.scale / 1.08;
      const scale = Math.max(0.05, Math.min(3, next));
      return { scale, x: pointer.x - to.x * scale, y: pointer.y - to.y * scale };
    });
  }, []);

  // 拖拽平移（受控 x/y ← stage 位置）。
  const onDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const s = e.target as Konva.Stage;
    setView((v) => ({ ...v, x: s.x(), y: s.y() }));
  }, []);

  // 双击：ctrl 块 → 编辑弹窗（module 从 id 前缀反推）；实例块 → 新建弹窗（seedNodeId 直传）。
  // 弹窗支持 seedNodeId 由 T4 补全（此处先接线）。
  const onDblNode = useCallback((node: SchNode) => {
    const gc = useGenconnStore.getState();
    if (node.id.startsWith(CTRL_PREFIX)) gc.openDfxDialog({ mode: "edit", module: node.id.slice(CTRL_PREFIX.length) });
    else if (dfxSet.has(node.id)) gc.openDfxDialog({ mode: "new", seedNodeId: node.id });
  }, [dfxSet]);

  const isInteractive = useCallback(
    (node: SchNode) => node.id.startsWith(CTRL_PREFIX) || dfxSet.has(node.id), [dfxSet]);

  // 全部生成/预览：遍历 doc.ctrlIps → dftCtrlgen.gen(spec) → 汇总进底部 GenPreview 面板
  // （不再直接下载，spec §8）。失败（daemon/ctrlgen 错）→ 记 err 在清单头下方。
  const generateAll = useCallback(async () => {
    const ips = useGenconnStore.getState().doc.ctrlIps;
    if (ips.length === 0) return;
    setGen({ busy: true, err: null });
    try {
      const collected: GenFile[] = [];
      for (const c of ips) {
        const { files } = await dftCtrlgen.gen(c.spec);
        for (const f of files) collected.push({ name: f.name, text: f.text });
      }
      setGenFiles(collected);
      setGenOpen(true);
      setGen({ busy: false, err: null });
    } catch (e) {
      setGen({ busy: false, err: String((e as Error)?.message ?? e) });
    }
  }, []);

  // 从 DFX tab 移除一个实例块。守卫：若仍被某 ctrlIp 的 spec.pins 引用为目标（复用编辑反查
  // targetsFromSpec），先 confirm（不删配置，仅从图上移除）；未被引用则直接移除。
  const removeInstance = useCallback(async (nodeId: string) => {
    const seg = nodeId.split(".").pop() ?? nodeId;
    const refs = ctrlIps
      .filter((c) => targetsFromSpec(c.spec, dfxInstances).some((t) => t.nodeId === nodeId))
      .map((c) => moduleNameOf(c.spec));
    if (refs.length && !(await appConfirm(`${seg} is still controlled by ${refs.join(", ")}. Remove this instance block? (This won't delete the config, only removes it from the diagram)`))) return;
    useGenconnStore.getState().removeDfxInstance(nodeId);
  }, [ctrlIps, dfxInstances]);

  if (dfxInstances.length === 0 && ctrlIps.length === 0)
    return <div className="muted pad" data-tab-kind="dfxctrl">Right-click an instance → "Add to DFX Ctrl" to start</div>;

  return (
    <div className="dfxctrl-outer" data-tab-kind="dfxctrl">
      <div className="dfxctrl-root">
      <div ref={wrapRef} className="schwrap">
        <div className="schtools">
          <button data-btn="fit" title="Zoom to fit content" onClick={applyFit}>Fit</button>
          <button data-btn="relayout" title="Relayout" onClick={() => setRelayoutTick((t) => t + 1)}>Relayout</button>
        </div>
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          draggable
          onWheel={onWheel}
          onDragMove={onDragMove}
        >
          {/* 静态图层：wires + boxes，listening=false 跳过命中图计算。焦点时无关者调暗。 */}
          <Layer listening={false}>
            {laidAdj?.wires.map((w) => {
              const e = edgeById.get(w.id);
              const dim = relatedIds != null && !(e && relatedIds.has(e.fromNode) && relatedIds.has(e.toNode));
              return <Line key={w.id} points={w.points} stroke="#6b7785" strokeWidth={w.bus ? 2.2 : 1.4} opacity={dim ? 0.12 : 1} perfectDrawEnabled={false} />;
            })}
            {laidAdj?.boxes.map((b) => <DfxBox key={b.node.id} box={b} dim={relatedIds != null && !relatedIds.has(b.node.id)} />)}
          </Layer>

          {/* 交互图层：ctrl / 实例块的透明命中矩形（双击开弹窗；拖拽移动位置）。 */}
          <Layer>
            {laidAdj?.boxes.filter((b) => isInteractive(b.node)).map((b) => (
              <Rect
                key={b.node.id}
                x={b.x} y={b.y} width={b.w} height={b.h}
                fill="transparent"
                draggable
                // 拖拽必须吃掉事件，否则会连带拖动整个 Stage（画布平移）。
                onDragStart={(e) => { e.cancelBubble = true; }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  setManualPos((m) => ({ ...m, [b.node.id]: { x: e.target.x(), y: e.target.y() } }));
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  const x = e.target.x(), y = e.target.y();
                  // 记住落点后重排：由 ELK 全局重新走线，避免手工改线导致的交叉/重叠。
                  dfxPrevPos[b.node.id] = { x, y };
                  skipFitRef.current = true;   // 保持当前视图，不要跳
                  setManualPos({});
                  setRelayoutTick((t) => t + 1);
                }}
                onDblClick={() => onDblNode(b.node)}
                onDblTap={() => onDblNode(b.node)}
                onMouseEnter={cursorPointer}
                onMouseLeave={cursorDefault}
                perfectDrawEnabled={false}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      {/* DFX 修改清单（去画布化）：单击=组内高亮 + fit；双击/✎=编辑弹窗；🗑=纯 removeCtrlIp。 */}
      <div className="dfx-side-resizer" data-resize="dfx-side" onMouseDown={dragSide} title="Drag to resize panel width" />
      <InspectorShell className="dfxctrl-side" data-dfx="panel" style={{ width: sideW }}>
        <div className="inspector-body">
          <InspectorSection
            title="DFX Modifications"
            meta={<button className="dfx-genall" data-btn="gen-all" disabled={ctrlIps.length === 0 || gen.busy} onClick={generateAll} title="Generate all .v/.icl/.tcl and preview">{gen.busy ? "Generating…" : "Generate Preview"}</button>}
          >
            {gen.err && <div className="dfxctrl-err">{gen.err}</div>}
            {ctrlIps.length === 0
              ? <div className="insp-empty">Double-click an instance block in the diagram to configure</div>
              : (
                <ul className="insp-list">
                  {ctrlIps.map((c) => {
                    const mod = moduleNameOf(c.spec);
                    const nCtl = c.spec.pins.filter((p) => p.mode === "control").length;
                    const nObs = c.spec.pins.length - nCtl;
                    return (
                      <InspectorRow
                        key={mod} selected={focus === mod} title={mod} data-dfx-item={mod}
                        onClick={() => setFocus((f) => (f === mod ? null : mod))}
                        onDoubleClick={() => useGenconnStore.getState().openDfxDialog({ mode: "edit", module: mod })}
                        actions={<>
                          <button title="Edit" data-dfx-edit={mod} onClick={(e) => { e.stopPropagation(); useGenconnStore.getState().openDfxDialog({ mode: "edit", module: mod }); }}>✎</button>
                          <button title="Delete" data-dfx-del={mod} onClick={async (e) => {
                            e.stopPropagation();
                            if (await appConfirm(`Delete DFX modification ${mod}?`)) { useGenconnStore.getState().deleteCtrlIpV3(mod); setFocus((f) => (f === mod ? null : f)); }
                          }}>🗑</button>
                        </>}
                      >
                        <span className="insp-row-name">{mod}</span>
                        <span className="insp-row-meta">{c.spec.pins.length} targets · {nCtl} ctrl / {nObs} obs</span>
                      </InspectorRow>
                    );
                  })}
                </ul>
              )}
          </InspectorSection>
          {dfxInstances.length > 0 && (
            <InspectorSection title="Instances">
              <ul className="insp-list" data-dfx="inst-list">
                {dfxInstances.map((id) => (
                  <InspectorRow key={id} title={id} data-dfx-inst={id}
                    actions={<button title="Remove this instance block from the diagram" data-dfx-inst-del={id} onClick={() => void removeInstance(id)}>✕</button>}
                  >
                    <span className="insp-row-name">{id.split(".").pop() ?? id}</span>
                  </InspectorRow>
                ))}
              </ul>
            </InspectorSection>
          )}
        </div>
      </InspectorShell>
      </div>
      {genOpen && (
        <div className="dfx-genpanel">
          <header className="dfx-genpanel-head">
            <strong>DFX Ctrl Generation Preview</strong>
            <span className="dfx-genpanel-sp" />
            <button data-btn="dfx-genall-download" onClick={() => genFiles.forEach((f) => downloadText(f.name, f.text))}>Download All</button>
            {projOpen && <button onClick={() => void writeToProject(ipFiles(genFiles))}>Write to Project</button>}
            <button onClick={() => setGenOpen(false)}>Collapse</button>
          </header>
          <GenPreview
            files={genFiles}
            onCopy={(f) => void navigator.clipboard?.writeText(f.text)}
            onDownload={(f) => downloadText(f.name, f.text)}
          />
        </div>
      )}
    </div>
  );
}

/** 只读节点：dfx 源画扁平旗标；ctrl=accent、mux(blackbox)=次要紫、实例=默认描边。
 *  参照 SchematicTab.StaticBox / DfxDetail.DetailBox（去掉端口交互）。 */
function DfxBox({ box, dim }: { box: Box; dim?: boolean }) {
  const { node, x, y, w, h } = box;
  if (node.kind === "port") {
    return (
      <Group opacity={dim ? 0.25 : 1}>
        <Line points={[x, y, x + w - 12, y, x + w, y + h / 2, x + w - 12, y + h, x, y + h]}
              closed fill="#1c3a33" stroke="#2f8f6b" strokeWidth={1.2} perfectDrawEnabled={false} />
        <Text x={x} y={y + h / 2 - 5} width={w - 10} align="center" text={node.designName} fontSize={10} fill="#bfe8da" perfectDrawEnabled={false} />
      </Group>
    );
  }
  const isCtrl = node.id.startsWith(CTRL_PREFIX);
  const stroke = isCtrl ? "#e0a93b" : node.kind === "blackbox" ? "#8a6ea8" : "#48505c";
  return (
    <Group opacity={dim ? 0.25 : 1}>
      <Rect x={x} y={y} width={w} height={h} cornerRadius={4} fill={FILL[node.kind]} stroke={stroke} strokeWidth={isCtrl ? 2 : 1} perfectDrawEnabled={false} />
      <Text x={x} y={y + 5} width={w} align="center" text={node.designName} fontSize={11} fontStyle="bold" fill="#dfe4ea" wrap="none" ellipsis perfectDrawEnabled={false} />
      <Text x={x} y={y + 19} width={w} align="center" text={node.instanceName} fontSize={9} fill="#8b95a3" wrap="none" ellipsis perfectDrawEnabled={false} />
      {node.ports.map((p) => {
        const pt = box.ports[portId(node.id, p.name)];
        if (!pt) return null;
        const out = p.direction === "out";
        return (
          <Group key={p.name}>
            <Line points={out ? [x + w, pt.y, pt.x, pt.y] : [pt.x, pt.y, x, pt.y]} stroke="#6b7785" strokeWidth={1} perfectDrawEnabled={false} />
            {out
              ? <Text x={x} y={pt.y - 5} width={w - 7} align="right" text={p.busLabel} fontSize={9.5} fill="#cdd4dc" perfectDrawEnabled={false} />
              : <Text x={x + 7} y={pt.y - 5} text={p.busLabel} fontSize={9.5} fill="#cdd4dc" perfectDrawEnabled={false} />}
          </Group>
        );
      })}
    </Group>
  );
}

const cursorPointer = (e: Konva.KonvaEventObject<MouseEvent>) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "pointer"; };
const cursorDefault = (e: Konva.KonvaEventObject<MouseEvent>) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; };
