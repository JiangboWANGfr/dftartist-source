// DFX 配置大弹窗（D4 / spec §5.2）。数据：get-ports + get-netlist(tie)；判定：judge.ts；
// 预览：400ms 防抖调 ctrlgen CLI；确认：store.confirmCtrlIpV3（去画布化：取号 + 写清单，不落画布，一步 undo）。
// 声明式挂载：store.dfxDialog 驱动，M3/T4 起在 shell/App.tsx 全局挂一次（跨工作区）。

import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { dftDesign } from "../../core-bridge/client.ts";
import { dftCtrlgen } from "../../core-bridge/ctrlgen.ts";
import { useStore, type DfxDialog as DfxReq } from "../store.ts";
import { judgePin, parentOf, tclTarget, type Stitch } from "./judge.ts";
import { buildCtrlIpSpec, type DfxRow } from "./build.ts";
import { ctrlIpByModule, moduleNameOf, targetsFromSpec } from "./edit.ts";
import { searchHierarchy, parseHierarchy, type HierHit, type DesignHierarchy } from "../hierarchy.ts";
import { notify } from "../../common/notify.ts";

type Row = DfxRow & { driverLabel: string; auto: readonly Stitch[]; override: "auto" | "mux" | "direct" };
type Target = { nodeId: string; instName: string; designName: string };

/** 生效 stitch：auto 原样；mux 整线 mux；「直连」二落一 —— 有原连接的位（auto mux/replace）
 *  落 replace（删后接），悬空位保持 connect（只接，D7），保证 §4.4 的匹配约束。 */
const effective = (r: Row): Stitch[] =>
  r.override === "auto" ? [...r.auto]
  : r.override === "mux" ? r.auto.map(() => "mux" as Stitch)
  : r.auto.map((s) => (s === "mux" ? "replace" : s));

/** auto 判定的汇总标签："mux" / "直连" / "190直连/2mux"。 */
const autoLabel = (auto: readonly Stitch[]): string => {
  const muxN = auto.filter((s) => s === "mux").length;
  if (muxN === auto.length) return "mux";
  if (muxN === 0) return "direct";
  return `${auto.length - muxN} direct/${muxN} mux`;
};

const rowKey = (r: Pick<Row, "nodeId" | "pin">): string => `${r.nodeId}/${r.pin}`;

/** 拉一个目标实例的引脚行：get-ports（方向/位宽）+ 父层 get-netlist（net/tie → 判定与驱动标签）。
 *  parentOf 为 null（顶层）→ 跳过 netlist，全部按悬空处理。
 *  顺序必须先 netlist 后 ports：深层 nodeId 靠 get-netlist 的惰性祖先展开（M0.2）注册，
 *  并行时 get-ports 可能先到 daemon 而报 unknown nodeId。 */
async function loadRows(nodeId: string, instName: string): Promise<Row[]> {
  const parent = parentOf(nodeId);
  const nl = parent ? await dftDesign.getNetlist({ ownerInstanceId: parent }) : null;
  const ports = await dftDesign.getPorts({ nodeId });
  const conn = new Map(
    (nl?.connections ?? []).filter((c) => c.instanceId === nodeId).map((c) => [c.port, c] as const));
  return ports.ports.map((p): Row => {
    const width = (ports.portWidthOverrides?.[p.name] ?? p.width) || 1;
    const c = conn.get(p.name) ?? { net: "", tie: "" };
    const auto = judgePin({ net: c.net, tie: c.tie }, width);
    const driverLabel = c.tie ? `tie ${c.tie}` : c.net ? `logic (${c.net})` : "floating";
    return { pin: p.name, dir: p.direction, width, nodeId, instName,
             role: "ignore", stitch: [], driverLabel, auto, override: "auto" };
  });
}

