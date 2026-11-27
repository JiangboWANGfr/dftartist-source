// DFT IP 配参弹窗：左递归树表单编辑 config，右实时 .spec 预览。移植 specgen buildForm/tProp/tSelect。
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../genconn/store.ts";
import { componentSchema, type BlockSchema, type PropSchema } from "./schema.ts";
import { genIpFragment, type SpecData } from "./gen.ts";
import { dftSpecgen } from "../core-bridge/specgen.ts";
import { hasBridge } from "../core-bridge/client.ts";
import { useStore as useHierStore } from "../hierarchy/store.ts";
import { familiesForEdt } from "../hierarchy/core/scanplan.ts";
import { controllerBlock, controllerConfig, mergeSpec, type SpecNode } from "../hierarchy/core/specblock.ts";
import { chainGroupOf } from "./chaingroup.ts";
import { useDesign } from "../store/design.ts";
import type { DftConfig, DftIpInstance } from "../genconn/core/dft-model.ts";
import type { ScanBudgetEdt } from "../core-bridge/model.ts";

type Path = (string | number)[];
const keyOf = (p: Path) => p.join("/");
const getIn = (o: unknown, p: Path): unknown => p.reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k as never]), o);
function setIn(obj: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = (Array.isArray(obj) ? [...obj] : { ...(obj as object ?? {}) }) as Record<string | number, unknown>;
  base[k as never] = setIn((obj as Record<string, unknown>)?.[k as never], rest, value);
  return base;
}
/** 只渲染有内容的子块；props 与 blocks 皆空的桩（嵌套组件/空 ExtraOutputPath/DefaultChildConfiguration）跳过 → 推迟递归。 */
const hasContent = (b: BlockSchema): boolean => (b.props?.length ?? 0) > 0 || (b.blocks?.some(hasContent) ?? false);

/** 递归表单上下文：一次性传下去，避免闭包捕获（Field/Block 必须是稳定的模块级组件，否则每次按键重建 → 输入失焦）。 */
interface FormCtx {
  draft: DftConfig;
  update: (p: Path, v: unknown) => void;
  isOpen: (p: Path, depth: number) => boolean;
  toggle: (p: Path, depth: number) => void;
}

