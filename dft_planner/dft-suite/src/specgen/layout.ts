// 仅供 SpecGen 画布 auto-arrange 布局；.spec 生成的唯一真源是 dft-core 的 C++ specgen CLI（本副本漂移只影响排列美观，不影响生成）。
// datapath 线性化：dftWires 有向图 → Tessent 声明序的有序嵌套 DataPath。移植 drawiotest new_main_debug7.py。
import type { HardenDef, Id } from "../genconn/core/model.ts";
import type { DftEndpoint, DftIpInstance, DftIpType, DftConfig } from "../genconn/core/dft-model.ts";
import { catalogEntry } from "./catalog.ts";

export interface ExtraOutput { outputBusWidth: number; chain: DpNode[]; exitInterfaceId?: Id; }
export interface DpNode { type: DftIpType; instanceName: string; id: string; params: DftConfig; smux_secondary?: DpNode[]; moduleName?: string; extra_output_paths?: ExtraOutput[]; secondaryInputDatapathId?: number; secondaryFeedInterfaceId?: Id; }
export interface LinearizedDatapath { order: DpNode[]; entry: DftEndpoint; exit: DftEndpoint; outputBusWidth: number; }

type Key = string;
interface Graph { adj: Map<Key, Key[]>; radj: Map<Key, Key[]>; ipOf: Map<Key, Id | null>; ipById: Map<Id, DftIpInstance>; ifaceIdOf: Map<Key, Id>; }

const keyOf = (ep: DftEndpoint): Key =>
  ep.kind === "ip" ? `ip:${ep.ipId}:${ep.port}` : `if:${ep.instanceId}:${ep.interfaceId}:${ep.pin}`;
const ipPortKey = (ipId: Id, port: string): Key => `ip:${ipId}:${port}`;

