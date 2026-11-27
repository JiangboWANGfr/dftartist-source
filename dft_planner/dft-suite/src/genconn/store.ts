// Zustand store —— 装 GenConnDocument（持久）+ 瞬态 UI 状态。
// F1：先把文档状态 + 与 core 的接线立起来；编辑类 action 在 F5+ 扩展。

import { create } from "zustand";
import { temporal } from "zundo";
import type { GenConnDocument, Id } from "./core/model.ts";
import { emptyDocument, deserialize, serialize } from "./core/document.ts";
import { generateAll, type GenResult } from "./core/generate.ts";
import { chipDoc } from "./core/examples/chip.ts";
import {
  moveInstance as editMove,
  addBlankHarden as editAddBlank,
  addPolygonHarden as editAddPoly,
  addInstanceFromDef as editAddInstance,
  saveDefToLibrary as editSaveToLib,
  removeFromLibrary as editRemoveFromLib,
  updateDefAttrs as editUpdateDef,
  renameInstance as editRename,
  setInstanceIfacePd as editSetInstanceIfacePd,
  addInterface as editAddIface,
  updateInterface as editUpdateIface,
  removeInterface as editRemoveIface,
  setInterfaceEdge as editSetEdge,
  setInterfacePerimeter as editSetPerimeter,
  setInterfacePlacement as editSetPlacement,
  setInterfaceInnerPos as editSetInnerPos,
  setDataSource as editSetDataSource,
  deleteInstance as editDelete,
  reparentInstance as editReparent,
  resizeDef as editResize,
  resizeBox as editResizeBox,
  moveVertex as editMoveVertex,
  setVertices as editSetVerts,
  rotateInstance as editRotate,
  mirrorInstance as editMirror,
  pasteInstances as editPaste,
  portInterface as editPortInterface,
  unportInterface as editUnportInterface,
  type DefAttrs,
  type PasteItem,
} from "./core/edit.ts";
import { upsertCtrlIp, removeCtrlIp, ctrlIpByModule, allocModuleDs, allocMuxDs, moduleNameOf, addDfxInstance, removeDfxInstance } from "./dfx/edit.ts";
import { buildCtrlIpSpec, type DfxRow } from "./dfx/build.ts";
import { addBlocksFromHierarchy as importBlocksCore, addBlockAt, type BlockPayload } from "./importBlocks.ts";
import { nodeToPayload, type DesignHierarchy } from "./hierarchy.ts";
import { reconcilePairs, alignPairs, portedEdge, reconcilePortedEdges, type AlignAnchor } from "./snap.ts";
import { defOutline, defResizeDims, BOX_W, BOX_H } from "./layout.ts";
import { addWire, orthAppend, orthFinish, removeWire as editRemoveWire } from "./wire.ts";
import type { BusInterface, HardenDef } from "./core/model.ts";
import { type BusType } from "./layers.ts";
import {
  addToSpecgen as dftAddToSpecgen,
  addDftIp as dftAddIp,
  moveDftIp as dftMoveIp,
  deleteDftIp as dftDeleteIp,
  setDftIpConfig as dftSetConfig,
  renameDftIp as dftRenameIp,
  addDftWire as dftAddWire,
  removeDftWire as dftRemoveWire,
  rotateDftIp as dftRotateIp,
  flipDftIpH as dftFlipIpH,
  flipDftIpV as dftFlipIpV,
  setDftWireWaypoints as dftSetWaypoints,
  syncDesignInstances as dftSyncDesignInstances,
  migrateLegacyIpNames as dftMigrateLegacyIpNames,
  applyAutoLayout as dftApplyAutoLayout,
  ipPosIn as dftIpPosIn,
  isCrossLayerIp as dftIsCrossLayerIp,
  clearDftScope as dftClearScope,
  removeFromSpecgen as dftRemoveFromSpecgen,
} from "../specgen/edit.ts";
import { validateDftWire } from "../specgen/wire.ts";
import { autoLayoutPositions } from "../specgen/layout.ts";
import { catalogBus } from "../specgen/catalog.ts";
import type { DftIpType, DftEndpoint, DftConfig, DftIpInstance } from "./core/dft-model.ts";
import { notify } from "../common/notify.ts";

export type Selection = { kind: "instance" | "interface" | "def" | "wire" | null; id: Id | null; instId?: Id };

/** DFX 配置弹窗请求（瞬态）：编辑已有条目（按终模块名），或从 DFX Ctrl tab 的实例块新建
 *  （seedNodeId = daemon 层次路径，M3/T3；T4 补全 loadRows）。 */
export type DfxDialog =
  | { mode: "edit"; module: string }
  | { mode: "new"; seedNodeId: string };

/** 剪贴板项（瞬态，不进 undo）：复制选中实例时记录 def 引用 + 摆位/朝向 + 命名基。 */
export type ClipItem = PasteItem;

const GRID = 20; // 网格步长（粘贴/复制偏移、方向键微移）

const gsnap = (v: number): number => Math.round(v / 20) * 20;

/** 编辑收尾：提升对互跟（B↔X）→ 自动配对对齐 → 连接对账。anchor = 刚被拖动方（同 alignPairs）。 */
const settle = (doc: GenConnDocument, anchor?: AlignAnchor): GenConnDocument =>
  reconcilePairs(alignPairs(reconcilePortedEdges(doc, anchor), anchor));

/** 开机不再自动恢复 localStorage（修「重开残留上次画布」）——冷启动为空文档；
 *  工程打开时由 lifecycle 载入该工程的 genconn 文档。 */
function initialDoc(): GenConnDocument {
  return emptyDocument("chip");
}