export function DfxDialog({ req, onClose }: { req: DfxReq; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const genHierarchy = useStore((s) => s.hierarchy);
  const editModule = req.mode === "edit" ? req.module : null;

  const [targets, setTargets] = useState<Target[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [moduleBase, setModuleBase] = useState("");
  const [filter, setFilter] = useState("");
  const [dirFilter, setDirFilter] = useState<null | "in" | "out">(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [tab, setTab] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 预览：拖宽（previewW=null 用 CSS clamp 默认）+ 展开全宽
  const [previewW, setPreviewW] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  // +添加目标搜索源：优先 genconn 层次；跨工作区（hierarchy tab）为空时惰性 dump 共享 daemon
  const [fetchedHier, setFetchedHier] = useState<DesignHierarchy | null>(null);
  const hierarchy = genHierarchy ?? fetchedHier;

  // dsIndex：edit 复用原号；new 用 moduleDsNext 预览（确认时才真取号，不写回）
  const editEntry = editModule ? ctrlIpByModule(doc, editModule) : undefined;
  const dsIndex = editEntry ? editEntry.spec.dsIndex : doc.moduleDsNext;
  const finalName = moduleNameOf({ schemaVersion: 2, moduleBase: moduleBase.trim() || "?", dsIndex, pins: [] });

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 打开时一次：解析目标 → 拉引脚 → edit 模式用 spec 反推行状态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let tgs: Target[];
      if (req.mode === "new") {
        // M3：DFX Ctrl tab 双击实例块 → 以 daemon 层次路径为目标（loadRows 走 get-netlist+get-ports）。
        // get-ports 不带模块名 → designName 退回 nodeId 末段；moduleBase 默认 = designName + "_ctrl"。
        const seg = req.seedNodeId.split(".").pop() ?? req.seedNodeId;
        tgs = [{ nodeId: req.seedNodeId, instName: seg, designName: seg }];
        setModuleBase(`${seg}_ctrl`);
      } else {
        const entry = ctrlIpByModule(doc, req.module);
        if (!entry) { notify(`DFX modification not found: ${req.module}`); onClose(); return; }
        setModuleBase(entry.spec.moduleBase);
        // V3 去画布化:DocCtrlIp.targets 已废弃(confirmCtrlIpV3 只写 spec)。目标从 spec.pins[].target
        // 反查(唯一真源),否则引脚表空 → 再确认覆盖成空 spec = 数据丢失。designName 尽力查库(M3 daemon
        // 实例多半查不到 → 退回实例名,仅影响标签显示)。
        tgs = targetsFromSpec(entry.spec, doc.dfxInstances).map((et) => {
          let designName = "";
          for (const d of doc.library.defs) {
            const i = d.childInstances.find((ci) => ci.hierPath === et.nodeId);
            if (i) { designName = doc.library.defs.find((x) => x.id === i.hardenId)?.designName ?? ""; break; }
          }
          return { nodeId: et.nodeId, instName: et.instName, designName };
        });
      }
      setTargets(tgs);
      // 逐目标降级：单个目标 getPorts 失败（如反查兜底出无顶层前缀的 nodeId，daemon 查不到）
      // 不整表清空，只把该目标组置空 + 记一条提示，其余目标照常渲染。
      const settled = await Promise.allSettled(tgs.map((t) => loadRows(t.nodeId, t.instName)));
      if (cancelled) return;
      const failed = tgs.filter((_, i) => settled[i].status === "rejected").map((t) => t.instName);
      let all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      if (req.mode === "edit") {
        const entry = ctrlIpByModule(doc, req.module)!;
        all = all.map((r) => {
          const p = entry.spec.pins.find((x) => x.target === tclTarget(r.nodeId, r.pin));
          if (!p) return r;
          if (p.mode !== "control") return { ...r, role: p.mode };
          const st: Stitch[] = Array.isArray(p.stitch)
            ? p.stitch : Array.from({ length: r.width }, () => p.stitch as Stitch);
          const override = st.every((s, i) => s === r.auto[i]) ? ("auto" as const)
            : st.every((s) => s === "mux") ? ("mux" as const) : ("direct" as const);
          return { ...r, role: p.mode, override };
        });
      }
      setRows(all);
      setLoading(false);
      if (failed.length) setErr(`Some targets failed to resolve (no pins): ${failed.join(", ")}`);
    })().catch((e) => {
      if (!cancelled) { setErr(String((e as Error)?.message ?? e)); setLoading(false); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 预览：400ms 防抖，构造预览 spec（ds 号只预览不写回）→ ctrlgen CLI
  const previewSeq = useRef(0);
  useEffect(() => {
    if (loading) return;
    const seq = ++previewSeq.current;
    if (!rows.some((r) => r.role !== "ignore") || !moduleBase.trim()) {
      setFiles([]);
      return;
    }
    const t = setTimeout(() => {
      const specRows: DfxRow[] = rows.map((r) => ({ ...r, stitch: r.role === "control" ? effective(r) : [] }));
      const muxBits = specRows.reduce(
        (n, r) => n + (r.role === "control" ? r.stitch.filter((s) => s === "mux").length : 0), 0);
      const muxDs = Array.from({ length: muxBits }, (_, i) => doc.muxDsNext + i); // 预览号
      const { spec } = buildCtrlIpSpec({ moduleBase: moduleBase.trim(), dsIndex: dsIndex as number, rows: specRows, muxDs });
      dftCtrlgen.gen(spec)
        .then((r) => { if (previewSeq.current === seq) { setFiles(r.files); setErr(null); } })
        .catch((e) => { if (previewSeq.current === seq) { setFiles([]); setErr(String((e as Error)?.message ?? e)); } });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, moduleBase, loading]);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((x) => (rowKey(x) === key ? { ...x, ...patch } : x)));

  // 过滤（子串大小写不敏感，匹配 pin 名）+ 方向 chips
  const q = filter.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (!q || r.pin.toLowerCase().includes(q)) && (!dirFilter || r.dir === dirFilter));
  const inN = rows.filter((r) => r.dir === "in").length;
  const outN = rows.filter((r) => r.dir === "out").length;

  const bulk = (role: "control" | "observe") => {
    const need = role === "control" ? "in" : "out";
    const keys = new Set(visible.filter((r) => r.dir === need).map(rowKey));
    setRows((rs) => rs.map((x) => (keys.has(rowKey(x)) ? { ...x, role } : x)));
  };

  // 「+ 添加目标实例」内嵌搜索。genconn 层次为空（如在 hierarchy 工作区打开弹窗）时，
  // 面板首开即惰性 dump 共享 daemon 补一份层次，使搜索跨工作区可用。
  useEffect(() => {
    if (!addOpen || hierarchy) return;
    let cancelled = false;
    dftDesign.dump()
      .then((raw) => { if (!cancelled) setFetchedHier(parseHierarchy(JSON.stringify(raw))); })
      .catch(() => { /* dump 失败 → 面板照旧提示未载入 */ });
    return () => { cancelled = true; };
  }, [addOpen, hierarchy]);
  const addHits = useMemo(
    () => (hierarchy && addQ.trim() ? searchHierarchy(hierarchy, addQ, 50) : []),
    [hierarchy, addQ]);
  const removeTarget = (nodeId: string) => {
    setTargets((ts) => ts.filter((t) => t.nodeId !== nodeId));
    setRows((rs) => rs.filter((r) => r.nodeId !== nodeId));
  };
  const addTarget = async (hit: HierHit) => {
    setAddOpen(false);
    setAddQ("");
    if (targets.some((t) => t.nodeId === hit.instId)) return;
    setTargets((ts) => [...ts, { nodeId: hit.instId, instName: hit.instanceName, designName: hit.designName }]);
    try {
      const rs = await loadRows(hit.instId, hit.instanceName);
      setRows((old) => [...old, ...rs]);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  };

  const ctlN = rows.filter((r) => r.role === "control").length;
  const obsN = rows.filter((r) => r.role === "observe").length;
  const muxBits = rows.reduce(
    (n, r) => n + (r.role === "control" ? effective(r).filter((s) => s === "mux").length : 0), 0);

  const confirm = () => {
    const base = moduleBase.trim();
    if (!base) { notify("Please fill in the base name"); return; }
    // §4.4：同一目标引脚被两个 ctrl IP 重复控制 → 拦截
    for (const r of rows) {
      if (r.role !== "control") continue;
      const t = tclTarget(r.nodeId, r.pin);
      for (const c of doc.ctrlIps) {
        const mod = moduleNameOf(c.spec);
        if (editModule && mod === editModule) continue;
        if (c.spec.pins.some((p) => p.target === t || p.targets?.includes(t))) {
          notify(`Target ${t} is already occupied by ${mod}`);
          return;
        }
      }
    }
    const specRows: DfxRow[] = rows.map((r) => ({ ...r, stitch: r.role === "control" ? effective(r) : [] }));
    try {
      // M3 去画布化：走 V3（不落 genconn 画布，目标由 spec.pins[].target 承载）。确认即关弹窗（一步 undo）。
      useStore.getState().confirmCtrlIpV3({ editModule, moduleBase: base, rows: specRows });
    } catch (e) {
      notify(`Confirm failed: ${(e as Error)?.message ?? e}`);
    }
  };

  // 分隔条拖拽：以指针捕获跟随，设 previewW（自左侧向左拖 → 预览变宽）。
  const onSplitDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = previewRef.current?.getBoundingClientRect().width ?? 420;
    const onMove = (ev: PointerEvent) =>
      setPreviewW(Math.max(320, Math.min(window.innerWidth - 360, startW + (startX - ev.clientX))));
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const cur = files.find((f) => f.name.endsWith([".v", ".icl", ".tcl"][tab]));

  return (
    <div className="dfx-overlay" data-dfx="dialog" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dfx-box">
        <header className="dfx-head">
          <strong>DFX Ctrl Configuration</strong>
          <label>Base name
            <input data-dfx="base" value={moduleBase} onChange={(e) => setModuleBase(e.target.value)} />
          </label>
          <span className="dfx-final" data-dfx="final">→ {finalName}</span>
          <span className="spacer" />
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </header>

        <div className="dfx-body">
          <div className={`dfx-left${expanded ? " hidden" : ""}`}>
            <div className="dfx-tools">
              <span className="dfx-targets">
                Target instance: {targets.map((t) => `${t.instName}${t.designName ? ` (${t.designName})` : ""}`).join(", ") || "—"}
              </span>
              <button data-dfx="add-target" disabled={loading} onClick={() => setAddOpen((v) => !v)}>+ Add target instance</button>
            </div>
            {addOpen && (
              <div className="dfx-add" data-dfx="add-panel">
                {!hierarchy ? (
                  <div className="dfx-hint">Hierarchy tree not loaded — please load the design hierarchy in the left panel first.</div>
                ) : (
                  <>
                    <input autoFocus placeholder="Search instance/module, supports *" value={addQ} onChange={(e) => setAddQ(e.target.value)} />
                    <ul className="hier-hits">
                      {addHits.map((hit) => (
                        <li key={hit.instId} title={hit.path} onClick={() => void addTarget(hit)}>
                          <span className="hier-inst">{hit.instanceName}</span>
                          <span className="hier-def">{hit.designName}</span>
                          <span className="hier-path">{hit.path}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <div className="dfx-tools">
              <input data-dfx="filter" placeholder="Filter pin name" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button className={`dfx-chip dir-in${dirFilter === "in" ? " on" : ""}`}
                      onClick={() => setDirFilter(dirFilter === "in" ? null : "in")}>in {inN}</button>
              <button className={`dfx-chip dir-out${dirFilter === "out" ? " on" : ""}`}
                      onClick={() => setDirFilter(dirFilter === "out" ? null : "out")}>out {outN}</button>
              <button data-dfx="bulk-control" onClick={() => bulk("control")} title="Set all input pins in the filtered results to control">Filtered results→control</button>
              <button data-dfx="bulk-observe" onClick={() => bulk("observe")} title="Set all output pins in the filtered results to observe">→observe</button>
            </div>
            <div className="dfx-table-wrap">
              {loading ? (
                <div className="dfx-hint">Loading pins…</div>
              ) : (
                <table className="dfx-table">
                  <thead>
                    <tr><th>pin</th><th>dir</th><th>width</th><th>current driver</th><th>role</th><th>stitch</th></tr>
                  </thead>
                  <tbody>
                    {targets.map((t) => {
                      const group = visible.filter((r) => r.nodeId === t.nodeId);
                      return (
                        <Fragment key={t.nodeId}>
                          {targets.length > 1 && (
                            <tr className="dfx-group">
                              <td colSpan={6}>
                                {t.instName}{t.designName ? ` : ${t.designName}` : ""}
                                <button className="dfx-del-target" data-dfx="del-target" title="Remove this target (only removes pins, does not reclaim history)"
                                        onClick={() => removeTarget(t.nodeId)}>✕</button>
                              </td>
                            </tr>
                          )}
                          {group.map((r) => {
                            const key = rowKey(r);
                            return (
                              <tr key={key} data-dfx-row={key}>
                                <td className="dfx-pin">{r.pin}</td>
                                <td className={r.dir === "in" ? "dir-in" : r.dir === "out" ? "dir-out" : "dir-io"}>{r.dir}</td>
                                <td>{r.width}</td>
                                <td className="dfx-drv" title={r.driverLabel}>{r.driverLabel}</td>
                                <td className="dfx-role">
                                  <label title={r.dir === "inout" ? "inout pins are not yet supported" : r.dir !== "in" ? "Control can only be chosen for input pins" : ""}>
                                    <input type="radio" name={`role-${key}`} value="control" disabled={r.dir !== "in"}
                                           checked={r.role === "control"} onChange={() => patchRow(key, { role: "control" })} />Ctrl
                                  </label>
                                  <label title={r.dir === "inout" ? "inout pins are not yet supported" : r.dir !== "out" ? "Observe can only be chosen for output pins" : ""}>
                                    <input type="radio" name={`role-${key}`} value="observe" disabled={r.dir !== "out"}
                                           checked={r.role === "observe"} onChange={() => patchRow(key, { role: "observe" })} />Obs
                                  </label>
                                  <label>
                                    <input type="radio" name={`role-${key}`} value="ignore"
                                           checked={r.role === "ignore"} onChange={() => patchRow(key, { role: "ignore" })} />Ign
                                  </label>
                                </td>
                                <td className="dfx-stitch">
                                  <select disabled={r.role !== "control"}
                                          value={r.role === "control" ? r.override : "-"}
                                          onChange={(e) => patchRow(key, { override: e.target.value as Row["override"] })}>
                                    {r.role === "control" ? (
                                      <>
                                        <option value="auto">auto ({autoLabel(r.auto)})</option>
                                        <option value="mux">mux</option>
                                        <option value="direct">direct</option>
                                      </>
                                    ) : (
                                      <option value="-">—</option>
                                    )}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {!expanded && <div className="dfx-splitter" data-dfx="splitter" onPointerDown={onSplitDown} title="Drag to resize the preview width" />}
          <aside
            ref={previewRef}
            className={`dfx-preview${expanded ? " expanded" : ""}`}
            style={!expanded && previewW != null ? { flex: `0 0 ${previewW}px` } : undefined}
          >
            <div className="dfx-ptabs">
              {[".v", ".icl", ".tcl"].map((ext, i) => (
                <button key={ext} className={i === tab ? "on" : ""} onClick={() => setTab(i)}>{ext}</button>
              ))}
              <span className="spacer" />
              <button data-dfx="expand" onClick={() => setExpanded((v) => !v)} title={expanded ? "Restore split view" : "Expand to full width"}>
                {expanded ? "⤡ Restore" : "⤢ Expand"}
              </button>
            </div>
            {err ? (
              <div className="dfx-err">{err}</div>
            ) : files.length === 0 ? (
              <div className="dfx-hint">Check control/observe pins to auto-preview the three files…</div>
            ) : (
              <pre className="genprev" data-dfx="preview">{cur?.text ?? ""}</pre>
            )}
          </aside>
        </div>

        <footer className="dfx-foot">
          <span className="dfx-sum" data-dfx="summary">
            {ctlN} control · {obsN} observe selected{muxBits > 0 ? ` (${muxBits} mux)` : ""}
          </span>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" data-dfx="confirm" disabled={ctlN + obsN === 0} onClick={confirm}>Confirm & Generate</button>
        </footer>
      </div>
    </div>
  );
}
