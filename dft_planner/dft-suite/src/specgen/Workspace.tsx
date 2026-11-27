// SpecGen 工作区：左 DFT IP 目录；中 Konva 画布（scope 边界+接口 + 按类型配色的缩写 IP 节点 + 正交连线）；右可开合/可拖宽的实时 dftspec 面板。
// 移植自 newProject/src/ui/SpecGenTab.tsx；预览由 in-process genDftSpec 改为防抖调用 C++ dftSpecgen.generate CLI。
import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Stage, Layer, Rect, Line, Text, Group, Arrow } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useStore } from "../genconn/store.ts";
import { saveGenconnDoc } from "../genconn/save.ts";
import { DftConfigDialog } from "./DftConfigDialog.tsx";
import { routeOrtho, orthogonalize, makeCongestion, type Rect as ObsRect } from "./route.ts";
import { validateDftWire, chainAwareFrom } from "./wire.ts";
import { downloadText } from "../genconn/persist.ts";
import { useProject, writeToDir, writeToProject } from "../store/project.ts";
import { specFilesBySection } from "../store/outputLayout.ts";
import { filterDocToDomain, splitSpecSections, wireBusOf } from "./busFilter.ts";
import { DFT_CATALOG, catalogEntry, catalogBus, dftIpSize } from "./catalog.ts";
import { defOutline, selfBars, barAnchor, BUS_COLOR, hexTint, busTypeLabel, triPoints, type BoxView, type BarView, type Side } from "../genconn/layout.ts";
import { layerStateOf, type BusType } from "../genconn/layers.ts";
import { LayerMenu } from "../genconn/LayerMenu.tsx";
import { portGeom, dftIpDispSize, type Vec } from "./ipgeom.ts";
import { DftIpNode } from "./DftIpNode.tsx";
import { ipPosIn, isCrossLayerIp } from "./edit.ts";
import { computeWireAnchors, type AnchorEnd } from "./anchor.ts";
import { useZoomPan } from "./useZoomPan.ts";
import { dftSpecgen } from "../core-bridge/specgen.ts";
import { hasBridge } from "../core-bridge/client.ts";
import { serialize } from "../genconn/core/document.ts";
import type { DftConfig, DftEndpoint, DftWire, DftIpType } from "../genconn/core/dft-model.ts";
import { promptText } from "../genconn/promptDialog.tsx";
import { chainGroupOf } from "./chaingroup.ts";
import type { HardenDef, GenConnDocument } from "../genconn/core/model.ts";
import { GuideCard } from "../shell/GuideCard.tsx";
import { useDesign } from "../store/design.ts";
import { appConfirm } from "../common/notify.ts";
import "./styles.css";

const WORKSPACE_MIN = { w: 800, h: 560 };
const IFACE_INSET = 20;    // 边界接口往工作区内缩，避免被边界裁掉一半

// 面板宽度 localStorage 记忆（与 genconn/Workspace.tsx 的 lsNum/lsSetNum 一致）。
const lsNum = (k: string, d: number): number => {
  try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : d; } catch { return d; }
};
const lsSetNum = (k: string, v: number): void => { try { localStorage.setItem(k, String(Math.round(v))); } catch { /* ignore */ } };

const ifaceInDir = (side: Side): Vec => side === "left" ? { dx: 1, dy: 0 } : side === "right" ? { dx: -1, dy: 0 } : side === "top" ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 };

const IFB = { long: 100, short: 40, pinOff: 20, pinLen: 20 }; // 块长/短边、脚沿边偏移、脚长

/** 接口块几何：块矩形（左右边竖排）+ ▶out/◀in 两脚（dsFlip 交换位置）+ 锚点（脚尖外 pinLen 处，dir=边法线朝内）。 */
function ifaceGeom(bar: Omit<BarView, "paired" | "unconnected">, backdropBox: BoxView) {
  const a0 = barAnchor(backdropBox, { ...bar, paired: false, unconnected: false });
  const d = ifaceInDir(bar.side);
  const a = { x: a0.x + d.dx * IFACE_INSET, y: a0.y + d.dy * IFACE_INSET }; // 块贴边界内缩后的基准点（贴边中心）
  const vert = bar.side === "left" || bar.side === "right";
  const snap = (v: number) => Math.round(v / 20) * 20;
  const as = vert ? { x: a.x, y: snap(a.y) } : { x: snap(a.x), y: a.y }; // 沿边坐标吸网格，与折点/锚点网格对齐
  const w = vert ? IFB.short : IFB.long, h = vert ? IFB.long : IFB.short;
  // 块矩形：贴着基准点往画布内放
  const rect =
    bar.side === "left" ? { x: as.x, y: as.y - h / 2, w, h } :
    bar.side === "right" ? { x: as.x - w, y: as.y - h / 2, w, h } :
    bar.side === "top" ? { x: as.x - w / 2, y: as.y, w, h } :
    { x: as.x - w / 2, y: as.y - h, w, h };
  // 朝画布的那条边（脚所在边）上的两个脚位：沿边 ±pinOff，dsFlip 交换 out/in
  const face = // 脚根所在的块边坐标
    bar.side === "left" ? { x: rect.x + w, y: as.y } :
    bar.side === "right" ? { x: rect.x, y: as.y } :
    bar.side === "top" ? { x: as.x, y: rect.y + h } :
    { x: as.x, y: rect.y };
  const off = bar.dsFlip ? IFB.pinOff : -IFB.pinOff;
  const pinAt = (s: 1 | -1) => vert ? { x: face.x, y: face.y + s * off } : { x: face.x + s * off, y: face.y };
  const pOut = pinAt(1), pIn = pinAt(-1);
  return {
    rect, vert, side: bar.side, dir: d,
    pOut, pIn, // 脚根（块边上）
    outW: { x: pOut.x + d.dx * IFB.pinLen, y: pOut.y + d.dy * IFB.pinLen }, // 锚点 = 脚尖
    inW: { x: pIn.x + d.dx * IFB.pinLen, y: pIn.y + d.dy * IFB.pinLen },
  };
}