export interface AppState {
  // —— 持久 ——
  doc: GenConnDocument;
  // —— 瞬态 ——
  dirty: boolean;
  genOpen: boolean; // 生成面板开合
  polyDraw: boolean; // 画多边形模式
  activeLayer: BusType | null; // 活动图层（null=全部正常）；非活动层变灰+锁
  hiddenLayers: Set<BusType>; // 显式隐藏的图层（与 hideWires 并存）
  selection: Selection;
  selectedIds: Id[]; // 多选的实例集合（画布高亮 + 一起移动；单选时 = [selection.id]）
  navStack: { defId: Id; instId?: Id }[]; // 层次路径：每层=进入的 def + 所点实例（root 无 instId）
  viewCenter: { x: number; y: number }; // 画布视口中心（画布坐标），新 harden 落在这里
  canvasView: { scale: number; pos: { x: number; y: number }; fittedDefId: Id | null }; // 画布缩放/平移 + 已自动 fit 的层 id；存 store 跨卸载/重挂保留（切 tab 回来不自动放大）
  setCanvasView: (v: Partial<{ scale: number; pos: { x: number; y: number }; fittedDefId: Id | null }>) => void;
  clipboard: ClipItem[]; // 复制/剪切的实例快照（瞬态，不进 undo/persist）
  hierarchy: DesignHierarchy | null; // 导入的设计层次树（外部来源调色板，瞬态，不进 doc/undo/persist）
  rtlFiles: Record<string, string>; // 上传 RTL 的原文（path/basename → text，瞬态，供「导出带 DFT 的 .v」用，不持久化）
  /** DFX 配置弹窗请求（瞬态） */
  dfxDialog: DfxDialog | null;
  // —— SpecGen（DFT）瞬态 ——（tab 切换用 design.workspace，SpecGen tab 在 T6 接）
  specgenScope: Id | null; // SpecGen 当前打开的 scope harden
  selectedDftIps: Id[]; // SpecGen 选中的 DFT IP（多选）
  configDialogIp: Id | null; // 当前打开配参弹窗的 DFT IP（瞬态）
  dftWire: { from: DftEndpoint; at: { x: number; y: number } } | null; // DFT 拉线草稿（瞬态）
  arrangeSnapshot: { defId: Id; layer: BusType | null; positions: Record<Id, { x: number; y: number }>; mirror: Record<Id, boolean> } | null; // 自动排列前快照（瞬态，不进 undo/persist）；非空且 defId+layer 匹配 → 按钮变「恢复排列」
  wire: { sourceInstId: Id; sourceIfId: Id; points: { x: number; y: number }[]; pd?: string } | null; // data source 拉线草稿（瞬态，不进 undo）
  hideWires: boolean; // 隐藏已提交连线折线（纯视图，不动连接/配对）

  // —— 文档级 ——
  newDoc: (rootName: string) => void;
  openText: (text: string) => void; // 解析 + 校验后载入；抛错由调用方处理
  toText: () => string; // 序列化当前文档（存盘用）
  markSaved: () => void;

  // —— 编辑 ——
  moveInstance: (instId: Id, pos: { x: number; y: number }) => void;
  addBlankHarden: () => void;
  addPolygonHarden: (points: { x: number; y: number }[]) => void;
  setPolyDraw: (v: boolean) => void;
  /** 设活动图层（再点同层=取消，回全部）。切层清选，避免对灰/隐藏项按 Del。 */
  setActiveLayer: (bt: BusType | null) => void;
  /** 切换某图层显隐。 */
  toggleLayerHidden: (bt: BusType) => void;
  addInstanceFromDef: (defId: Id) => void;
  /** 从 Hierarchyshower 导出的 *.blocks.json 增量导入（落到 open def，一步 undo）。 */
  importBlocks: (payloads: BlockPayload[]) => { added: number; skipped: string[] };
  /** 载入 pyslang 导出的设计层次树（替换当前树；不动画布文档）。 */
  loadHierarchy: (h: DesignHierarchy) => void;
  setRtlFiles: (files: { path: string; text: string }[]) => void;
  /** 从层次树拖一个节点落到画布 at 处：建/复用块并填 instanceName/模块名/文件（一步 undo）。 */
  dropHierarchyNode: (instId: string, at: { x: number; y: number }) => void;
  saveDefToLibrary: (defId: Id, name?: string) => void;
  removeFromLibrary: (defId: Id) => void;
  updateDefAttrs: (defId: Id, patch: DefAttrs) => void;
  /** 切换某 def 的"隐藏下层"（作为子块时是否画黑盒）。影响其所有实例。 */
  toggleDefChildren: (defId: Id) => void;
  renameInstance: (instId: Id, name: string) => void;
  /** 设/清某实例对某 BISR 接口的 pd 覆盖（仅本实例匹配用，不进端口名）。 */
  setInstanceIfacePd: (instId: Id, ifId: Id, pd?: string) => void;
  addInterface: (defId: Id, spec: Omit<BusInterface, "id">) => void;
  updateInterface: (defId: Id, ifId: Id, patch: Partial<BusInterface>) => void;
  removeInterface: (defId: Id, ifId: Id) => void;
  setInterfaceEdge: (defId: Id, ifId: Id, side: "top" | "bottom" | "left" | "right", offset: number) => void;
  setInterfacePerimeter: (defId: Id, ifId: Id, side: "top" | "bottom" | "left" | "right", perimeter: number) => void;
  /** 标记/取消某接口为 data source（纯视图）。 */
  setDataSource: (defId: Id, ifId: Id, isDataSource: boolean) => void;
  /** 设某 data source client 接口的摆放 pin/other（纯视图；other 仅 data source client 合法）。 */
  setInterfacePlacement: (defId: Id, ifId: Id, placement: "pin" | "other") => void;
  /** 设 placement=other 接口在盒内的位置（纯视图）。 */
  setInterfaceInnerPos: (defId: Id, ifId: Id, pos: { x: number; y: number }) => void;
  deleteInstance: (instId: Id) => void;
  /** 把子块实例(instId)的接口(ifId)提升到本层边界（新建同款边界接口 + portedFrom）。 */
  portInterface: (instId: Id, ifId: Id) => void;
  /** 取消提升：删掉本层某个 portedFrom 边界接口。 */
  unportInterface: (boundaryIfId: Id) => void;
  reparentInstance: (instId: Id, targetDefId: Id, relPos: { x: number; y: number }) => void;
  resizeDef: (defId: Id, w: number, h: number) => void;
  resizeBox: (instId: Id, x: number, y: number, w: number, h: number) => void;
  moveVertex: (defId: Id, index: number, pos: { x: number; y: number }) => void;
  setVertices: (defId: Id, verts: { x: number; y: number }[] | undefined) => void;
  drillInto: (instId: Id, defId: Id) => void;
  gotoCrumb: (index: number) => void;
  select: (sel: Selection) => void;
  /** 点接口条：选中它（在右侧看信息）。配对靠几何自动完成，不在点击里做。 */
  selectInterface: (instId: Id, ifId: Id) => void;