function pushMap(m: Map<Key, Key[]>, k: Key, v: Key): void { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

function buildGraph(scope: HardenDef): Graph {
  const adj = new Map<Key, Key[]>(), radj = new Map<Key, Key[]>(), ipOf = new Map<Key, Id | null>();
  const ifaceIdOf = new Map<Key, Id>();
  const ipById = new Map<Id, DftIpInstance>((scope.dftIps ?? []).map((i) => [i.id, i]));
  const addEdge = (a: Key, b: Key) => { pushMap(adj, a, b); pushMap(radj, b, a); };
  const reg = (ep: DftEndpoint) => {
    const k = keyOf(ep);
    if (!ipOf.has(k)) {
      ipOf.set(k, ep.kind === "ip" ? ep.ipId : null);
      if (ep.kind === "iface") ifaceIdOf.set(k, ep.interfaceId);
    }
    return k;
  };
  // chain 端口（ScanHost→EDT 链组挂接）不进 datapath 图：任一端是 role==="chain" 的 IP 端口就跳过。
  const isChainEp = (ep: DftEndpoint): boolean => {
    if (ep.kind !== "ip") return false;
    const ip = ipById.get(ep.ipId);
    return !!ip && catalogEntry(ip.ipType).ports.find((p) => p.name === ep.port)?.role === "chain";
  };
  for (const w of scope.dftWires ?? []) {
    // 现有 EDT 无 chain 角色的 out 口，即使不过滤这条边也进不了主链（BFS 找不到延伸路径）；
    // 这里仍显式过滤，是为未来可能出现的带 out 口的 chain 类型兜底，并减少图里的噪音边。
    if (isChainEp(w.from) || isChainEp(w.to)) continue;
    addEdge(reg(w.from), reg(w.to)); // 真实边（已 out→in）
  }
  for (const ip of scope.dftIps ?? []) {                                  // catalog 派生内部直通边
    const ports = catalogEntry(ip.ipType).ports;
    // secondary 口不加内部直通边：主链只能经 master/普通输入，secondary 纯作支链（buildSmuxSecondary 靠真实 wire radj 回溯，不受影响）。
    const ins = ports.filter((p) => p.dir === "in" && p.role !== "clock" && p.role !== "secondary" && p.role !== "chain");
    const outs = ports.filter((p) => p.dir === "out" && p.role !== "clock" && p.role !== "chain");
    for (const i of ins) for (const o of outs) { const a = ipPortKey(ip.id, i.name), b = ipPortKey(ip.id, o.name); ipOf.set(a, ip.id); ipOf.set(b, ip.id); addEdge(a, b); }
  }
  return { adj, radj, ipOf, ipById, ifaceIdOf };
}

function dedupByKey(eps: DftEndpoint[]): DftEndpoint[] {
  const seen = new Set<Key>(), out: DftEndpoint[] = [];
  for (const e of eps) { const k = keyOf(e); if (!seen.has(k)) { seen.add(k); out.push(e); } }
  return out;
}

function bfsBlockingBoundaries(g: Graph, start: Key, goal: Key): Key[] | null {
  const prev = new Map<Key, Key | null>([[start, null]]); const q = [start];
  while (q.length) {
    const u = q.shift()!; if (u === goal) break;
    for (const v of g.adj.get(u) ?? []) {
      if (prev.has(v)) continue;
      if (v !== goal && g.ipOf.get(v) === null) continue; // 屏蔽中途 iface 边界
      prev.set(v, u); q.push(v);
    }
  }
  if (!prev.has(goal)) return null;
  const path: Key[] = []; let c: Key | null = goal; while (c != null) { path.unshift(c); c = prev.get(c) ?? null; }
  return path;
}

function ipPath(g: Graph, keys: Key[]): Id[] {
  const out: Id[] = [];
  for (const k of keys) { const id = g.ipOf.get(k) ?? null; if (id == null) continue; if (out.length === 0 || out[out.length - 1] !== id) out.push(id); }
  return out;
}
function reversedUnique(ids: Id[]): Id[] {
  const seen = new Set<Id>(), out: Id[] = [];
  for (const id of [...ids].reverse()) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

const buildNode = (g: Graph, ipId: Id): DpNode => {
  const ip = g.ipById.get(ipId)!;
  return { type: ip.ipType, instanceName: ip.instanceName, id: ip.instanceName, params: (ip.config ?? {}) as DftConfig, moduleName: ip.moduleName };
};

function chainBackward(g: Graph, startInKey: Key, stopSet?: Set<Id>): Id[] {
  let cur = startInKey; const out: Id[] = []; const seen = new Set<Key>([cur]);
  while (true) {
    const preds = g.radj.get(cur) ?? []; if (!preds.length) break;
    const nxt = preds[0]; if (seen.has(nxt)) break; seen.add(nxt);
    const owner = g.ipOf.get(nxt) ?? null; if (owner == null) break;
    if (stopSet?.has(owner)) break; // 回溯到 master/主链的汇合点 → 停且不收，避免该 IP 主链/支链各出一次
    if (out.length === 0 || out[out.length - 1] !== owner) out.push(owner);
    cur = nxt;
  }
  return out;
}
/** chainBackward 的变体（同一走法，无 stopSet）：终止时若命中边界接口(owner==null)，一并带出其 interfaceId——
 *  含"接口直连、无中间 IP"的空链情形（preds 第一步就是 iface）。供 mux secondary 喂料源判定用。 */
function chainBackwardToIface(g: Graph, startInKey: Key): { chain: Id[]; ifaceId?: Id } {
  let cur = startInKey; const out: Id[] = []; const seen = new Set<Key>([cur]);
  while (true) {
    const preds = g.radj.get(cur) ?? []; if (!preds.length) return { chain: out };
    const nxt = preds[0]; if (seen.has(nxt)) return { chain: out }; seen.add(nxt);
    const owner = g.ipOf.get(nxt) ?? null;
    if (owner == null) return { chain: out, ifaceId: g.ifaceIdOf.get(nxt) };
    if (out.length === 0 || out[out.length - 1] !== owner) out.push(owner);
    cur = nxt;
  }
}
function buildSmuxSecondary(g: Graph, ipId: Id): DpNode[] | undefined {
  if (g.ipById.get(ipId)?.ipType !== "Multiplexer") return undefined;
  // 先算 master 一侧上游链作停止集：master 与 secondary 若扇出汇合于同一 IP，secondary 止步于该 IP(不含)，
  // 该 IP 留在主链只出一次（对齐参考 main6.py 的 LCA 去重）。
  const stop = new Set<Id>(chainBackward(g, ipPortKey(ipId, "master_bus_data_in")));
  const chain = chainBackward(g, ipPortKey(ipId, "secondary_bus_data_in"), stop);
  return chain.length ? chain.map((id) => buildNode(g, id)) : undefined;
}

/** 从某输入 key 前向沿 adj 走（穿过 IP 内部 in→out + 真实 out→in），收 IP 链；遇 iface 边界/stopSet/seen 停。镜像 chainBackward。
 *  命中边界接口(owner==null)时一并带出其 interfaceId，供 EOP 出口接口判定用。 */
function chainForward(g: Graph, startInKey: Key, stopSet: Set<Id>): { chain: Id[]; ifaceId?: Id } {
  let cur = startInKey; const out: Id[] = []; const seen = new Set<Key>([cur]);
  while (true) {
    const succ = g.adj.get(cur) ?? []; if (!succ.length) return { chain: out };
    const nxt = succ[0]; if (seen.has(nxt)) return { chain: out }; seen.add(nxt);
    const owner = g.ipOf.get(nxt) ?? null;
    if (owner == null) return { chain: out, ifaceId: g.ifaceIdOf.get(nxt) };
    if (stopSet.has(owner)) return { chain: out };
    if (out.length === 0 || out[out.length - 1] !== owner) out.push(owner);
    cur = nxt;
  }
}

/** 主链 IP 的额外输出分支：其 out 口除主路径那条边外的每条出边 = 一条 ExtraOutputPath。 */
function buildExtraOutputs(g: Graph, ipId: Id, mainKeys: Key[], mainIpSet: Set<Id>, defaultWidth: number): ExtraOutput[] | undefined {
  const ip = g.ipById.get(ipId)!;
  const outPort = catalogEntry(ip.ipType).ports.find((p) => p.dir === "out" && p.role !== "clock");
  if (!outPort) return undefined;
  const ok = ipPortKey(ipId, outPort.name);
  const idx = mainKeys.indexOf(ok);
  const mainSucc = idx >= 0 ? mainKeys[idx + 1] : undefined; // 主路径已用的那条出边目标
  const extras: ExtraOutput[] = [];
  for (const v of g.adj.get(ok) ?? []) {
    if (v === mainSucc) continue;
    // 分支声明序 = 数据流序(从分叉点往外)，对齐参考 drawiotest 的 ExtraOutputPath（主链是反转，分支是正向）。
    // stopSet=主链 IP，分支绕回主链即止步不收(不重复)；chainForward 已按访问序去重。
    let chainIds: Id[] = []; let exitInterfaceId: Id | undefined;
    if ((g.ipOf.get(v) ?? null) == null) {
      exitInterfaceId = g.ifaceIdOf.get(v);          // 分支直落接口：零中间 IP，链为空
    } else {
      ({ chain: chainIds, ifaceId: exitInterfaceId } = chainForward(g, v, mainIpSet));
    }
    if (!chainIds.length && exitInterfaceId == null) continue; // 空链且非接口（直连回主链 IP，归 smux）→ 仍跳过
    const chain = chainIds.map((id) => {
      const n = buildNode(g, id);
      const s = buildSmuxSecondary(g, id); if (s) n.smux_secondary = s;
      return n;
    });
    const eo: ExtraOutput = { outputBusWidth: defaultWidth, chain }; // MVP：宽度取主 datapath 宽度（分支自带 exit 宽度的精化留后续）
    if (exitInterfaceId != null) eo.exitInterfaceId = exitInterfaceId;
    extras.push(eo);
  }
  return extras.length ? extras : undefined;
}

/** 自动排列 v2：每段 DataPath（linearizeDatapaths）铺一条"回形带"——数据流方向左→右，超出 foldW 就换行折返
 *  （折返行的 MUX 记 mirror=true，右进左出）；mux secondary 支链贴其所在行的下一行、从 mux 列向上游侧逐列排；
 *  各段回形带依次竖直堆叠(间隔 BAND_GAP)；未接线 IP 落最后一带之下的紧凑网格。
 *  先按顶部=0 铺相对位置，量出整体竖向跨度，再整体下移使其在 viewH 内上下居中；viewW 缺省时退回较宽的固定折返带。
 *  返回 id→位置 + mirror（mirror 只含 MUX 条目，非 MUX 不写，交由调用方保留原值）。 */
export function autoLayoutPositions(scope: HardenDef, viewH?: number, viewW?: number): { positions: Record<Id, { x: number; y: number }>; mirror: Record<Id, boolean> } {
  const ips = scope.dftIps ?? [];
  const byName = new Map(ips.map((i) => [i.instanceName, i.id]));
  const rel: Record<Id, { x: number; y: number }> = {}; // 相对布局：顶部=0，最后整体下移
  const mirror: Record<Id, boolean> = {};
  const placed = new Set<Id>();
  const X0 = 160, COL = 180, ROW = 120, BAND_GAP = 40;
  const foldW = Math.max(COL * 3, (viewW ?? 1200) - X0 - 160);

  let segs: DatapathN[] = [];
  try { segs = linearizeDatapaths(scope); } catch { segs = []; /* datapath 不完整：下面按数组序兜底排一排 */ }

  let bandTop = 0, bandMaxY = 0;
  let branchRows = new Set<number>(); // 本带内支链已占用的行轴(rowY)：主链折返/后续支链落行时跳过，防盒重叠
  const placeNode = (node: DpNode, x: number, rowY: number, dirRun: number): void => {
    const id = byName.get(node.instanceName);
    // 已被前段放置(跨段共享 IP)：跳过重复放置；调用方 x 照常前进，刻意留空列——
    // 保持本段列序与声明序对应，也给跨段连线留出走线空间（比压缩列的视觉歧义小）。
    if (!id || placed.has(id)) return;
    const isMux = node.type === "Multiplexer";
    const y = isMux ? rowY - 20 : rowY;
    rel[id] = { x, y };
    if (isMux) mirror[id] = dirRun === -1;
    placed.add(id);
    if (y > bandMaxY) bandMaxY = y;
  };
  const placeSecondary = (chain: DpNode[], muxX: number, muxRowY: number, dirRun: number): void => {
    let rowY = muxRowY + ROW;
    while (branchRows.has(rowY)) rowY += ROW; // 目标行已被别的支链占用 → 顺延下一行
    branchRows.add(rowY);
    let cx = muxX;
    for (const node of chain) {
      cx += -dirRun * COL;
      placeNode(node, cx, rowY, dirRun);
      if (node.smux_secondary?.length) placeSecondary(node.smux_secondary, cx, rowY, dirRun);
    }
  };

  for (const seg of segs) {
    const chain = [...seg.order].reverse(); // 反回数据流顺序 entry→exit
    let x = X0, rowY = bandTop, dirRun = 1;
    bandMaxY = bandTop;
    branchRows = new Set<number>();
    const foldRow = (): void => { rowY += ROW; while (branchRows.has(rowY)) rowY += ROW; }; // 折返跳过支链占用行
    for (const node of chain) {
      if (dirRun === 1 && x > X0 + foldW) { foldRow(); dirRun = -1; x = X0 + foldW; }
      else if (dirRun === -1 && x < X0) { foldRow(); dirRun = 1; x = X0; }
      placeNode(node, x, rowY, dirRun);
      if (node.smux_secondary?.length) placeSecondary(node.smux_secondary, x, rowY, dirRun);
      x += dirRun * COL;
    }
    bandTop = bandMaxY + 80 + BAND_GAP; // 80 = 最高盒(MUX)
  }

  // EDT 贴 ScanHost：chain 线挂靠的 EDT（EDT 本就不进 datapath 段）放其 ScanHost 正下方一行。
  // 行选取：从 sh 行 +ROW 起，与任何已放置盒竖向重叠（保守按最高盒 80 判）就顺延下一行——主链折返行/支链行/别的 EDT 行都躲开；
  // 列从 ScanHost 列起向右展开（placeNode 未留档行内 dirRun，统一按 +1=向右处理，EDT 无方向性、视觉可接受）。
  const typeOf = new Map(ips.map((i) => [i.id, i.ipType]));
  const edtOf = new Map<Id, Id[]>(); // ScanHost ipId → 其 chain 线挂的 EDT ipId（按线序）
  for (const w of scope.dftWires ?? []) {
    if (w.from.kind !== "ip" || w.to.kind !== "ip") continue;
    if (typeOf.get(w.from.ipId) !== "ScanHost" || typeOf.get(w.to.ipId) !== "Edt") continue;
    const arr = edtOf.get(w.from.ipId);
    if (arr) arr.push(w.to.ipId); else edtOf.set(w.from.ipId, [w.to.ipId]);
  }
  const rowBusy = (y: number): boolean => Object.values(rel).some((p) => y < p.y + 80 && p.y < y + 40);
  for (const [shId, edtIds] of edtOf) {
    const sh = rel[shId];
    if (!sh) continue; // ScanHost 自己没进段（未放置）→ 它和 EDT 都交给兜底网格
    let rowY = sh.y + ROW;
    while (rowBusy(rowY)) rowY += ROW;
    let x = sh.x;
    for (const eId of edtIds) {
      if (placed.has(eId)) continue;
      rel[eId] = { x, y: rowY };
      placed.add(eId);
      x += COL;
    }
    bandTop = Math.max(bandTop, rowY + 40 + BAND_GAP); // 兜底网格保证落在 EDT 行之下
  }

  // 未进任何段的 IP：从最后一带下方起紧凑网格。
  const perRow = Math.floor(foldW / COL) + 1;
  let idx = 0;
  for (const ip of ips) {
    if (placed.has(ip.id)) continue;
    const col = idx % perRow, row = Math.floor(idx / perRow);
    rel[ip.id] = { x: X0 + col * COL, y: bandTop + row * ROW };
    placed.add(ip.id); idx++;
  }

  // 首行 MUX 的 rel.y=-20 会把顶距钳出上边界：先整体下移到非负，再居中。
  const minY = Object.values(rel).reduce((m, p) => Math.min(m, p.y), 0);
  if (minY < 0) for (const p of Object.values(rel)) p.y -= minY;
  // 整体真实跨度 = 最深一行的 y + 最高盒高；据此把整体居中到 viewH。
  const maxY = Object.values(rel).reduce((m, p) => Math.max(m, p.y), 0);
  const top = viewH ? Math.max(80, Math.round((viewH - (maxY + 80)) / 2 / 20) * 20) : 80;
  const positions: Record<Id, { x: number; y: number }> = {};
  for (const id of Object.keys(rel)) positions[id] = { x: Math.round(rel[id].x / 20) * 20, y: Math.round((rel[id].y + top) / 20) * 20 };
  return { positions, mirror };
}

/** 主 datapath 线性化。无合法主路径抛错。 */
export function linearizeDatapath(scope: HardenDef): LinearizedDatapath {
  const g = buildGraph(scope);
  const wires = scope.dftWires ?? [];
  const entries = dedupByKey(wires.map((w) => w.from).filter((e): e is DftEndpoint => e.kind === "iface" && e.pin === "out"));
  const exits = dedupByKey(wires.map((w) => w.to).filter((e): e is DftEndpoint => e.kind === "iface" && e.pin === "in"));
  if (!entries.length || !exits.length) throw new Error("datapath needs one boundary interface as entry (out pin) and one as exit (in pin)");
  const isDS = (ep: DftEndpoint) => ep.kind === "iface" && scope.interfaces.find((f) => f.id === ep.interfaceId)?.isDataSource;
  let entry = entries.find(isDS) ?? entries[0], exit = exits.find(isDS) ?? exits[0], mainKeys: Key[] | null = null;
  outer: for (const en of [entry, ...entries]) for (const ex of [exit, ...exits]) {
    const path = bfsBlockingBoundaries(g, keyOf(en), keyOf(ex));
    if (path) { entry = en; exit = ex; mainKeys = path; break outer; }
  }
  if (!mainKeys) throw new Error("Could not find a main datapath route from entry to exit");
  const mainIpIds = reversedUnique(ipPath(g, mainKeys));
  const mainIpSet = new Set<Id>(mainIpIds);
  const exitBusWidth = (exit.kind === "iface" && scope.interfaces.find((f) => f.id === exit.interfaceId)?.busWidth) || 4;
  const order = mainIpIds.map((ipId) => {
    const node = buildNode(g, ipId);
    const smux = buildSmuxSecondary(g, ipId); if (smux) node.smux_secondary = smux;
    const extra = buildExtraOutputs(g, ipId, mainKeys, mainIpSet, exitBusWidth); if (extra) node.extra_output_paths = extra;
    return node;
  });
  return { order, entry, exit, outputBusWidth: exitBusWidth };
}

export interface DatapathN extends LinearizedDatapath { id: number; }

/** 多段：每个 wired 的边界 out 脚各一段 DataPath；mux secondary 源在别段 → 跨段 input_datapath_id，否则本段 smux_secondary。 */
export function linearizeDatapaths(scope: HardenDef): DatapathN[] {
  const g = buildGraph(scope);
  const wires = scope.dftWires ?? [];
  const entries = dedupByKey(wires.map((w) => w.from).filter((e): e is DftEndpoint => e.kind === "iface" && e.pin === "out"));
  const exits = dedupByKey(wires.map((w) => w.to).filter((e): e is DftEndpoint => e.kind === "iface" && e.pin === "in"));
  if (!entries.length || !exits.length) throw new Error("datapath needs one boundary interface as entry (out pin) and one as exit (in pin)");
  // 每个 entry 找首个可达 exit（优先未被别段用过的 exit，让互穿的两流各落一头）
  type Flow = { entry: DftEndpoint; exit: DftEndpoint; mainKeys: Key[]; mainIpIds: Id[] };
  const flows: Flow[] = []; const usedExit = new Set<Key>();
  for (const en of entries) {
    let found: { ex: DftEndpoint; keys: Key[] } | null = null;
    // exit 候选优先级：①与 entry 同接口的 in 脚（一段 datapath 从哪个接口进就优先从它出）②未被占用的 ③其余。
    const sameIf = exits.filter((x) => x.kind === "iface" && en.kind === "iface" && x.interfaceId === en.interfaceId);
    const unused = exits.filter((x) => !usedExit.has(keyOf(x)));
    for (const ex of dedupByKey([...sameIf, ...unused, ...exits])) {
      const keys = bfsBlockingBoundaries(g, keyOf(en), keyOf(ex));
      if (keys) { found = { ex, keys }; break; }
    }
    if (!found) continue; // 该入口无可达出口 → 跳过
    usedExit.add(keyOf(found.ex));
    flows.push({ entry: en, exit: found.ex, mainKeys: found.keys, mainIpIds: reversedUnique(ipPath(g, found.keys)) });
  }
  if (!flows.length) throw new Error("Could not find a main datapath route from entry to exit");
  const ipToDp = new Map<Id, number>();
  flows.forEach((f, i) => { for (const id of f.mainIpIds) if (!ipToDp.has(id)) ipToDp.set(id, i + 1); });
  return flows.map((f, i) => {
    const dpId = i + 1;
    const { exit } = f;
    const exitBusWidth = (exit.kind === "iface" && scope.interfaces.find((x) => x.id === exit.interfaceId)?.busWidth) || 4;
    const mainIpSet = new Set<Id>(f.mainIpIds);
    const order = f.mainIpIds.map((ipId) => {
      const node = buildNode(g, ipId);
      if (g.ipById.get(ipId)?.ipType === "Multiplexer") {
        const { chain: secChain, ifaceId: secFeedIface } = chainBackwardToIface(g, ipPortKey(ipId, "secondary_bus_data_in")); // 完整源链(无 stopSet)
        const srcIp = secChain.length ? secChain[secChain.length - 1] : undefined;   // 源头 IP
        const srcDp = srcIp != null ? ipToDp.get(srcIp) : undefined;
        if (srcDp != null && srcDp !== dpId) node.secondaryInputDatapathId = srcDp;   // 跨段引用
        else {
          const smux = buildSmuxSecondary(g, ipId); if (smux) node.smux_secondary = smux; // 本段局部
          if (secFeedIface != null) node.secondaryFeedInterfaceId = secFeedIface;          // 喂料源直溯到边界接口
        }
      }
      const extra = buildExtraOutputs(g, ipId, f.mainKeys, mainIpSet, exitBusWidth); if (extra) node.extra_output_paths = extra;
      return node;
    });
    return { id: dpId, order, entry: f.entry, exit: f.exit, outputBusWidth: exitBusWidth };
  });
}