/** 端点 → 锚点端：MUX 端口/接口引脚 = fixed；普通 IP 数据口 = float（盒级，渲染时选边）。 */
function endpointAnchorEnd(
  scope: HardenDef, ep: DftEndpoint, bars: Omit<BarView, "paired" | "unconnected">[], backdropBox: BoxView,
  dragPos: { ipId: string; x: number; y: number } | null, layer: BusType | null,
): AnchorEnd | null {
  if (ep.kind === "ip") {
    const ip = (scope.dftIps ?? []).find((i) => i.id === ep.ipId);
    if (!ip) return null;
    const pos = dragPos && dragPos.ipId === ip.id ? { x: dragPos.x, y: dragPos.y } : ipPosIn(ip, layer);
    if (ip.ipType === "Multiplexer") {
      const g = portGeom(ip.ipType, ep.port, ip.rotation ?? 0, ip.mirror ?? false);
      if (!g) return null;
      return { kind: "fixed", key: `${ip.id}:${ep.port}`, at: { x: pos.x + g.x, y: pos.y + g.y, dir: g.dir } };
    }
    const { w, h } = dftIpDispSize(ip);
    return { kind: "float", key: ip.id, box: { x: pos.x, y: pos.y, w, h } };
  }
  const bar = bars.find((b) => b.interfaceId === ep.interfaceId);
  if (!bar) return null;
  const g = ifaceGeom(bar, backdropBox);
  const at = ep.pin === "out" ? g.outW : g.inW;
  return { kind: "fixed", key: `if:${ep.interfaceId}:${ep.pin}`, at: { x: at.x, y: at.y, dir: g.dir } };
}

/** 有 waypoints → 走 [源, ...折点, 目标] 正交折线（用户手控，不再避障；折点由 moveSegment 保证与端口对齐、逐段正交；
 *  锚点因布局变化移动后可能与折点失配 → orthogonalize 兜底插直角过渡，杜绝斜线）；否则自动避障。 */
function wirePoints(w: DftWire, p: { x: number; y: number; dir: Vec }, q: { x: number; y: number; dir: Vec }, obstacles: ObsRect[]): number[] {
  if (!w.waypoints?.length) return routeOrtho(p, p.dir, q, q.dir, obstacles);
  const pts = orthogonalize([{ x: p.x, y: p.y }, ...w.waypoints, { x: q.x, y: q.y }], p.dir.dx !== 0);
  return pts.flatMap((pt) => [pt.x, pt.y]);
}

type PtXY = { x: number; y: number };
function segmentsOf(flat: number[]): { a: PtXY; b: PtXY }[] {
  const V: PtXY[] = []; for (let i = 0; i < flat.length; i += 2) V.push({ x: flat[i], y: flat[i + 1] });
  const segs: { a: PtXY; b: PtXY }[] = []; for (let i = 0; i + 1 < V.length; i++) segs.push({ a: V[i], b: V[i + 1] });
  return segs;
}
/** 把第 si 段沿垂直方向移到 off（水平段改 y、竖直段改 x）；端点段插新折点，内部段移折点；去共线冗余；返回内部折点(去首尾端口锚点)。 */
function moveSegment(flat: number[], si: number, horiz: boolean, off: number): PtXY[] {
  const V: PtXY[] = []; for (let i = 0; i < flat.length; i += 2) V.push({ x: flat[i], y: flat[i + 1] });
  const iA = si, iB = si + 1;
  const shift = (p: PtXY): PtXY => horiz ? { x: p.x, y: off } : { x: off, y: p.y };
  const A = V[iA], B = V[iB];
  if (iA === 0) { V.splice(1, 0, shift(A), shift(B)); }                 // 段贴源端口：插两点成拐
  else if (iB === V.length - 1) { V.splice(iB, 0, shift(A), shift(B)); } // 段贴目标端口：插两点成拐
  else { V[iA] = shift(A); V[iB] = shift(B); }                          // 内部段：移两端折点
  // 去共线冗余 + 端口锚点(首尾)固定，取内部点。
  // 不在此对折点取网格：折点与端口/相邻点共享的那一轴必须保持精确相等，否则贴端口段变斜线（端口锚点常不在网格上）。off 已在调用处按拖动轴取网格。
  const dedup: PtXY[] = [];
  for (let i = 1; i < V.length - 1; i++) {
    const a = V[i - 1], b = V[i], c = V[i + 1];
    const collinear = (Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - c.x) < 1e-6) || (Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.y - c.y) < 1e-6);
    if (!collinear) dedup.push({ x: b.x, y: b.y });
  }
  return dedup;
}