  // —— 多选 ——
  selectInstance: (instId: Id, additive: boolean) => void; // additive=Shift 切换加入/移出
  selectInstances: (ids: Id[]) => void; // 框选：一次性设为选中
  selectAll: () => void; // Ctrl/Cmd+A：全选当前层实例
  clearSelection: () => void;
  moveSelectedBy: (dx: number, dy: number) => void; // 多选一起平移（已网格吸附）
  deleteSelected: () => void;
  /** ctrl 多选的接口集合（"instId/ifId"；瞬态，不进 undo）。提升/批量删除共用。 */
  portSel: Set<string>;
  setPortSel: (v: Set<string>) => void;
  // —— 拖动实时状态（瞬态；只有 CommittedWires 订阅 → 拖动中不重渲染实例树，wire 端点实时跟随）——
  dragInstLive: { anchorId: Id; dx: number; dy: number; group: boolean } | null;
  setDragInstLive: (v: { anchorId: Id; dx: number; dy: number; group: boolean } | null) => void;
  dragBarLive: { instId: Id; ifId: Id; x: number; y: number; side: "left" | "right" | "top" | "bottom" } | null;
  setDragBarLive: (v: { instId: Id; ifId: Id; x: number; y: number; side: "left" | "right" | "top" | "bottom" } | null) => void;
  dragCardLive: { instId: Id; ifId: Id; x: number; y: number } | null;
  setDragCardLive: (v: { instId: Id; ifId: Id; x: number; y: number } | null) => void;
  /** 批量删除 portSel 里的接口（按 def+ifId 去重；接口是 def 级）。 */
  deletePortSel: () => void;
  setViewCenter: (c: { x: number; y: number }) => void;

  // —— 实例编辑（旋转/镜像/复制粘贴/微移）——
  rotateSelected: (dir: "cw" | "ccw") => void;
  mirrorSelected: (axis: "h" | "v") => void;
  copySelection: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  nudgeSelected: (dx: number, dy: number) => void;

  // —— 画线（data source 拉线）——
  /** 从 data source out 脚起线：记起点（open def 坐标），进入画线态。 */
  beginWire: (instId: Id, ifId: Id, at: { x: number; y: number }, pd?: string) => void;
  /** 落一个折线拐点（正交吸附到上一点的轴）。 */
  wirePoint: (pt: { x: number; y: number }) => void;
  /** 退一个折线拐点（保留起点 out 脚、保持画线态；退到只剩起点则取消整条）。 */
  wireUndoPoint: () => void;
  /** 收线（点 in 脚）：跑 addWire 引擎生成 secondary/client + 连接；error/unresolved 弹窗提示，成功则落 doc。axis 给了则末段沿该轴精确进入 at（orthFinish）。 */
  commitWire: (inInstId: Id, inIfId: Id, at: { x: number; y: number }, axis?: "h" | "v") => void;
  cancelWire: () => void;
  /** 删一条已提交 wire（连同它建立的 manual 连接）。 */
  removeWire: (wireId: Id) => void;
  /** 切换「隐藏已画连线折线」（纯视图，不动连接/配对/生成）。 */
  toggleHideWires: () => void;

  // —— 导航 ——
  openDef: (defId: Id) => void;
  setRoot: (defId: Id) => void;

  // —— DFT / SpecGen ——
  addToSpecgen: (defId: Id) => void;
  openSpecgenScope: (defId: Id) => void;
  addDftIp: (defId: Id, ipType: DftIpType, pos?: { x: number; y: number }) => void;
  moveDftIp: (defId: Id, ipId: Id, pos: { x: number; y: number }) => void;
  deleteDftIp: (defId: Id, ipId: Id) => void;
  selectDftIp: (ipId: Id | null) => void;          // 单选便捷（写数组）
  selectDftIps: (ipIds: Id[]) => void;             // 框选结算：整批替换
  toggleDftIp: (ipId: Id, additive: boolean) => void;
  selectAllDftIps: (defId: Id) => void;
  clearDftSelection: () => void;
  deleteDftIps: (defId: Id, ipIds: Id[]) => void;
  clearDftScope: (defId: Id) => void;
  removeFromSpecgen: (defId: Id) => void;
  openConfigDialog: (ipId: Id | null) => void;
  setDftConfig: (defId: Id, ipId: Id, config: DftConfig) => void;
  renameDftIp: (defId: Id, ipId: Id, name: string) => void;
  dftBeginWire: (from: DftEndpoint, at: { x: number; y: number }) => void;
  dftCancelWire: () => void;
  /** fromOverride：调用方先做过端点映射（如 chainAwareFrom）时传映射后的起点，校验与落线都用它。 */
  dftCommitWire: (defId: Id, to: DftEndpoint, fromOverride?: DftEndpoint) => void;
  removeDftWire: (defId: Id, wireId: Id) => void;
  autoArrangeDft: (defId: Id, viewH?: number, viewW?: number) => void;
  syncDesignInstances: (defId: Id) => void;
  rotateDftIp: (defId: Id, ipId: Id, dir?: 1 | -1) => void;
  flipDftIpH: (defId: Id, ipId: Id) => void;
  flipDftIpV: (defId: Id, ipId: Id) => void;
  setDftWireWaypoints: (defId: Id, wireId: Id, waypoints: { x: number; y: number }[]) => void;

  // —— 生成（调 core）——
  generate: () => GenResult[];
  setGenOpen: (v: boolean) => void;