function Field({ prop, path, ctx }: { prop: PropSchema; path: Path; ctx: FormCtx }) {
  const val = (getIn(ctx.draft, path) as string) ?? "";
  return (
    <div className="tline">
      <span className="tprop">{prop.name}</span><span className="tpunc"> : </span>
      {prop.type === "enum" && prop.values ? (
        <select className="tselect" value={val} onChange={(e) => ctx.update(path, e.target.value)}>
          <option value="">—</option>
          {prop.values.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input className="tinput" type="text" value={val} placeholder={prop.placeholder || prop.default || ""} title={prop.spec || ""}
          style={{ width: Math.max(48, val.length * 8 + 16) }} onChange={(e) => ctx.update(path, e.target.value)} />
      )}
      <span className="tpunc"> ;</span>
    </div>
  );
}

function Block({ bs, path, depth, ctx, onDelete }: { bs: BlockSchema; path: Path; depth: number; ctx: FormCtx; onDelete?: () => void }) {
  const open = ctx.isOpen(path, depth);
  const items = bs.blocks?.filter(hasContent) ?? [];
  return (
    <div className="tnode">
      <div className="tline theader">
        <span className="ttoggle" onClick={() => ctx.toggle(path, depth)}>{open ? "−" : "+"}</span>
        <span className="tname">{bs.name}</span>
        {onDelete && <>(<input className="tinput tid" value={(getIn(ctx.draft, [...path, "id"]) as string) ?? ""} onChange={(e) => ctx.update([...path, "id"], e.target.value)} />)</>}
        <span className="tpunc"> {"{"}</span>
        {onDelete && <button className="tdel" onClick={onDelete}>✕</button>}
      </div>
      {open && (
        <div className="tchildren">
          {bs.props?.map((p) => <Field key={p.name} prop={p} path={[...path, p.name]} ctx={ctx} />)}
          {items.map((b) => b.id !== null ? (
            <div key={b.name}>
              {((getIn(ctx.draft, [...path, b.name as string]) as unknown[]) ?? []).map((_, i) => (
                <Block key={i} bs={b} path={[...path, b.name as string, i]} depth={depth + 1} ctx={ctx}
                  onDelete={() => ctx.update([...path, b.name as string], ((getIn(ctx.draft, [...path, b.name as string]) as unknown[]) ?? []).filter((_, j) => j !== i))} />
              ))}
              <button className="tadd" onClick={() => ctx.update([...path, b.name as string], [...((getIn(ctx.draft, [...path, b.name as string]) as unknown[]) ?? []), { id: "" }])}>＋ Add {b.name}</button>
            </div>
          ) : (
            <Block key={b.name} bs={b} path={[...path, b.name as string]} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      )}
      {open && <div className="tline tclose"><span className="tpunc">{"}"}</span></div>}
    </div>
  );
}

/** What the Scan Planner has decided for this controller, shown READ-ONLY.
 *
 * Everything design-level — chain families, which instances this controller covers, the wrapper
 * count — belongs to the Scan Planner, and the dependency runs one way only. Letting this dialog
 * edit any of it is how three EDT dialogs end up with three different ideas of OCC_CHAIN.
 *
 * The numbers are also not typed here. scan_chain_count / longest_chain_range are derived from
 * the cells actually assigned; the reference design in this tree carries `scan_chain_count: 4915`
 * with `longest_chain_range: 360,440` on a design holding 5268 scan cells, and nothing rejected
 * it until insertion ran. `Apply to config` is the one-way door that copies the derived values
 * into the spec fields.
 */
/** Which side wins when the planner's derived config and the engineer's typed config disagree.
 *  Stored INSIDE the config under a non-schema key: generation is schema-driven on both sides
 *  (TS genBlock and the C++ CLI), so the key never reaches the .spec, but it rides along in the
 *  document and survives save/reopen. Absent = planner wins (the default). */
const PRIORITY_KEY = "__planner_priority";
export const plannerWins = (cfg: DftConfig): boolean => cfg[PRIORITY_KEY] !== "user";

function EdtPlanView({ ip, draft, setDraft }: {
  ip: DftIpInstance;
  draft: DftConfig;
  setDraft: React.Dispatch<React.SetStateAction<DftConfig>>;
}) {
  const budget = useHierStore((s) => s.scanBudget);
  const plan = useHierStore((s) => s.scanPlan);
  const defaults = useHierStore((s) => s.edtDefaults);
  const setWorkspace = useDesign((s) => s.setWorkspace);
  const recompute = useHierStore((s) => s.runScanBudgetFromPlan);
  const busy = useHierStore((s) => s.scanBudgetBusy);
  const err = useHierStore((s) => s.scanBudgetError);
  const b = budget?.edts.find((e) => e.name === ip.instanceName);
  const fams = b ? familiesForEdt(plan, defaults, b.name, b.external) : [];
  const [showBlock, setShowBlock] = useState(false);

  // FILL THE FIELDS, do not merely offer to — the WHOLE generated block, not a handful of
  // scalars: Compactor, ShiftPowerOptions and the Connections sub-tree are part of what the
  // Budget page computed, and copying four numbers out of it is what made this dialog look like
  // the planner's data never arrived.
  //
  // WHO WINS is a setting, not a fixed rule. Default: the planner overwrites what was typed —
  // the derived numbers follow the design (cells assigned, families cut), and a hand value that
  // silently survives a recompute is how a spec carries scan_chain_count for a design that no
  // longer exists. Flip the toggle below and the priority reverses: typed values stay, the
  // planner only fills what is empty.
  const derived = useMemo(() => {
    if (!budget || !b) return {};
    const cfg = controllerConfig(budget.edtSpec, b.name);
    // ssh_chain_group does NOT come from the budget block. The group's source of truth is the
    // canvas — this IP's own config, else its instance name (chainGroupOf) — and the budget
    // merely echoes what it was told at compute time. A budget computed before a rename (or by
    // an older engine that hardcoded `edt_gp` for every controller) would otherwise plant a
    // stale group into every dialog it touched, each controller a different one.
    const conn = cfg.Connections;
    if (conn && typeof conn === "object" && !Array.isArray(conn))
      conn.ssh_chain_group = chainGroupOf(ip);
    return cfg;
  }, [budget, b, ip]);
  useEffect(() => {
    if (!b) return;
    setDraft((d) => mergeSpec(d as SpecNode, derived, plannerWins(d)) as DftConfig);
  }, [b, derived, setDraft]);

  const row = (k: string, v: string) => (
    <tr><td style={{ opacity: 0.7, paddingRight: 10 }}>{k}</td>
        <td style={{ fontFamily: "monospace" }}>{v}</td></tr>
  );

  return (
    <div className="dft-block" style={{ marginBottom: 8 }}>
      <div className="dft-block-head">
        From the Scan Planner
        <button className="rc-export" style={{ float: "right", fontSize: 11 }}
                onClick={() => setWorkspace("scanplan")}>Open Scan Planner</button>
      </div>
      <div style={{ padding: 6, fontSize: 11 }}>
        {!b ? (
          /* "No budget" and "the budget does not know THIS controller" are different problems
             with different fixes, and reporting the second as the first sent people to the Scan
             Planner to redo work that was already done. A controller renamed or added on the
             canvas since the last run is simply absent — so recompute from here. */
          <div className="dft-hint">
            {!budget ? (
              <>No budget yet for this design.</>
            ) : (
              <>The budget was computed for{" "}
                <b>{budget.edts.map((e) => e.name).join(", ") || "no controllers"}</b>, and this
                one is named <b>{ip.instanceName}</b> — it was added or renamed since. Recompute
                to pick it up.</>
            )}
            {err && <div style={{ color: "#e06c75", marginTop: 4 }}>{err}</div>}
            <div style={{ marginTop: 6 }}>
              <button className="rc-export" disabled={busy}
                      onClick={() => void recompute()}>
                {busy ? "Computing…" : "Compute budget now"}
              </button>
              <button className="rc-export" style={{ marginLeft: 6 }}
                      onClick={() => setWorkspace("scanplan")}>Open Scan Planner</button>
            </div>
          </div>
        ) : (
          <>
            <table style={{ borderCollapse: "collapse" }}>
              <tbody>
                {row("covers", b.external ? "wrapper + shared families" : "the whole core")}
                {row("chain families", fams.join(" + ") || "none set — using the default")}
                {row("scan cells", `${b.cells}  (core ${b.cellsCore} + occ ${b.cellsOcc} + hyper ${b.cellsHyper} + wrapper ${b.cellsWrapper})`)}
                {row("scan_chain_count", String(b.chainCount))}
                {row("longest_chain_range", `${b.longestMin}, ${b.longestMax}`)}
                {row("channels", `${b.channels} in / ${b.channels} out   (${b.compression}x)`)}
                {row("synced fields", `${Object.keys(derived).length} — the whole Controller block`)}
              </tbody>
            </table>
            {b.warnings.map((w) => (
              <div key={w} style={{ color: "#d29a22", marginTop: 4 }}>{w}</div>
            ))}
            <div style={{ marginTop: 6 }}>
              <label title="Planner first (default): the derived values overwrite what was typed, every time the dialog syncs. Mine first: typed values stay, the planner only fills empty fields.">
                priority{" "}
                <select value={plannerWins(draft) ? "planner" : "user"}
                        onChange={(e) => {
                          const user = e.target.value === "user";
                          // Flipping back to planner-first takes effect NOW, not on next open.
                          setDraft((d) => {
                            const next = { ...d, [PRIORITY_KEY]: user ? "user" : "" } as DftConfig;
                            if (!user) delete next[PRIORITY_KEY];
                            return user ? next : mergeSpec(next as SpecNode, derived, true) as DftConfig;
                          });
                        }}>
                  <option value="planner">Scan Planner first — overwrites my values</option>
                  <option value="user">my values first — planner fills blanks only</option>
                </select>
              </label>
              <button className="rc-export" style={{ marginLeft: 6 }}
                      onClick={() => setDraft((d) => mergeSpec(d as SpecNode, derived, true) as DftConfig)}>
                Re-apply (overwrite what is there)
              </button>
              {/* What "synced" means, in full — the fields below are this block, and when they
                  disagree the block is what the planner actually computed. */}
              <button className="rc-export" style={{ marginLeft: 6 }} onClick={() => setShowBlock((s) => !s)}>
                {showBlock ? "Hide" : "Show"} the planner's block
              </button>
            </div>
            {showBlock && (
              <pre style={{ margin: "6px 0 0", maxHeight: 220, overflow: "auto", opacity: 0.85 }}>
                {controllerBlock(budget?.edtSpec ?? "", b.name) || "(not in the generated spec)"}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function DftConfigDialog() {
  const ipId = useStore((s) => s.configDialogIp);
  const doc = useStore((s) => s.doc);
  const setDftConfig = useStore((s) => s.setDftConfig);
  const renameDftIp = useStore((s) => s.renameDftIp);
  const close = useStore((s) => s.openConfigDialog);

  // 按「哪个 def 拥有这个 IP」定位 scope，不依赖瞬态 specgenScope（刷新后可能为 null）。
  const scope = doc.library.defs.find((d) => (d.dftIps ?? []).some((i) => i.id === ipId));
  const ip = scope?.dftIps?.find((i) => i.id === ipId);

  const [draft, setDraft] = useState<DftConfig>(() => (ip?.config ?? {}) as DftConfig);
  const [openPaths, setOpenPaths] = useState<Record<string, boolean>>({});
  // Editable component ID (instanceName).
  const [nameDraft, setNameDraft] = useState<string>(() => ip?.instanceName ?? "");

  const comp = ip ? componentSchema(ip.ipType) : null;
  // SpecData（gen.ts）与 DftConfig（dft-model）是同构的两套定义（gen 保持零 core 依赖）；此 cast 依赖它们结构一致，改一个要同步另一个。
  const tsFragment = useMemo(
    () => (comp && ip ? genIpFragment(comp, ip.instanceName, draft as unknown as SpecData) : ""),
    [comp, ip, draft]
  );
  // 预览单一真源：有原生桥接 → 400ms 防抖调 C++ `specgen fragment`（与整档生成同一套 C++）；
  // CLI 出错则回退 TS genIpFragment。浏览器 dev（无桥接）→ 直接用 TS 片段，保证脱离 Electron 也能预览。
  const [preview, setPreview] = useState(tsFragment);
  useEffect(() => {
    if (!hasBridge() || !ip) { setPreview(tsFragment); return; }
    let cancelled = false;  // 防乱序：draft/ip 变化后丢弃仍在途的旧一轮 fragment 结果
    const t = setTimeout(async () => {
      try {
        const out = await dftSpecgen.fragment(ip.ipType, ip.instanceName, draft);
        if (!cancelled) setPreview(out);
      } catch {
        if (!cancelled) setPreview(tsFragment);  // CLI 失败回退 TS 片段
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ip, draft, tsFragment]);
  if (!ip || !comp || !scope) return null;

  const isOpen = (p: Path, depth: number) => openPaths[keyOf(p)] ?? depth === 0;
  const toggle = (p: Path, depth: number) => setOpenPaths((o) => ({ ...o, [keyOf(p)]: !isOpen(p, depth) }));
  const update = (p: Path, v: unknown) => setDraft((d) => setIn(d, p, v) as DftConfig);
  const ctx: FormCtx = { draft, update, isOpen, toggle };

  // Component-ID validation: non-empty and not already used by another IP in this scope.
  const nameTrim = nameDraft.trim();
  const nameTaken = !!nameTrim && (scope.dftIps ?? []).some((i) => i.id !== ip.id && i.instanceName === nameTrim);

  return (
    <div className="prompt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(null); }}>
      <div className="dft-dialog">
        <div className="dft-dialog-head">
          {ip.ipType} (
          <input className="tinput tid" value={nameDraft} title="Component ID — edit to rename"
            onChange={(e) => setNameDraft(e.target.value)}
            style={{ width: Math.max(60, nameDraft.length * 8 + 16), ...(nameTaken ? { outline: "1px solid #e06c75" } : {}) }} />
          ) Configuration
          {nameTaken && <span style={{ color: "#e06c75", fontSize: 11, marginLeft: 8 }}>ID already in use</span>}
        </div>
        <div className="dft-dialog-body">
          <div className="dft-form">
            {ip.ipType === "Edt" && <EdtPlanView ip={ip} draft={draft} setDraft={setDraft} />}
            <Block bs={comp} path={[]} depth={0} ctx={ctx} />
          </div>
          <pre className="dft-preview">{preview}</pre>
        </div>
        <div className="dft-dialog-foot">
          <button onClick={() => close(null)}>Cancel</button>
          <button className="primary" disabled={nameTaken} onClick={() => {
            if (nameTrim && nameTrim !== ip.instanceName && !nameTaken) renameDftIp(scope.id, ip.id, nameTrim);
            setDftConfig(scope.id, ip.id, draft);
            close(null);
          }}>Save</button>
        </div>
      </div>
    </div>
  );
}