export function SpecgenWorkspace() {
  const doc = useStore((s) => s.doc);
  const dirty = useStore((s) => s.dirty);
  const scopeId = useStore((s) => s.specgenScope);
  const openSpecgenScope = useStore((s) => s.openSpecgenScope);
  const addDftIp = useStore((s) => s.addDftIp);
  const updateInterface = useStore((s) => s.updateInterface);
  const moveDftIp = useStore((s) => s.moveDftIp);
  const deleteDftIp = useStore((s) => s.deleteDftIp);
  const selectDftIp = useStore((s) => s.selectDftIp);
  const selectedDftIps = useStore((s) => s.selectedDftIps);
  const selectDftIps = useStore((s) => s.selectDftIps);
  const toggleDftIp = useStore((s) => s.toggleDftIp);
  const selectAllDftIps = useStore((s) => s.selectAllDftIps);
  const deleteDftIps = useStore((s) => s.deleteDftIps);
  const clearDftScope = useStore((s) => s.clearDftScope);
  const removeFromSpecgen = useStore((s) => s.removeFromSpecgen);
  const openConfigDialog = useStore((s) => s.openConfigDialog);
  const setDftConfig = useStore((s) => s.setDftConfig);
  const configDialogIp = useStore((s) => s.configDialogIp);
  const dftWire = useStore((s) => s.dftWire);
  const dftBeginWire = useStore((s) => s.dftBeginWire);
  const dftCommitWire = useStore((s) => s.dftCommitWire);
  const dftCancelWire = useStore((s) => s.dftCancelWire);
  const removeDftWire = useStore((s) => s.removeDftWire);
  const autoArrangeDft = useStore((s) => s.autoArrangeDft);
  const arrangeSnapshot = useStore((s) => s.arrangeSnapshot);
  const syncDesignInstances = useStore((s) => s.syncDesignInstances);
  const rotateDftIp = useStore((s) => s.rotateDftIp);
  const flipDftIpH = useStore((s) => s.flipDftIpH);
  const flipDftIpV = useStore((s) => s.flipDftIpV);
  const setDftWireWaypoints = useStore((s) => s.setDftWireWaypoints);
  const activeLayer = useStore((s) => s.activeLayer);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  const singleSel = selectedDftIps.length === 1 ? selectedDftIps[0] : null;

  const scopes = doc.library.defs.filter((d) => d.inSpecgen);
  const scope: HardenDef | undefined = doc.library.defs.find((d) => d.id === scopeId) ?? scopes[0];
  // 图层门控（纯视图）：wire → 所属总线，复用生成侧同一分类（busFilter.wireBusOf），避免 UI 与生成不同步。
  const wireBus = (w: DftWire): BusType | null => (scope ? wireBusOf(scope, w) : null);
  const projOpen = useProject((s) => !!s.path);
  // The harden's own dft_studio_db/<harden>/spec/logic_test — where OCC's dfx_occ_def_point.tcl
  // already auto-writes (set_occ_out_dir, design.ts). SSN/EDT/BScan specs belong in the SAME
  // tree, not wherever the .dftproj happens to live, so "Write to project" targets this when
  // it's available (a CLI-launched session) and only falls back to the project-relative
  // Spec/ssn|edt|bscan path otherwise (a project opened standalone, with no harden context).
  const [specLogicTestDir, setSpecLogicTestDir] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const lo = await (window as unknown as {
          dft?: { app?: { launchOptions?(): Promise<{ specLogicTestDir?: string }> } };
        }).dft?.app?.launchOptions?.();
        setSpecLogicTestDir(lo?.specLogicTestDir ?? null);
      } catch { /* standalone/dev run without launch args */ }
    })();
  }, []);

  const { view, setView, toWorld, zoomAt, onWheel, fit } = useZoomPan();
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragIpType = useRef<DftIpType | null>(null); // 调色板拖放中的 IP 类型（HTML5 DnD → 画布 onDrop 落定）
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    // ≥1: a collapsed container gave Konva a 0×0 canvas, and drawing one throws (see safeCanvas).
    const measure = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    const ro = new ResizeObserver(measure);
    ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [wireHover, setWireHover] = useState<DftEndpoint | null>(null); // 收线时悬停到的目标入口（磁吸）
  const [muxHover, setMuxHover] = useState<string | null>(null); // wiring 中悬停的 MUX ipId
  const [selectedDftWire, setSelectedDftWire] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ kind: "ip" | "wire"; id: string; x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ ipId: string; x: number; y: number } | null>(null);
  const [segDrag, setSegDrag] = useState<{ wireId: string; wps: { x: number; y: number }[] } | null>(null); // 折点段拖动实时预览（瞬态）
  const [specOpen, setSpecOpen] = useState(false);
  const [specW, setSpecW] = useState(() => lsNum("specgen:specW", 460));
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeMoved = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && useStore.getState().dftWire) dftCancelWire(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dftCancelWire]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return; // 输入中不触发
      if (useStore.getState().configDialogIp) return; // 配参弹窗打开时不触发（焦点在 body 也不误删背后 IP）
      if (!scope) return;
      if (!activeLayer && e.key !== "Escape") return; // 「全部」只读视图：键盘不改动几何/删除
      if (e.key === "Delete" || e.key === "Backspace") {
        // 选中连线优先：只要有选中的线，Delete 一定只删线，绝不删组件（即便某路径下 IP 仍被选中）。
        if (selectedDftWire) { e.preventDefault(); removeDftWire(scope.id, selectedDftWire); setSelectedDftWire(null); }
        else if (selectedDftIps.length) { e.preventDefault(); deleteDftIps(scope.id, selectedDftIps); }
      } else if (e.key === "r" || e.key === "R") {
        if (singleSel) { e.preventDefault(); rotateDftIp(scope.id, singleSel, e.shiftKey ? -1 : 1); }
      } else if (e.key === "f" || e.key === "F") {
        const ip = scope.dftIps?.find((i) => i.id === singleSel);
        if (ip?.ipType === "Multiplexer") {
          e.preventDefault();
          (e.shiftKey ? flipDftIpV : flipDftIpH)(scope.id, ip.id);
        }
      } else if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); selectAllDftIps(scope.id);
      } else if (e.key === "Escape") { setCtxMenu(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scope, activeLayer, selectedDftIps, singleSel, deleteDftIps, selectAllDftIps, selectedDftWire, deleteDftIp, removeDftWire, rotateDftIp, flipDftIpH, flipDftIpV]);
  useEffect(() => { if (!dftWire) { setWireHover(null); setMuxHover(null); } }, [dftWire]); // 拉线结束清掉悬停态
  useEffect(() => { setSelectedDftWire(null); }, [activeLayer]); // 切层/进只读：清本地连线高亮（selectedDftIps 由 store 的 setActiveLayer 清）
  // 自动同步 DesignInstance：scope 的直接 physical_block 子实例(增/删/改名) → 建/删/改对应 DesignInstance。
  const childSig = scope ? scope.childInstances
    .map((ci) => { const cd = doc.library.defs.find((d) => d.id === ci.hardenId); return cd?.designLevel === "physical_block" ? `${ci.id}:${ci.instanceName}:${cd.designName}` : ""; })
    .filter(Boolean).join("|") : "";
  useEffect(() => { if (scope) syncDesignInstances(scope.id); }, [scope?.id, childSig, syncDesignInstances]);

  // 实时 .spec 预览：400ms 防抖，按域各调一次 C++ dftSpecgen.generate CLI（浏览器 dev 无桥接则给占位提示）。
  // SSN/BSCAN 各生成一份、互不拖累（一域网络不完整只坏它自己），生成根经 filterDocToDomain 固定为当前 scope。
  const [specByDomain, setSpecByDomain] = useState<{ SSN: string; BSCAN: string; JTAG1838: string }>({ SSN: "", BSCAN: "", JTAG1838: "" });
  useEffect(() => {
    if (!scope) { setSpecByDomain({ SSN: "", BSCAN: "", JTAG1838: "" }); return; }
    if (!hasBridge()) { const m = "// Preview requires running inside the app (no dft native bridge detected)."; setSpecByDomain({ SSN: m, BSCAN: m, JTAG1838: m }); return; }
    let cancelled = false;  // 防乱序：doc/scope 变化后，丢弃仍在途的旧一轮 generate 结果
    const t = setTimeout(async () => {
      const gen = async (domain: "SSN" | "BSCAN" | "JTAG1838") => {
        const fdoc = filterDocToDomain(doc, scope.id, domain);
        const fdef = fdoc.library.defs.find((d) => d.id === scope.id);
        if (!fdef?.interfaces.length) return `// This scope has no ${domain === "BSCAN" ? "BScan" : domain === "JTAG1838" ? "1838jtag" : domain} boundary interfaces, nothing to show.`;
        try { return await dftSpecgen.generate(serialize(fdoc as GenConnDocument)); }
        catch (e) { return "// Cannot generate yet: " + (e as Error).message; }
      };
      const [SSN, BSCAN, JTAG1838] = await Promise.all([gen("SSN"), gen("BSCAN"), gen("JTAG1838")]);
      if (!cancelled) setSpecByDomain({ SSN, BSCAN, JTAG1838 });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [doc, scope]);

  // The SSN layer shows the SSN block ONLY. The EDT controllers are generated in the same pass
  // (they are what the ScanHost chain groups point at), but their configuration is not SSN
  // datapath — it is a section of its own, has always been written to its own file
  // (Spec/edt/<design>.spec), and is edited in the EDT dialog. Printing it under an "SSN"
  // heading only invited editing it in the wrong place. Still shown in full in the "All" view.
  const ssnOnly = (() => {
    const t = specByDomain.SSN;
    if (t.trimStart().startsWith("//")) return t;            // placeholder / error text
    const sec = splitSpecSections(t).SSN;
    return sec ? `read_config_data -in_wrapper $dftspec -rep -from_string {\n${sec}\n}\n` : t;
  })();
  const specDisplay = activeLayer === "BSCAN" ? specByDomain.BSCAN
    : activeLayer === "SSN" ? ssnOnly
    : activeLayer === "JTAG1838" ? specByDomain.JTAG1838
    : `// —— SSN ——\n${specByDomain.SSN}\n\n// —— BScan ——\n${specByDomain.BSCAN}\n\n// —— 1838jtag ——\n${specByDomain.JTAG1838}`;
  const specSections = (): Record<string, string> => ({ ...splitSpecSections(specByDomain.SSN), ...splitSpecSections(specByDomain.BSCAN) });

  const dragSpec = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = specW; let w = startW;
    const move = (ev: MouseEvent) => { w = Math.max(280, Math.min(900, startW + (startX - ev.clientX))); setSpecW(w); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); lsSetNum("specgen:specW", w); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  if (scopes.length === 0) {
    return (
      <div className="specgen">
        <div className="dft-palette dft-palette--disabled" aria-disabled="true">
          <div className="dft-head">SSN DataPath</div>
          {DFT_CATALOG.filter((e) => e.group === "datapath").map((e) => (
            <div key={e.ipType} className="dft-item" title="Add to a harden first">⬡ {e.label}</div>
          ))}
          <div className="dft-head">Other DFT IP</div>
          {DFT_CATALOG.filter((e) => e.group === "other").map((e) => (
            <div key={e.ipType} className="dft-item" title="Add to a harden first">⬡ {e.label}</div>
          ))}
        </div>
        <div className="dft-main dft-main--empty">
          <GuideCard
            icon="◇"
            title="DFTSpec Planner — Generate DftSpecification"
            steps={[
              { n: 1, text: "Open a design" },
              { n: 2, text: "In the DFT Stream Planner, select a harden and click \"Add to DFTSpec Planner ▸\"" },
              { n: 3, text: "Come back here to place DFT IP and generate the spec" },
            ]}
            actionLabel="Go to the DFT Stream Planner to select →"
            onAction={() => useDesign.getState().setWorkspace("genconn")}
          />
        </div>
      </div>
    );
  }

  const outline = scope ? defOutline(scope) : { w: WORKSPACE_MIN.w, h: WORKSPACE_MIN.h, vertices: undefined };
  const geomIps = (scope?.dftIps ?? []).filter((ip) =>
    activeLayer === null ? true : isCrossLayerIp(ip) || catalogBus(ip.ipType) === activeLayer);
  const readOnly = activeLayer === null; // 「全部」视图：画布只看不改

  // 框选结算：命中矩形内的 IP（跳过隐藏层）→ 整批替换选中；未移动则视为空点清选。
  // 松手落在画布外时 Konva 不发 Stage onMouseUp → 由 onMouseLeave 也调它，避免框卡死。
  const settleMarquee = () => {
    if (!marquee) return;
    const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
    const X = Math.max(marquee.x0, marquee.x1), Y = Math.max(marquee.y0, marquee.y1);
    const hit = geomIps.filter((ip) => {
      if (ip.ipType !== "DesignInstance" && (catalogBus(ip.ipType) !== activeLayer || hiddenLayers.has(catalogBus(ip.ipType)))) return false;
      const p = ipPosIn(ip, activeLayer); const { w, h } = dftIpDispSize(ip);
      return p.x < X && p.x + w > x && p.y < Y && p.y + h > y;
    }).map((ip) => ip.id);
    if (marqueeMoved.current) { setSelectedDftWire(null); selectDftIps(hit); } else { selectDftIp(null); setSelectedDftWire(null); }
    setMarquee(null);
  };

  const ipBox = geomIps.reduce((m, ip) => {
    const { w, h } = dftIpDispSize(ip);
    const p = ipPosIn(ip, activeLayer);
    return { w: Math.max(m.w, p.x + w + 60), h: Math.max(m.h, p.y + h + 60) };
  }, { w: 0, h: 0 });
  const ws = { w: Math.max(WORKSPACE_MIN.w, outline.w, ipBox.w), h: Math.max(WORKSPACE_MIN.h, outline.h, ipBox.h) };
  const bars = scope ? selfBars(scope) : [];
  const bverts = outline.vertices
    ? outline.vertices.map((p) => ({ x: (p.x / outline.w) * ws.w, y: (p.y / outline.h) * ws.h }))
    : undefined;
  const backdropBox: BoxView = {
    instanceId: "", instanceName: "", designName: "", hardenId: "",
    x: 0, y: 0, w: ws.w, h: ws.h, vertices: bverts, rotation: 0, mirror: false, bars: [],
  };
  // 连线避障的障碍矩形 = 各 IP 盒（拖动中的用实时位置）。
  const obstacles: ObsRect[] = geomIps.map((ip) => {
    const { w, h } = dftIpDispSize(ip);
    const pos = dragPos && dragPos.ipId === ip.id ? { x: dragPos.x, y: dragPos.y } : ipPosIn(ip, activeLayer);
    return { x: pos.x, y: pos.y, w, h };
  });
  // 全部已提交线一次算锚点：float 端选边 + 同盒同边错开
  const wireEnds = (scope?.dftWires ?? []).flatMap((w) => {
    const a = endpointAnchorEnd(scope!, w.from, bars, backdropBox, dragPos, activeLayer);
    const b = endpointAnchorEnd(scope!, w.to, bars, backdropBox, dragPos, activeLayer);
    return a && b ? [{ id: w.id, a, b }] : [];
  });
  const wireAnchors = computeWireAnchors(wireEnds);

  // 自动布线的连线（无手动折点）统一按顺序算一遍，共享一个拥塞跟踪器：后布的线避开先布线路，
  // 减少「两根线叠在一条走廊」的重叠。手动折点的线由用户掌控，不参与、也不占用拥塞。
  const autoRoute = new Map<string, number[]>();
  {
    const cong = makeCongestion();
    for (const w of scope?.dftWires ?? []) {
      if (w.waypoints?.length) continue;
      const pq = wireAnchors.get(w.id);
      if (!pq) continue;
      const pts = routeOrtho(pq.a, pq.a.dir, pq.b, pq.b.dir, obstacles, 14, 18, cong.cost);
      autoRoute.set(w.id, pts);
      cong.add(pts);
    }
  }

  // 调色板一项：可拖到画布落定(HTML5 DnD)，也保留点击即加(自动落点)。
  const paletteItem = (e: (typeof DFT_CATALOG)[number]) => (
    <div key={e.ipType} className="dft-item"
      title={activeLayer ? "Drag onto the canvas — or click to add" : "Pick a layer first"}
      draggable={!!(scope && activeLayer)}
      onDragStart={() => { dragIpType.current = e.ipType; }}
      onDragEnd={() => { dragIpType.current = null; }}
      onClick={() => scope && activeLayer && addDftIp(scope.id, e.ipType)}>
      ⬡ {e.label}
    </div>
  );
  // 画布落点：把屏幕落点换算成世界坐标，居中到光标、吸 20 网格，再按当前图层加 IP。
  const onCanvasDrop = (ev: ReactMouseEvent) => {
    const t = dragIpType.current; dragIpType.current = null;
    if (!t || !scope || !activeLayer || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const wpt = toWorld({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
    const { w, h } = dftIpSize(t);
    addDftIp(scope.id, t, { x: Math.round((wpt.x - w / 2) / 20) * 20, y: Math.round((wpt.y - h / 2) / 20) * 20 });
  };

  return (
    <>
    <div className="specgen">
      <div className="dft-palette">
        {(activeLayer === null || activeLayer === "SSN") && (<>
          <div className="dft-head">SSN DataPath</div>
          {DFT_CATALOG.filter((e) => e.group === "datapath" && (e.bus ?? "SSN") === "SSN").map(paletteItem)}
          <div className="dft-head">Other DFT IP</div>
          {DFT_CATALOG.filter((e) => e.group === "other").map(paletteItem)}
        </>)}
        {(activeLayer === null || activeLayer === "BSCAN") && (<>
          <div className="dft-head" style={{ color: BUS_COLOR.BSCAN }}>BScan</div>
          {DFT_CATALOG.filter((e) => e.bus === "BSCAN").map(paletteItem)}
        </>)}
        {(activeLayer === null || activeLayer === "JTAG1838") && (<>
          <div className="dft-head" style={{ color: BUS_COLOR.JTAG1838 }}>1838jtag</div>
          {DFT_CATALOG.filter((e) => e.bus === "JTAG1838").map(paletteItem)}
        </>)}
      </div>
      <div className="dft-main">
        <div className="dft-scopebar">
          {/* SpecGen 的画布状态(IP 摆放/连线)与 GenConnection 共享同一份文档 —— 这里的
              Save 保存的就是它(与 genconn 工具条的 Save 完全一致)。 */}
          <button data-btn="save" onClick={() => void saveGenconnDoc(false)}
                  title="Save the shared document (placements, wires, DFT IPs)">
            Save{dirty ? " ●" : ""}
          </button>
          <span>scope:</span>
          <select value={scope?.id} onChange={(e) => openSpecgenScope(e.target.value)}>
            {scopes.map((d) => <option key={d.id} value={d.id}>{d.designName}</option>)}
          </select>
          {scope && <button className="danger" onClick={async () => {
            if (await appConfirm(`Clear all DFT IP and wires in "${scope.designName}"?`)) clearDftScope(scope.id);
          }}>Clear this scope</button>}
          {scope && <button onClick={async () => {
            if (await appConfirm(`Remove "${scope.designName}" from the DFTSpec Planner? (content is kept, can be added back later)`)) removeFromSpecgen(scope.id);
          }}>Remove from DFTSpec Planner</button>}
          {selectedDftIps.length > 0 && scope && activeLayer &&
            <button onClick={() => deleteDftIps(scope.id, selectedDftIps)}>Delete selected ({selectedDftIps.length})</button>}
          {/* 居中高度：工作区盒高(560/outline)，但夹到可见画布高 size.h——盒比视口高时避免排到视口外(无滚动) */}
          {scope && <button disabled={activeLayer === null}
            onClick={() => autoArrangeDft(scope.id, Math.min(Math.max(WORKSPACE_MIN.h, outline.h), size.h), ws.w)}>
            {arrangeSnapshot?.defId === scope.id && arrangeSnapshot?.layer === activeLayer ? "Restore arrangement" : "Auto arrange"}
          </button>}
          <span style={{ marginLeft: 12 }}>Layer:</span>
          <LayerMenu />
          <button className={specOpen ? "gen-dftspec active" : "gen-dftspec"} onClick={() => setSpecOpen((v) => !v)}>{specOpen ? "Hide dftspec" : "Generate dftspec"}</button>
        </div>
        <div className="dft-workarea">
          <div className="dft-canvas" ref={wrapRef}
            onDragOver={(e) => { if (dragIpType.current) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); onCanvasDrop(e); }}>
            <Stage
              width={size.w} height={size.h}
              x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
              draggable={!dftWire && !marquee}
              onWheel={onWheel}
              onDragMove={(e) => { if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() })); }}
              onDragEnd={(e) => { if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() })); }}
              onMouseDown={(e) => {
                if (e.target !== e.target.getStage()) return;
                setCtxMenu(null);
                if (dftWire || !activeLayer) return;
                const sp = e.target.getStage()?.getPointerPosition();
                const p = sp ? toWorld(sp) : null;
                if (!p) { selectDftIp(null); setSelectedDftWire(null); return; }
                marqueeMoved.current = false;
                setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }}
              onMouseMove={(e) => {
                if (marquee) {
                  const sp2 = e.target.getStage()?.getPointerPosition();
                  const p2 = sp2 ? toWorld(sp2) : null;
                  if (p2) {
                    if (Math.abs(p2.x - marquee.x0) + Math.abs(p2.y - marquee.y0) > 3 / view.scale) marqueeMoved.current = true;
                    setMarquee({ ...marquee, x1: p2.x, y1: p2.y });
                  }
                  return;
                }
                if (!dftWire) return;
                const sp = e.target.getStage()?.getPointerPosition();
                const p = sp ? toWorld(sp) : null;
                if (!p) return;
                setCursor(p);
                if (muxHover && scope) {
                  const ip = scope.dftIps?.find((i) => i.id === muxHover);
                  if (ip) {
                    const gM = portGeom(ip.ipType, "master_bus_data_in", ip.rotation ?? 0, ip.mirror ?? false)!;
                    const gS = portGeom(ip.ipType, "secondary_bus_data_in", ip.rotation ?? 0, ip.mirror ?? false)!;
                    const mp = ipPosIn(ip, activeLayer);
                    const d2 = (g: { x: number; y: number }) => (mp.x + g.x - p.x) ** 2 + (mp.y + g.y - p.y) ** 2;
                    setWireHover({ kind: "ip", ipId: ip.id, port: d2(gM) <= d2(gS) ? "master_bus_data_in" : "secondary_bus_data_in" });
                  }
                }
              }}
              // 盒到盒拖拽落线：释放时若悬停在合法目标(盒身/mux槽/iface in)则落线，否则取消
              // 落 EDT 时 chainAwareFrom 先把起点重写为 ScanHost 的 chain_group_out（拖到 EDT 上自动变 chain 线）
              onMouseUp={() => {
                if (marquee) { settleMarquee(); return; }
                if (!dftWire) return;
                if (wireHover && scope) {
                  const from2 = chainAwareFrom(scope, dftWire.from, wireHover);
                  if (validateDftWire(scope, from2, wireHover) === null) { dftCommitWire(scope.id, wireHover, from2); return; }
                }
                dftCancelWire();
              }}
              onMouseLeave={() => settleMarquee()}
            >
              <Layer listening={!readOnly}>
                {bverts ? (
                  <Line points={bverts.flatMap((p) => [p.x, p.y])} closed stroke="#98a2b3" strokeWidth={2} dash={[8, 6]} />
                ) : (
                  <Rect x={0} y={0} width={ws.w} height={ws.h} stroke="#98a2b3" strokeWidth={2} dash={[8, 6]} />
                )}
                <Text x={8} y={8} text={`${scope?.designName} (DFTSpec Planner workspace)`} fontSize={12} fill="#98a2b3" />
                {/* 接口块：BUS_COLOR 配色圆角矩形，块内写总线类型+接口名；▶out(起线)/◀in(收线) 两三角脚 */}
                {bars.map((bar) => {
                  const ls = layerStateOf(bar.busType, activeLayer, hiddenLayers); // 图层三态
                  if (ls === "hidden") return null;
                  const g = ifaceGeom(bar, backdropBox);
                  const color = BUS_COLOR[bar.busType];
                  const mkEp = (pin: "in" | "out"): DftEndpoint => ({ kind: "iface", instanceId: scope.id, interfaceId: bar.interfaceId, pin });
                  const name = bar.label.endsWith(bar.busType) ? bar.label.slice(0, bar.label.length - bar.busType.length).trim() : bar.label;
                  const hovered = wireHover?.kind === "iface" && wireHover.interfaceId === bar.interfaceId;
                  return (
                    <Group key={bar.interfaceId} opacity={ls === "dim" ? 0.25 : 1} listening={ls !== "dim"}>
                      {/* 块：双击交换两脚位置（dsFlip），wiring 时整块 = in 收线靶 */}
                      <Rect x={g.rect.x} y={g.rect.y} width={g.rect.w} height={g.rect.h}
                        fill={hexTint(color, 0.88)} stroke={color} strokeWidth={hovered ? 3 : 1.5} cornerRadius={6}
                        onDblClick={(e) => { e.cancelBubble = true; updateInterface(scope.id, bar.interfaceId, { dsFlip: !bar.dsFlip }); }}
                        onMouseEnter={dftWire ? () => setWireHover(mkEp("in")) : undefined}
                        onMouseLeave={dftWire ? () => setWireHover(null) : undefined}
                      />
                      {/* 文字：横排两行；左右边竖排 → 旋转 -90（沿长边从下往上读） */}
                      <Group x={g.rect.x + g.rect.w / 2} y={g.rect.y + g.rect.h / 2}
                        rotation={g.vert ? -90 : 0} listening={false}>
                        <Text x={-IFB.long / 2} y={-14} width={IFB.long} align="center" text={busTypeLabel(bar.busType, bar.role)}
                          fontStyle="bold" fontSize={11} fill={color} wrap="none" />
                        <Text x={-IFB.long / 2} y={1} width={IFB.long} align="center" text={name}
                          fontSize={9} fill={color} opacity={0.85} wrap="none" ellipsis />
                      </Group>
                      {/* ▶ out 脚（尖朝画布内 = 数据进来，起线） */}
                      <Line points={triPoints(g.pOut, g.dir, true, IFB.pinLen, 5)} closed fill={color}
                        hitStrokeWidth={10}
                        onMouseDown={(e) => { e.cancelBubble = true; if (!dftWire && activeLayer) dftBeginWire(mkEp("out"), g.outW); }}
                        onClick={(e) => { e.cancelBubble = true; }}
                      />
                      {/* ◀ in 脚（尖朝块 = 数据出去，收线靶） */}
                      <Line points={triPoints(g.pIn, g.dir, false, IFB.pinLen, 5)} closed fill={color}
                        hitStrokeWidth={dftWire ? 14 : undefined}
                        onMouseEnter={dftWire ? () => setWireHover(mkEp("in")) : undefined}
                        onMouseLeave={dftWire ? () => setWireHover(null) : undefined}
                        onClick={(e) => { e.cancelBubble = true; }}
                      />
                    </Group>
                  );
                })}
                {/* 已提交连线：正交折线（两端垂直引出，不穿盒）；点选=蓝加粗、右键删 */}
                {(scope.dftWires ?? []).map((w) => {
                  const pq = wireAnchors.get(w.id);
                  if (!pq) return null;
                  const wb = wireBus(w); // null=两端都是 DI → 跨层恒可见（同 DI 节点）
                  const wls = wb === null ? "normal" : layerStateOf(wb, activeLayer, hiddenLayers); // 图层三态
                  if (wls === "hidden") return null;
                  const p = pq.a, q = pq.b;
                  const sel = selectedDftWire === w.id;
                  const flat = w.waypoints?.length ? wirePoints(w, p, q, obstacles)     // 手动折点：按用户折点走
                    : (autoRoute.get(w.id) ?? wirePoints(w, p, q, obstacles));          // 自动线：用拥塞感知预算的走线（handle 用它切段）
                  const mainPts = segDrag?.wireId === w.id                              // 拖段中：主线走实时预览折点
                    ? wirePoints({ ...w, waypoints: segDrag.wps }, p, q, obstacles) : flat;
                  // chain 线（ScanHost→EDT）：青色虚线区分于 datapath 线。EDT 只有 chain 入口，判 to 是 EDT 即可。
                  const chainDst = w.to.kind === "ip" ? w.to.ipId : null;
                  const isChain = chainDst !== null && scope.dftIps?.find((i) => i.id === chainDst)?.ipType === "Edt";
                  const col = sel ? "#2e90fa" : isChain ? "#14b8a6" : "#7a5af8"; // 选中态蓝色加粗优先
                  return (
                    <Fragment key={w.id}>
                    <Arrow
                      points={mainPts}
                      opacity={wls === "dim" ? 0.25 : 1} listening={wls !== "dim"}
                      stroke={col} strokeWidth={sel ? 3 : 1.5} hitStrokeWidth={10} dash={isChain ? [6, 4] : undefined}
                      fill={col} pointerLength={9} pointerWidth={8}
                      // 选中连线 = 清掉 IP 选中：否则 Delete 键会因 selectedDftIps 优先而误删组件（连线只删线，绝不删 IP）
                      onClick={(e) => { e.cancelBubble = true; selectDftIp(null); setSelectedDftWire(w.id); }}
                      onContextMenu={(e) => { e.evt.preventDefault(); e.cancelBubble = true;
                        selectDftIp(null); setSelectedDftWire(w.id); // 同上：右键连线也先清 IP 选中，避免随后 Delete 误删组件
                        const wa = wrapRef.current?.closest(".dft-workarea") as HTMLElement | null;
                        const rect = wa?.getBoundingClientRect();
                        setCtxMenu({ kind: "wire", id: w.id, x: e.evt.clientX - (rect?.left ?? 0), y: e.evt.clientY - (rect?.top ?? 0) }); }}
                    />
                    {sel && wls !== "dim" && segmentsOf(flat).map((seg, si) => {
                      const horiz = Math.abs(seg.a.y - seg.b.y) < 1e-6;
                      const offOf = (e: KonvaEventObject<DragEvent>) => Math.round((horiz ? seg.a.y + e.target.y() : seg.a.x + e.target.x()) / 20) * 20;
                      return (
                        <Line key={si} points={[seg.a.x, seg.a.y, seg.b.x, seg.b.y]} stroke="transparent" strokeWidth={2}
                          hitStrokeWidth={12} draggable
                          dragBoundFunc={(pos) => horiz ? { x: 0, y: pos.y } : { x: pos.x, y: 0 }}  // 只许垂直于自身方向移动
                          // 段 handle 盖在线之上：右键要透到线菜单（重置走线/删除），否则出浏览器原生菜单
                          onContextMenu={(e) => { e.evt.preventDefault(); e.cancelBubble = true;
                            const wa = wrapRef.current?.closest(".dft-workarea") as HTMLElement | null;
                            const rect = wa?.getBoundingClientRect();
                            setCtxMenu({ kind: "wire", id: w.id, x: e.evt.clientX - (rect?.left ?? 0), y: e.evt.clientY - (rect?.top ?? 0) }); }}
                          onDragMove={(e) => setSegDrag({ wireId: w.id, wps: moveSegment(flat, si, horiz, offOf(e)) })} // 拖动中实时预览
                          onDragEnd={(e) => {
                            scope && setDftWireWaypoints(scope.id, w.id, moveSegment(flat, si, horiz, offOf(e)));
                            setSegDrag(null);
                            e.target.position({ x: 0, y: 0 });
                          }}
                        />
                      );
                    })}
                    </Fragment>
                  );
                })}
                {scope?.dftIps?.map((ip) => {
                  // DesignInstance 跨层（子块可在任意扫描网络）→ 恒 normal，不随图层变灰/隐藏。
                  const ls = ip.ipType === "DesignInstance" ? "normal" : layerStateOf(catalogBus(ip.ipType), activeLayer, hiddenLayers);
                  if (ls === "hidden") return null;
                  return (
                  <DftIpNode key={ip.id} ip={ip} pos={ipPosIn(ip, activeLayer)} activeLayer={activeLayer} selected={selectedDftIps.includes(ip.id)}
                    dim={ls === "dim" || readOnly}
                    wiring={!!dftWire}
                    dropHover={dftWire && wireHover?.kind === "ip" && wireHover.ipId === ip.id ? wireHover.port : null}
                    onSelect={(additive) => { setSelectedDftWire(null); additive ? toggleDftIp(ip.id, true) : selectDftIp(ip.id); }}
                    onOpenConfig={() => openConfigDialog(ip.id)}
                    onDragMove={(p) => setDragPos({ ipId: ip.id, x: p.x, y: p.y })}
                    onMove={(p) => { setDragPos(null); moveDftIp(scope.id, ip.id, p); }}
                    onPortDown={(ep, at) => { if (!dftWire) dftBeginWire(ep, at); }}
                    onSlotEnter={(ep) => setWireHover(ep)}
                    onSlotLeave={() => setWireHover(null)}
                    onBodyEnter={() => {
                      if (ip.ipType === "Multiplexer") { setMuxHover(ip.id); return; }
                      const plainIn = ip.ipType === "DesignInstance"
                        ? catalogEntry(ip.ipType).ports.find((p) => p.dir === "in" && p.bus === activeLayer)
                        : catalogEntry(ip.ipType).ports.find((p) => p.dir === "in" && p.role !== "clock" && p.role !== "master" && p.role !== "secondary");
                      if (plainIn) setWireHover({ kind: "ip", ipId: ip.id, port: plainIn.name });
                    }}
                    onBodyLeave={() => { setMuxHover(null); setWireHover(null); }}
                    onContextMenu={(e) => { e.evt.preventDefault(); e.cancelBubble = true;
                      const wa = wrapRef.current?.closest(".dft-workarea") as HTMLElement | null;
                      const rect = wa?.getBoundingClientRect();
                      setCtxMenu({ kind: "ip", id: ip.id, x: e.evt.clientX - (rect?.left ?? 0), y: e.evt.clientY - (rect?.top ?? 0) }); }} />
                  );
                })}
                {marquee && (
                  <Rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                    width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                    fill="#2e90fa22" stroke="#2e90fa" strokeWidth={1} dash={[4, 4]} listening={false} />
                )}
                {dftWire && cursor && scope && (() => {
                  // 预览用与落定实线完全相同的路由/锚点算法：源端 float 就地选边，
                  // 悬停到入口时磁吸到该口（终点+朝向都取真实值）→ 松手零跳变；否则跟随光标。
                  // 悬停 EDT 时起点先过 chainAwareFrom（与落线一致）——ScanHost 是 float 盒，视觉无差别但校验一致。
                  const from2 = wireHover ? chainAwareFrom(scope, dftWire.from, wireHover) : dftWire.from;
                  const fromEnd = endpointAnchorEnd(scope, from2, bars, backdropBox, dragPos, activeLayer);
                  if (!fromEnd) return null;
                  // 只对「真能落定」的目标磁吸（validateDftWire 通过）——否则跟随光标，不给出会被拒的假吸附。
                  const canSnap = wireHover && validateDftWire(scope, from2, wireHover) === null;
                  const toEnd: AnchorEnd | null = canSnap ? endpointAnchorEnd(scope, wireHover!, bars, backdropBox, dragPos, activeLayer) : null;
                  const cursorEnd: AnchorEnd = { kind: "fixed", key: "cursor", at: { x: cursor.x, y: cursor.y, dir: { dx: dftWire.at.x <= cursor.x ? -1 : 1, dy: 0 } } };
                  const pv = computeWireAnchors([{ id: "pv", a: fromEnd, b: toEnd ?? cursorEnd }]).get("pv")!;
                  // 磁吸目标是 EDT → 预览也用 chain 线的青色（虚线本就是预览样式）
                  const hoverIp = canSnap && wireHover!.kind === "ip" ? wireHover!.ipId : null;
                  const isChainPv = hoverIp !== null && scope.dftIps?.find((i) => i.id === hoverIp)?.ipType === "Edt";
                  return <Line points={routeOrtho(pv.a, pv.a.dir, pv.b, pv.b.dir, obstacles)} stroke={isChainPv ? "#14b8a6" : "#f79009"} dash={[6, 4]} strokeWidth={1.5} listening={false} />;
                })()}
              </Layer>
            </Stage>
            <div className="dft-zoomctl">
              <button onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 0.8)}>−</button>
              <button className="pct" title="Back to 100%" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1 / view.scale)}>{Math.round(view.scale * 100)}%</button>
              <button onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.25)}>＋</button>
              <button title="Fit to canvas" onClick={() => fit(ws, size)}>⤢</button>
            </div>
          </div>
          {ctxMenu && (
            <div className="dft-ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }}
              onMouseLeave={() => setCtxMenu(null)}>
              {ctxMenu.kind === "ip" ? (() => {
                const ip = scope?.dftIps?.find((i) => i.id === ctxMenu.id);
                return (<>
                  {ip?.ipType !== "DesignInstance" && <>
                    <button onClick={() => { scope && rotateDftIp(scope.id, ctxMenu.id, 1); setCtxMenu(null); }}>Rotate right 90°　R</button>
                    <button onClick={() => { scope && rotateDftIp(scope.id, ctxMenu.id, -1); setCtxMenu(null); }}>Rotate left 90°　⇧R</button>
                  </>}
                  {ip?.ipType === "Multiplexer" && <>
                    <button onClick={() => { scope && flipDftIpH(scope.id, ctxMenu.id); setCtxMenu(null); }}>Flip horizontal　F</button>
                    <button onClick={() => { scope && flipDftIpV(scope.id, ctxMenu.id); setCtxMenu(null); }}>Flip vertical　⇧F</button>
                  </>}
                  {/* The quick path to a shared chain group: select the EDTs, right-click, one
                      name — instead of opening each config dialog and finding Connections/
                      ssh_chain_group by hand. Same field underneath, nothing new to sync. */}
                  {ip?.ipType === "Edt" && (
                    <button onClick={() => {
                      if (!scope) return;
                      const targets = selectedDftIps.includes(ctxMenu.id)
                        ? (scope.dftIps ?? []).filter((i) => selectedDftIps.includes(i.id) && i.ipType === "Edt")
                        : [ip];
                      setCtxMenu(null);
                      void promptText(
                        targets.length > 1
                          ? `ssh_chain_group for ${targets.map((t) => t.instanceName).join(", ")} — one name puts them all on ONE shared group`
                          : `ssh_chain_group for ${ip.instanceName} — empty restores the default (its own name); the same name on several EDTs shares one group`,
                        chainGroupOf(ip),
                      ).then((name) => {
                        if (name === null) return;
                        const g = name.trim();
                        for (const t of targets) {
                          const cfg = { ...(t.config ?? {}) } as DftConfig;
                          const prev = cfg.Connections;
                          const conn = { ...(prev && typeof prev === "object" && !Array.isArray(prev) ? prev : {}) } as DftConfig;
                          if (g) conn.ssh_chain_group = g;
                          else delete conn.ssh_chain_group;
                          cfg.Connections = conn;
                          setDftConfig(scope.id, t.id, cfg);
                        }
                      });
                    }}>
                      Chain group…{selectedDftIps.includes(ctxMenu.id) && selectedDftIps.length > 1 ? `　(${selectedDftIps.length} selected)` : ""}
                    </button>
                  )}
                  <button className="danger" onClick={() => { scope && deleteDftIp(scope.id, ctxMenu.id); setCtxMenu(null); }}>Delete　⌫</button>
                </>);
              })() : (<>
                <button onClick={() => { scope && setDftWireWaypoints(scope.id, ctxMenu.id, []); setCtxMenu(null); }}>Reset routing</button>
                <button className="danger" onClick={() => { scope && removeDftWire(scope.id, ctxMenu.id); setSelectedDftWire(null); setCtxMenu(null); }}>Delete</button>
              </>)}
            </div>
          )}
          {specOpen && (
            <>
              <div className="dft-specresizer" onMouseDown={dragSpec} title="Drag to resize the panel width" />
              <div className="dft-specpanel" style={{ width: specW }}>
                <div className="dft-specpanel-head">
                  <span>DftSpecification{activeLayer === "SSN" ? " (SSN)" : activeLayer === "BSCAN" ? " (BScan)" : activeLayer === "JTAG1838" ? " (1838jtag)" : " (All)"}</span>
                  <span className="dft-specpanel-btns">
                    <button onClick={() => navigator.clipboard?.writeText(specDisplay)}>Copy</button>
                    <button onClick={() => { const d = scope?.designName ?? "dft"; for (const f of specFilesBySection(d, specSections(), specByDomain.JTAG1838)) downloadText(`${d}.${f.relPath.split("/")[1]}.spec`, f.text); }}>Save</button>
                    <button
                      title={specLogicTestDir ? `Writes to ${specLogicTestDir}` : projOpen ? undefined
                        : "No project open and no harden launch context — click to see what's needed"}
                      onClick={() => {
                        const files = specFilesBySection(scope?.designName ?? "dft", specSections(), specByDomain.JTAG1838);
                        if (specLogicTestDir) {
                          // Land beside OCC's dfx_occ_def_point.tcl (spec/logic_test/<domain>/...),
                          // not one level deeper under a redundant "Spec/" — strip that prefix.
                          void writeToDir(specLogicTestDir,
                            files.map((f) => ({ ...f, relPath: f.relPath.replace(/^Spec\//, "") })));
                        } else {
                          void writeToProject(files);
                        }
                      }}>
                      Write to project
                    </button>
                  </span>
                </div>
                <pre className="dft-preview">{specDisplay}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    {configDialogIp && <DftConfigDialog key={configDialogIp} />}
    </>
  );
}