  // —— DFX Ctrl ——
  openDfxDialog: (d: DfxDialog) => void;
  closeDfxDialog: () => void;

  // —— DFX Ctrl（M3 去画布化）——
  /** 把实例 nodeId 加入 DFX Ctrl tab（去重，一步 undo）。 */
  addDfxInstance: (nodeId: string) => void;
  /** 从 DFX Ctrl tab 移除一个实例 nodeId（一步 undo）。 */
  removeDfxInstance: (nodeId: string) => void;
  /** 去画布化删除一条 ctrlIp：纯 removeCtrlIp，一次 set = 一步 undo（不碰画布/ctrlInstId）。 */
  deleteCtrlIpV3: (mod: string) => void;
  /** 弹窗确认（去画布化）：取号 → buildCtrlIpSpec → 写清单 + 关弹窗（一次 set = 一步 undo）。
   *  editModule = 再编辑的原终模块名（复用 dsIndex）；null = 新建（分配模块号）。
   *  不落 genconn 画布：无画布落块/ctrlInstId，目标由 spec.pins[].target 承载。 */
  confirmCtrlIpV3: (args: { editModule: string | null; moduleBase: string; rows: DfxRow[] }) => void;

  // —— 示例 ——
  loadExample: () => void;
}

/** 按图层顺序取第一个「有该 busType 接口或该 bus 的 IP」的层；都没有则 null。 */
function firstContentLayer(def: HardenDef | undefined): BusType | null {
  if (!def) return null;
  for (const bt of ["SSN", "BSCAN"] as const) {
    const hasIface = def.interfaces.some((i) => i.busType === bt);
    const hasIp = (def.dftIps ?? []).some((ip) => ip.ipType !== "DesignInstance" && catalogBus(ip.ipType) === bt);
    if (hasIface || hasIp) return bt;
  }
  return null;
}

export const useStore = create<AppState>()(
  temporal(
    (set, get) => {
  const init = initialDoc();
  return {
  doc: init,
  dirty: false,
  genOpen: false,
  polyDraw: false,
  activeLayer: null,
  hiddenLayers: new Set(),
  selection: { kind: null, id: null },
  selectedIds: [],
  navStack: [{ defId: init.ui.openDefId }],
  viewCenter: { x: 200, y: 160 },
  canvasView: { scale: 1, pos: { x: 40, y: 40 }, fittedDefId: null },
  setCanvasView: (v) => set((s) => ({ canvasView: { ...s.canvasView, ...v } })),
  clipboard: [],
  hierarchy: null,
  rtlFiles: {},
  dfxDialog: null,
  specgenScope: null,
  selectedDftIps: [],
  configDialogIp: null,
  dftWire: null,
  arrangeSnapshot: null,
  wire: null,
  hideWires: false,

  newDoc: (rootName) => {
    const d = emptyDocument(rootName);
    set({ doc: d, dirty: false, navStack: [{ defId: d.ui.openDefId }], selection: { kind: null, id: null }, selectedIds: [] });
  },
  openText: (text) => {
    const d = deserialize(text);
    set({ doc: d, dirty: false, navStack: [{ defId: d.ui.openDefId }], selection: { kind: null, id: null }, selectedIds: [] });
  },
  toText: () => serialize(get().doc),
  markSaved: () => set({ dirty: false }),

  moveInstance: (instId, pos) =>
    set((s) => ({ doc: settle(editMove(s.doc, instId, pos), { instId }), dirty: true })),
  addBlankHarden: () =>
    set((s) => ({ doc: editAddBlank(s.doc, { x: gsnap(s.viewCenter.x - BOX_W / 2), y: gsnap(s.viewCenter.y - BOX_H / 2) }), dirty: true })),
  addPolygonHarden: (points) => set((s) => ({ doc: editAddPoly(s.doc, points), dirty: true, polyDraw: false })),
  setPolyDraw: (v) => set({ polyDraw: v }),
  setActiveLayer: (bt) => set((s) => (s.activeLayer === bt ? {} : { activeLayer: bt, selectedIds: [], selection: { kind: null, id: null }, selectedDftIps: [] })), // 切层清选，避免对灰/隐藏项按 Del
  toggleLayerHidden: (bt) => set((s) => { const h = new Set(s.hiddenLayers); if (h.has(bt)) h.delete(bt); else h.add(bt); return { hiddenLayers: h }; }),
  addInstanceFromDef: (defId) =>
    set((s) => {
      const target = s.doc.library.defs.find((d) => d.id === defId);
      const o = target && defOutline(target);
      const at = o ? { x: gsnap(s.viewCenter.x - o.w / 2), y: gsnap(s.viewCenter.y - o.h / 2) } : undefined;
      return { doc: editAddInstance(s.doc, defId, at), dirty: true };
    }),
  importBlocks: (payloads) => {
    // 一次 set = 一步 undo（与现有 add* 一致）。纯逻辑在 importBlocks.ts，core 未改。
    const { doc, added, skipped } = importBlocksCore(get().doc, payloads);
    if (added > 0) set({ doc, dirty: true });
    return { added, skipped };
  },
  loadHierarchy: (h) => set({ hierarchy: h }),
  setRtlFiles: (files) =>
    set(() => {
      const m: Record<string, string> = {};
      for (const f of files) {
        m[f.path] = f.text;
        const base = f.path.split("/").pop();
        if (base) m[base] = f.text; // 也按 basename 索引，便于和 def.fileName 对上
      }
      return { rtlFiles: m };
    }),
  dropHierarchyNode: (instId, at) =>
    set((s) => {
      if (!s.hierarchy) return {};
      try {
        return { doc: addBlockAt(s.doc, nodeToPayload(s.hierarchy, instId), at), dirty: true };
      } catch {
        return {}; // 落点非法（如把当前层加进它自己）→ 静默忽略
      }
    }),
  saveDefToLibrary: (defId, name) => set((s) => ({ doc: editSaveToLib(s.doc, defId, name), dirty: true })),
  removeFromLibrary: (defId) => set((s) => ({ doc: editRemoveFromLib(s.doc, defId), dirty: true })),
  updateDefAttrs: (defId, patch) => set((s) => ({ doc: editUpdateDef(s.doc, defId, patch), dirty: true })),
  toggleDefChildren: (defId) =>
    set((s) => {
      const def = s.doc.library.defs.find((d) => d.id === defId);
      if (!def) return {};
      return { doc: editUpdateDef(s.doc, defId, { hideChildren: !def.hideChildren }), dirty: true };
    }),
  renameInstance: (instId, name) => set((s) => ({ doc: editRename(s.doc, instId, name), dirty: true })),
  setInstanceIfacePd: (instId, ifId, pd) =>
    set((s) => ({ doc: settle(editSetInstanceIfacePd(s.doc, instId, ifId, pd), { instId }), dirty: true })),
  // 接口的增/改/删都可能改变兼容性 → 改完即重算配对（不必再手动挪一下接口）
  addInterface: (defId, spec) => set((s) => ({ doc: settle(editAddIface(s.doc, defId, spec)), dirty: true })),
  updateInterface: (defId, ifId, patch) => set((s) => ({ doc: settle(editUpdateIface(s.doc, defId, ifId, patch), { defIf: { defId, ifId } }), dirty: true })),
  removeInterface: (defId, ifId) => set((s) => ({ doc: reconcilePairs(editRemoveIface(s.doc, defId, ifId)), dirty: true })),
  setInterfaceEdge: (defId, ifId, side, offset) => set((s) => ({ doc: settle(editSetEdge(s.doc, defId, ifId, side, offset), { defIf: { defId, ifId } }), dirty: true })),
  setInterfacePerimeter: (defId, ifId, side, perimeter) => set((s) => ({ doc: settle(editSetPerimeter(s.doc, defId, ifId, side, perimeter), { defIf: { defId, ifId } }), dirty: true })),
  // data source 标记 / 摆放 / 盒内位置都是纯视图字段，不改兼容性 → 不必 settle（同 NP）
  setDataSource: (defId, ifId, isDataSource) => set((s) => ({ doc: editSetDataSource(s.doc, defId, ifId, isDataSource), dirty: true })),
  setInterfacePlacement: (defId, ifId, placement) => set((s) => ({ doc: editSetPlacement(s.doc, defId, ifId, placement), dirty: true })),
  setInterfaceInnerPos: (defId, ifId, pos) => set((s) => ({ doc: editSetInnerPos(s.doc, defId, ifId, pos), dirty: true })),
  deleteInstance: (instId) =>
    set((s) => {
      let doc = editDelete(s.doc, instId);
      // 删子实例后立即清理各 SpecGen scope 的自动 DesignInstance（SpecGen 工作区未挂载时其 useEffect 不跑，否则要等切回 SpecGen 才删）。
      for (const d of doc.library.defs) if (d.inSpecgen) doc = dftSyncDesignInstances(doc, d.id);
      return {
        doc,
        dirty: true,
        selectedIds: s.selectedIds.filter((i) => i !== instId),
        selection: s.selection.id === instId ? { kind: null, id: null } : s.selection,
      };
    }),
  portInterface: (instId, ifId) =>
    set((s) => ({ doc: settle(editPortInterface(s.doc, instId, ifId, portedEdge(s.doc, instId, ifId))), dirty: true })),
  unportInterface: (boundaryIfId) =>
    set((s) => ({ doc: settle(editUnportInterface(s.doc, boundaryIfId)), dirty: true })),
  reparentInstance: (instId, targetDefId, relPos) =>
    set((s) => ({ doc: settle(editReparent(s.doc, instId, targetDefId, relPos), { instId }), dirty: true, selection: { kind: null, id: null }, selectedIds: [] })),
  resizeDef: (defId, w, h) => set((s) => ({ doc: editResize(s.doc, defId, w, h), dirty: true })),
  resizeBox: (instId, x, y, w, h) =>
    set((s) => {
      // 传入的是"显示盒"尺寸。旋转 90/270 时 computeLayout 会再次互换 w/h，故写回 def 须用反推尺寸。
      const open = s.doc.library.defs.find((d) => d.id === s.doc.ui.openDefId);
      const inst = open?.childInstances.find((i) => i.id === instId);
      const r = (inst?.rotation ?? 0) as 0 | 90 | 180 | 270;
      const { w: dw, h: dh } = defResizeDims(r, w, h);
      return { doc: settle(editResizeBox(s.doc, instId, x, y, dw, dh), { instId }), dirty: true };
    }),
  moveVertex: (defId, index, pos) => set((s) => ({ doc: editMoveVertex(s.doc, defId, index, pos), dirty: true })),
  setVertices: (defId, verts) => set((s) => ({ doc: editSetVerts(s.doc, defId, verts), dirty: true })),
  drillInto: (instId, defId) =>
    set((s) => ({
      doc: { ...s.doc, ui: { ...s.doc.ui, openDefId: defId } },
      navStack: [...s.navStack, { defId, instId }],
      selection: { kind: null, id: null },
    })),
  gotoCrumb: (index) =>
    set((s) => {
      const stack = s.navStack.slice(0, index + 1);
      return {
        navStack: stack,
        doc: { ...s.doc, ui: { ...s.doc.ui, openDefId: stack[stack.length - 1].defId } },
        selection: { kind: null, id: null },
      };
    }),
  select: (sel) =>
    set({ selection: sel, selectedIds: sel.kind === "instance" && sel.id ? [sel.id] : [] }),

  selectInterface: (instId, ifId) => set({ selection: { kind: "interface", id: ifId, instId }, selectedIds: [] }),

  selectInstance: (instId, additive) =>
    set((s) => {
      if (additive) {
        const has = s.selectedIds.includes(instId);
        const ids = has ? s.selectedIds.filter((i) => i !== instId) : [...s.selectedIds, instId];
        return { selectedIds: ids, selection: ids.length ? { kind: "instance", id: ids[ids.length - 1] } : { kind: null, id: null } };
      }
      return { selectedIds: [instId], selection: { kind: "instance", id: instId } };
    }),

  // 框选：一次性把一组实例设为选中（空数组 = 清空）
  selectInstances: (ids) =>
    set({ selectedIds: ids, selection: ids.length ? { kind: "instance", id: ids[ids.length - 1] } : { kind: null, id: null } }),
  selectAll: () =>
    set((s) => {
      const open = s.doc.library.defs.find((d) => d.id === s.doc.ui.openDefId);
      const ids = open ? open.childInstances.map((i) => i.id) : [];
      return { selectedIds: ids, selection: ids.length === 1 ? { kind: "instance", id: ids[0] } : { kind: null, id: null } };
    }),
  clearSelection: () => set({ selectedIds: [], selection: { kind: null, id: null } }),
  moveSelectedBy: (dx, dy) =>
    set((s) => {
      const open = s.doc.library.defs.find((d) => d.id === s.doc.ui.openDefId);
      if (!open) return {};
      const sel = new Set(s.selectedIds);
      let doc = s.doc;
      for (const inst of open.childInstances) {
        if (!sel.has(inst.id)) continue;
        const p = inst.position ?? { x: 0, y: 0 };
        doc = editMove(doc, inst.id, { x: gsnap(p.x + dx), y: gsnap(p.y + dy) });
      }
      return { doc: settle(doc), dirty: true };
    }),
  deleteSelected: () =>
    set((s) => {
      let doc = s.doc;
      for (const id of s.selectedIds) doc = editDelete(doc, id);
      return {
        doc,
        dirty: true,
        selectedIds: [],
        selection: { kind: null, id: null },
      };
    }),
  portSel: new Set<string>(),
  setPortSel: (v) => set({ portSel: v }),
  dragInstLive: null,
  setDragInstLive: (v) => set({ dragInstLive: v }),
  dragBarLive: null,
  setDragBarLive: (v) => set({ dragBarLive: v }),
  dragCardLive: null,
  setDragCardLive: (v) => set({ dragCardLive: v }),
  deletePortSel: () =>
    set((s) => {
      if (s.portSel.size === 0) return {};
      const open = s.doc.library.defs.find((d) => d.id === s.doc.ui.openDefId);
      const targets = new Set<string>(); // "defId/ifId"（接口是 def 级，跨实例去重）
      for (const k of s.portSel) {
        const i = k.indexOf("/");
        const hardenId = open?.childInstances.find((inst) => inst.id === k.slice(0, i))?.hardenId;
        if (hardenId) targets.add(`${hardenId}/${k.slice(i + 1)}`);
      }
      let doc = s.doc;
      for (const t of targets) { const i = t.indexOf("/"); doc = editRemoveIface(doc, t.slice(0, i), t.slice(i + 1)); }
      return { doc: reconcilePairs(doc), dirty: true, portSel: new Set<string>(), selection: { kind: null, id: null } };
    }),
  setViewCenter: (c) => set({ viewCenter: c }),

  // —— 实例编辑 ——
  rotateSelected: (dir) =>
    set((s) => {
      let doc = s.doc;
      for (const id of s.selectedIds) doc = editRotate(doc, id, dir);
      return { doc: settle(doc), dirty: true };
    }),
  mirrorSelected: (axis) =>
    set((s) => {
      let doc = s.doc;
      for (const id of s.selectedIds) doc = editMirror(doc, id, axis);
      return { doc: settle(doc), dirty: true };
    }),
  copySelection: () =>
    set((s) => {
      const open = s.doc.library.defs.find((d) => d.id === s.doc.ui.openDefId);
      if (!open) return {};
      const sel = new Set(s.selectedIds);
      const defName = (hardenId: Id) => s.doc.library.defs.find((d) => d.id === hardenId)?.designName ?? "inst";
      const clipboard: ClipItem[] = open.childInstances
        .filter((i) => sel.has(i.id))
        .map((i) => ({ hardenId: i.hardenId, position: i.position, rotation: i.rotation, mirror: i.mirror, baseName: defName(i.hardenId) }));
      return { clipboard };
    }),
  cut: () => {
    get().copySelection();
    get().deleteSelected();
  },
  paste: () =>
    set((s) => {
      if (s.clipboard.length === 0) return {};
      const { doc, newIds } = editPaste(s.doc, s.clipboard, GRID, GRID);
      if (newIds.length === 0) return {};
      return {
        doc: settle(doc),
        dirty: true,
        selectedIds: newIds,
        selection: newIds.length === 1 ? { kind: "instance", id: newIds[0] } : { kind: null, id: null },
      };
    }),
  duplicate: () =>
    set((s) => {
      const open = s.doc.library.defs.find((d) => d.id === s.doc.ui.openDefId);
      if (!open) return {};
      const sel = new Set(s.selectedIds);
      const defName = (hardenId: Id) => s.doc.library.defs.find((d) => d.id === hardenId)?.designName ?? "inst";
      const items: PasteItem[] = open.childInstances
        .filter((i) => sel.has(i.id))
        .map((i) => ({ hardenId: i.hardenId, position: i.position, rotation: i.rotation, mirror: i.mirror, baseName: defName(i.hardenId) }));
      if (items.length === 0) return {};
      const { doc, newIds } = editPaste(s.doc, items, GRID, GRID);
      if (newIds.length === 0) return {};
      return {
        doc: settle(doc),
        dirty: true,
        selectedIds: newIds,
        selection: newIds.length === 1 ? { kind: "instance", id: newIds[0] } : { kind: null, id: null },
      };
    }),
  nudgeSelected: (dx, dy) => get().moveSelectedBy(dx, dy),

  // —— 画线（data source 拉线）——（wire 是瞬态、不进 zundo partialize；落 doc 后的编辑才可撤销）
  beginWire: (instId, ifId, at, pd) => set({ wire: { sourceInstId: instId, sourceIfId: ifId, points: [at], pd } }),
  wirePoint: (pt) => set((s) => (s.wire ? { wire: { ...s.wire, points: orthAppend(s.wire.points, pt) } } : {})),
  wireUndoPoint: () => set((s) => (s.wire && s.wire.points.length > 1 ? { wire: { ...s.wire, points: s.wire.points.slice(0, -1) } } : {})), // 退一个拐点；保留起点(out 脚)、保持画线态
  commitWire: (inInstId, inIfId, at, axis) =>
    set((s) => {
      if (!s.wire) return {};
      const pts = axis ? orthFinish(s.wire.points, at, axis) : orthAppend(s.wire.points, at);
      const inEnd = inIfId ? { instId: inInstId, ifId: inIfId } : undefined; // 收在 DS ◀ 脚 → 记到 wire（端点绑定用）
      const r = addWire(s.doc, s.wire.sourceInstId, s.wire.sourceIfId, pts, s.wire.pd, inEnd);
      if (r.error) {
        notify(r.error);
        return { wire: null };
      }
      if (r.unresolved && r.unresolved.length) {
        notify(`These instances could not be auto-paired; please adjust orientation manually and retry: ${r.unresolved.join(", ")}`);
        return { wire: null };
      }
      return { doc: r.doc, wire: null, dirty: true };
    }),
  cancelWire: () => set({ wire: null }),
  removeWire: (wireId) => set((s) => ({ doc: reconcilePairs(editRemoveWire(s.doc, wireId)), dirty: true })),
  toggleHideWires: () => set((s) => ({ hideWires: !s.hideWires })),

  openDef: (defId) =>
    set((s) => ({ doc: { ...s.doc, ui: { ...s.doc.ui, openDefId: defId } } })),
  setRoot: (defId) =>
    set((s) => ({ doc: { ...s.doc, ui: { ...s.doc.ui, rootDefId: defId } }, dirty: true })),

  // —— DFT / SpecGen ——（tab 切换 T6 接；此处只管 scope/doc）
  addToSpecgen: (defId) =>
    set((s) => {
      const doc = dftSyncDesignInstances(dftAddToSpecgen(s.doc, defId), defId);
      const layer = firstContentLayer(doc.library.defs.find((d) => d.id === defId));
      return { doc, specgenScope: defId, selectedDftIps: [], activeLayer: layer, dirty: true };
    }),
  openSpecgenScope: (defId) => set((s) => {
    const next = dftMigrateLegacyIpNames(dftSyncDesignInstances(s.doc, defId), defId);
    const layer = firstContentLayer(next.library.defs.find((d) => d.id === defId));
    const base = { specgenScope: defId, selectedDftIps: [], activeLayer: layer };
    return next === s.doc ? base : { ...base, doc: next, dirty: true, arrangeSnapshot: null };
  }),
  syncDesignInstances: (defId) => set((s) => {
    const next = dftMigrateLegacyIpNames(dftSyncDesignInstances(s.doc, defId), defId);
    return next === s.doc ? {} : { doc: next, dirty: true, arrangeSnapshot: null };
  }),
  openConfigDialog: (ipId) => set({ configDialogIp: ipId }),
  setDftConfig: (defId, ipId, config) => set((s) => ({ doc: dftSetConfig(s.doc, defId, ipId, config), dirty: true })),
  renameDftIp: (defId, ipId, name) => set((s) => ({ doc: dftRenameIp(s.doc, defId, ipId, name), dirty: true })),
  addDftIp: (defId, ipType, pos) => set((s) => ({ doc: dftAddIp(s.doc, defId, ipType, pos, s.activeLayer), dirty: true, arrangeSnapshot: null })),
  moveDftIp: (defId, ipId, pos) => set((s) => ({ doc: dftMoveIp(s.doc, defId, ipId, pos, s.activeLayer), dirty: true, arrangeSnapshot: null })),
  deleteDftIp: (defId, ipId) => set((s) => ({ doc: dftDeleteIp(s.doc, defId, ipId), selectedDftIps: [], dirty: true, arrangeSnapshot: null })),
  selectDftIp: (ipId) => set({ selectedDftIps: ipId ? [ipId] : [] }),
  selectDftIps: (ipIds) => set({ selectedDftIps: ipIds }),
  toggleDftIp: (ipId, additive) => set((s) => {
    if (!additive) return { selectedDftIps: [ipId] };
    const has = s.selectedDftIps.includes(ipId);
    return { selectedDftIps: has ? s.selectedDftIps.filter((i) => i !== ipId) : [...s.selectedDftIps, ipId] };
  }),
  selectAllDftIps: (defId) => set((s) => {
    const def = s.doc.library.defs.find((d) => d.id === defId);
    const layer = s.activeLayer;
    const ids = (def?.dftIps ?? [])
      .filter((ip) => !dftIsCrossLayerIp(ip) && (layer === null || catalogBus(ip.ipType) === layer) && !s.hiddenLayers.has(catalogBus(ip.ipType)))
      .map((ip) => ip.id);
    return { selectedDftIps: ids };
  }),
  clearDftSelection: () => set({ selectedDftIps: [] }),
  deleteDftIps: (defId, ipIds) => set((s) => {
    let doc = s.doc;
    for (const id of ipIds) doc = dftDeleteIp(doc, defId, id);
    return { doc, selectedDftIps: [], dirty: true, arrangeSnapshot: null };
  }),
  clearDftScope: (defId) => set((s) => ({ doc: dftClearScope(s.doc, defId), selectedDftIps: [], dirty: true, arrangeSnapshot: null })),
  removeFromSpecgen: (defId) => set((s) => {
    const doc = dftRemoveFromSpecgen(s.doc, defId);
    const stillOpen = s.specgenScope === defId
      ? (doc.library.defs.find((d) => d.inSpecgen && d.id !== defId)?.id ?? null)
      : s.specgenScope;
    return { doc, specgenScope: stillOpen, selectedDftIps: [], dirty: true, arrangeSnapshot: null };
  }),
  dftBeginWire: (from, at) => set({ dftWire: { from, at } }),
  dftCancelWire: () => set({ dftWire: null }),
  dftCommitWire: (defId, to, fromOverride) =>
    set((s) => {
      const draft = s.dftWire;
      const scope = s.doc.library.defs.find((d) => d.id === defId);
      if (!draft || !scope) return { dftWire: null };
      const from = fromOverride ?? draft.from;
      const err = validateDftWire(scope, from, to);
      if (err) {
        notify(err);
        return { dftWire: null };
      }
      return { doc: dftAddWire(s.doc, defId, from, to), dftWire: null, dirty: true, arrangeSnapshot: null };
    }),
  removeDftWire: (defId, wireId) => set((s) => ({ doc: dftRemoveWire(s.doc, defId, wireId), dirty: true, arrangeSnapshot: null })),
  rotateDftIp: (defId, ipId, dir = 1) => set((s) => ({ doc: dftRotateIp(s.doc, defId, ipId, dir), dirty: true, arrangeSnapshot: null })),
  flipDftIpH: (defId, ipId) => set((s) => ({ doc: dftFlipIpH(s.doc, defId, ipId), dirty: true, arrangeSnapshot: null })),
  flipDftIpV: (defId, ipId) => set((s) => ({ doc: dftFlipIpV(s.doc, defId, ipId), dirty: true, arrangeSnapshot: null })),
  setDftWireWaypoints: (defId, wireId, wps) => set((s) => ({ doc: dftSetWaypoints(s.doc, defId, wireId, wps), dirty: true })),
  autoArrangeDft: (defId, viewH, viewW) => set((s) => {
    const scope = s.doc.library.defs.find((d) => d.id === defId);
    if (!scope) return {};
    const layer = s.activeLayer;
    const inLayer = (ip: DftIpInstance) => layer === null ? true : dftIsCrossLayerIp(ip) || catalogBus(ip.ipType) === layer;
    const snap = s.arrangeSnapshot;
    if (snap && snap.defId === defId && snap.layer === layer) {
      // 二次点击（同层）= 恢复排列前的布局
      return { doc: dftApplyAutoLayout(s.doc, defId, { positions: snap.positions, mirror: snap.mirror }, layer), arrangeSnapshot: null, dirty: true };
    }
    const full = autoLayoutPositions(scope, viewH, viewW);
    const positions: Record<Id, { x: number; y: number }> = {};
    const mirror: Record<Id, boolean> = {};
    const snapPos: Record<Id, { x: number; y: number }> = {};
    const snapMir: Record<Id, boolean> = {};
    for (const ip of scope.dftIps ?? []) {
      if (!inLayer(ip)) continue;
      if (full.positions[ip.id]) positions[ip.id] = full.positions[ip.id];
      if (full.mirror[ip.id] !== undefined) mirror[ip.id] = full.mirror[ip.id];
      snapPos[ip.id] = { ...dftIpPosIn(ip, layer) };
      snapMir[ip.id] = ip.mirror ?? false;
    }
    return {
      doc: dftApplyAutoLayout(s.doc, defId, { positions, mirror }, layer),
      arrangeSnapshot: { defId, layer, positions: snapPos, mirror: snapMir },
      dirty: true,
    };
  }),

  generate: () => {
    const { library, ui } = get().doc;
    return generateAll(library, ui.rootDefId);
  },
  setGenOpen: (v) => set({ genOpen: v }),

  // —— DFX Ctrl ——
  openDfxDialog: (d) => set({ dfxDialog: d }),
  closeDfxDialog: () => set({ dfxDialog: null }),

  // —— DFX Ctrl（M3 去画布化）——
  addDfxInstance: (nodeId) => set((s) => ({ doc: addDfxInstance(s.doc, nodeId), dirty: true })),
  removeDfxInstance: (nodeId) => set((s) => ({ doc: removeDfxInstance(s.doc, nodeId), dirty: true })),
  deleteCtrlIpV3: (mod) => set((s) => ({ doc: removeCtrlIp(s.doc, mod), dirty: true })),
  confirmCtrlIpV3: ({ editModule, moduleBase, rows }) =>
    set((s) => {
      let doc = s.doc;
      const prev = editModule ? ctrlIpByModule(doc, editModule) : undefined;
      let dsIndex = prev?.spec.dsIndex; // edit：复用原号；new：分配
      if (!prev) {
        const a = allocModuleDs(doc);
        doc = a.doc;
        dsIndex = a.ds;
      }
      // mux 位数 = 全部 control 行 stitch 里的 "mux" 位；一次取号（只增不回收，D3/A6）
      const muxBits = rows.reduce(
        (n, r) => n + (r.role === "control" ? r.stitch.filter((x) => x === "mux").length : 0), 0);
      const m = allocMuxDs(doc, muxBits);
      doc = m.doc;
      const { spec } = buildCtrlIpSpec({ moduleBase, dsIndex: dsIndex as number, rows, muxDs: m.ds });
      const mod = moduleNameOf(spec);
      // 去画布化：不落 genconn 画布（无画布落块/ctrlInstId），目标由 spec.pins[].target 承载
      if (editModule && editModule !== mod) doc = removeCtrlIp(doc, editModule); // 改基名 → 旧键条目移除
      doc = upsertCtrlIp(doc, { spec });
      // 把本次所有目标 nodeId 登记进 dfxInstances（去重，合进同一 set → 一步 undo）。编辑反查
      // targetsFromSpec 靠 dfxInstances 命中 tcl 路径→完整 nodeId；+add target 不写 doc，故多实例
      // 修改再编辑会反查失败/引脚表空。被控制的实例本就该显示在 DFX tab，语义正确。
      for (const nodeId of new Set(rows.map((r) => r.nodeId))) doc = addDfxInstance(doc, nodeId);
      return { doc, dirty: true, dfxDialog: null };
    }),

  // 深拷贝，避免编辑污染共享示例对象
  loadExample: () => {
    const d = structuredClone(chipDoc);
    set({ doc: d, dirty: true, navStack: [{ defId: d.ui.openDefId }], selection: { kind: null, id: null }, selectedIds: [] });
  },
  };
    },
    { partialize: (s) => ({ doc: s.doc }), equality: (a, b) => a.doc === b.doc, limit: 200 },
  ),
);
