// MBIST Planner — the MemoryBIST partition as a Controller Matrix, built to stay usable when
// the design has hundreds of memories:
//   * the Controller / Step / Memory tree collapses per node (and all at once), shows counts,
//     and every controller / step node is a DROP TARGET — drag memories onto it to reassign;
//   * the memory table filters, sorts and select-all-filtered, so a bulk move is three clicks
//     instead of hundreds of tick boxes;
//   * one-click regroupings (per clock domain / per N memories) for the common layouts.
//
// The plan itself needs only the memory library: type, algorithm, depth/width and
// MilliWattsPerMegaHertz come from the *.tcd_memory templates, and each memory's clock domain
// is resolved from the RTL. DEF / UPF only SPLIT controllers further; they are never required.
// Every manual edit goes through dp_shell, so the console and this page are one plan, and the
// assignment lands in dfx_dft_plan.tcl (it survives a restart).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { MbistPlanResult } from "../core-bridge/model.ts";
import { useStore } from "./store.ts";
import { notify } from "../common/notify.ts";
import { MEMBIST_DIR_KEY } from "./core/membist.ts";
import { SramRepairAdvisorView } from "./repair/SramRepairAdvisorView.tsx";
import { FloorplanView } from "./FloorplanView.tsx";

const DEF_KEY = "dft-suite.mbistDef";
const OPT_KEY = "dft-suite.mbistOpts";
type Sub = "matrix" | "repair" | "floorplan";
type SortKey = "path" | "controller" | "clockDomain" | "type" | "words" | "powerMw" | "cycles";

interface Knobs {
  defaultPeriodNs: number;
  maxPowerPerStepMw: number;
  maxMemoriesPerStep: number;
  clusterSizeRatio: number;
}
const DEFAULT_KNOBS: Knobs = {
  defaultPeriodNs: 10, maxPowerPerStepMw: 500, maxMemoriesPerStep: 0, clusterSizeRatio: -1,
};

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "-");
const leaf = (p: string) => p.slice(p.lastIndexOf(".") + 1);

export function MbistTab() {
  const setError = useStore((s) => s.setError);
  const [sub, setSub] = useState<Sub>("matrix");
  const [dir, setDir] = useState(() => localStorage.getItem(MEMBIST_DIR_KEY) ?? "");
  const [def, setDef] = useState(() => localStorage.getItem(DEF_KEY) ?? "");
  const [knobs, setKnobs] = useState<Knobs>(() => {
    try { return { ...DEFAULT_KNOBS, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? "{}") }; }
    catch { return DEFAULT_KNOBS; }
  });
  const [plan, setPlan] = useState<MbistPlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);       // memory paths ticked for a move
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("path");
  const [sortDesc, setSortDesc] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);   // inline "new controller" input
  const [dragging, setDragging] = useState<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // ---- Controller / Step selection (Memory selection stays in `picked`, unchanged) — a click
  // on one kind clears the other two, so "the current selection" is always unambiguous for the
  // copy/paste/delete/rename shortcuts and the context menu below. ----
  const [selCtrl, setSelCtrl] = useState<string[]>([]);   // selected controller names
  const [selStep, setSelStep] = useState<number[]>([]);   // selected GLOBAL step indices
  type MbistTarget = { kind: "controller"; name: string }
    | { kind: "step"; ctrlName: string; index: number }
    | { kind: "memory"; path: string };
  type MbistClip = { kind: "controller"; name: string; members: string[] }
    | { kind: "step"; members: string[] }
    | { kind: "memory"; members: string[] };
  const [clip, setClip] = useState<MbistClip | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: MbistTarget } | null>(null);
  const [renamingCtrl, setRenamingCtrl] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const selectCtrl = (name: string, additive: boolean) => {
    setSelStep([]); setPicked([]);
    setSelCtrl((s) => additive ? (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]) : [name]);
  };
  const selectStep = (si: number, additive: boolean) => {
    setSelCtrl([]); setPicked([]);
    setSelStep((s) => additive ? (s.includes(si) ? s.filter((x) => x !== si) : [...s, si]) : [si]);
  };

  const run = useCallback(async (o: { dir?: string; def?: string; knobs?: Knobs } = {}) => {
    const d = (o.dir ?? dir).trim();
    if (!d) { notify("set the memory library directory first"); return; }
    const k = o.knobs ?? knobs;
    const f = (o.def ?? def).trim();
    setBusy(true);
    try {
      const r = await hs.mbistPlan(d, {
        defFile: f,
        clusterSizeRatio: f ? (k.clusterSizeRatio >= 0 ? k.clusterSizeRatio : 20) : -1,
        defaultPeriodNs: k.defaultPeriodNs,
        maxPowerPerStepMw: k.maxPowerPerStepMw,
        maxMemoriesPerStep: k.maxMemoriesPerStep,
      });
      setPlan(r);
      localStorage.setItem(MEMBIST_DIR_KEY, d);
      localStorage.setItem(DEF_KEY, f);
      localStorage.setItem(OPT_KEY, JSON.stringify(k));
      notify(`${r.controllers.length} controller · ${r.steps.length} step · ${r.memories.length} memory`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, [dir, def, knobs, setError]);

  useEffect(() => { if (dir.trim()) void run(); /* eslint-disable-next-line */ }, []);

  /** Manual edits go through dp_shell — the console and this page stay one plan. */
  const shell = async (script: string) => {
    await (window as unknown as { dft: { design: {
      query(m: string, p: Record<string, unknown>): Promise<unknown> } } })
      .dft.design.query("dp-shell", { script, file: "" });
  };
  const assign = async (name: string, paths: string[], step?: number) => {
    if (!paths.length) { notify("select the memories to move first"); return; }
    setBusy(true);
    try {
      // dp_shell matches on the leaf name or the full path; leaves keep the command readable.
      const args = paths.map(leaf).join(" ");
      await shell(`add_mbist_controller ${name} ${args}` + (step != null ? ` -step ${step}` : ""));
      setPicked([]);
      setNewName(null);
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const release = async (name?: string) => {
    setBusy(true);
    try {
      await shell(`remove_mbist_controller${name ? " " + name : ""}`);
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  /** Rename is only coherent for a Controller — it is the only one of the three kinds with a
   *  persisted name (a Step is recomputed on every plan run, a Memory's name is its design
   *  instance name). Reuses `rename_mbist_controller`, added for exactly this. */
  const renameCtrl = async (oldName: string, next: string) => {
    const name = next.trim();
    if (!name || name === oldName) { setRenamingCtrl(null); return; }
    setBusy(true);
    try {
      await shell(`rename_mbist_controller ${oldName} ${name}`);
      setRenamingCtrl(null);
      setSelCtrl([name]);
      await run();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const ctrlMemberPaths = (name: string) => {
    const c = plan?.controllers.find((c) => c.name === name);
    return c ? c.memories.map((mi) => plan!.memories[mi].path) : [];
  };
  const stepMemberPaths = (si: number) =>
    plan ? plan.steps[si].members.map((mi) => plan.memories[mi].path) : [];

  const doCopy = () => {
    if (selCtrl.length) {
      const members = [...new Set(selCtrl.flatMap(ctrlMemberPaths))];
      setClip({ kind: "controller", name: selCtrl.length === 1 ? selCtrl[0] : "", members });
      notify(`copied ${members.length} memory path(s) from ${selCtrl.length} controller(s)`);
    } else if (selStep.length) {
      const members = [...new Set(selStep.flatMap(stepMemberPaths))];
      setClip({ kind: "step", members });
      notify(`copied ${members.length} memory path(s) from ${selStep.length} step(s)`);
    } else if (picked.length) {
      setClip({ kind: "memory", members: [...picked] });
      notify(`copied ${picked.length} memory path(s)`);
    } else {
      notify("select a controller, step, or memory first");
    }
  };
  /** Paste target is always a Controller or a Step (a Memory row can't receive one — nothing
   *  gets reassigned "onto" a memory). Pasting a Controller clipboard ignores the target and
   *  always creates a fresh controller: controllers have no persisted order, so "above/below"
   *  cannot mean a position — see the plan's note that this is a single action either way. */
  const pasteOnto = async (target: MbistTarget, stepHint?: "above" | "below") => {
    if (!clip) { notify("nothing copied — Ctrl+C a controller, step, or memory first"); return; }
    if (target.kind === "memory") { notify("paste onto a controller or step, not a memory"); return; }
    if (clip.kind === "controller") {
      await assign(clip.name ? `${clip.name}_copy` : "mbist_ctrl_copy", clip.members);
      return;
    }
    const ctrlName = target.kind === "controller" ? target.name : target.ctrlName;
    const step = target.kind === "step" ? (stepHint === "below" ? target.index + 1 : target.index) : undefined;
    await assign(ctrlName, clip.members, step);
  };
  const doDelete = async () => {
    if (selCtrl.length) {
      if (!confirm(`Release ${selCtrl.length} controller(s) back to automatic partitioning?`)) return;
      setBusy(true);
      try {
        await shell(selCtrl.map((n) => `remove_mbist_controller ${n}`).join("\n"));
        setSelCtrl([]);
        await run();
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
    } else if (selStep.length) {
      // "release the step's memories back to auto-packing" = re-assign to the SAME controller
      // with no -step, which resets stepIndex to -1 in place without touching the controller
      // field (set_memory_instance_options would instead replace the whole option row).
      setBusy(true);
      try {
        const lines = selStep.map((si) => {
          const st = plan!.steps[si];
          const ctrlName = plan!.controllers[st.controller]?.name;
          const mems = st.members.map((mi) => leaf(plan!.memories[mi].path)).join(" ");
          return ctrlName ? `add_mbist_controller ${ctrlName} ${mems}` : "";
        }).filter(Boolean);
        if (lines.length) await shell(lines.join("\n"));
        setSelStep([]);
        await run();
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
    } else if (picked.length) {
      if (!confirm(`Exclude ${picked.length} memory(ies) from MemoryBIST? This is a real design ` +
                   "change (use_in_memory_bist_dft_specification off), not just a UI removal."))
        return;
      setBusy(true);
      try {
        const lines = picked.map((p) =>
          `set_memory_instance_options ${leaf(p)} -use_in_memory_bist_dft_specification off`);
        await shell(lines.join("\n"));
        setPicked([]);
        await run();
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
    } else {
      notify("select a controller, step, or memory first");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sub !== "matrix" || !plan) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select") || t?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "c") { e.preventDefault(); doCopy(); }
      else if ((e.ctrlKey || e.metaKey) && k === "v") {
        e.preventDefault();
        const target: MbistTarget | null = selCtrl.length === 1
          ? { kind: "controller", name: selCtrl[0] }
          : selStep.length === 1
            ? { kind: "step", ctrlName: plan.controllers[plan.steps[selStep[0]].controller]?.name ?? "",
                index: plan.steps[selStep[0]].index }
            : null;
        if (!target) notify("select one controller or step to paste onto");
        else void pasteOnto(target);
      } else if (e.key === "Delete") { e.preventDefault(); void doDelete(); }
      else if (e.key === "F2") {
        e.preventDefault();
        if (selCtrl.length === 1) { setRenamingCtrl(selCtrl[0]); setRenameVal(selCtrl[0]); }
        else if (selStep.length || picked.length) notify("only a Controller can be renamed");
      } else if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, plan, selCtrl, selStep, picked, clip]);

  /** One controller per clock domain / per N memories — the two layouts people hand-build. */
  const regroup = async (mode: "clock" | "chunk", n = 4) => {
    if (!plan) return;
    setBusy(true);
    try {
      // Name from the DESIGN, never from whatever controller happens to be first — regrouping
      // twice would otherwise stack prefixes (SMALL_CTRL_ref_clk_c1_…). Clock roots carry a
      // hierarchy path (u_div2/d), so they are sanitised into identifier-safe segments.
      const base = (plan.memories[0]?.path.split(".")[0] ?? "design") + "_mbist";
      const ident = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
      const lines: string[] = ["remove_mbist_controller"];
      if (mode === "clock") {
        const byClock = new Map<string, string[]>();
        for (const m of plan.memories)
          byClock.set(m.clockDomain, [...(byClock.get(m.clockDomain) ?? []), leaf(m.path)]);
        let i = 1;
        for (const [clk, mems] of byClock)
          lines.push(`add_mbist_controller ${base}_${ident(clk)}_c${i++} ${mems.join(" ")}`);
      } else {
        const mems = plan.memories.map((m) => leaf(m.path));
        for (let i = 0; i * n < mems.length; i++)
          lines.push(`add_mbist_controller ${base}_g${i + 1} ${mems.slice(i * n, i * n + n).join(" ")}`);
      }
      await shell(lines.join("\n"));
      setPicked([]);
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  // ---- filtered + sorted memory view (what the table shows and what "select all" acts on) ----
  const shown = useMemo(() => {
    if (!plan) return [] as Array<{ m: MbistPlanResult["memories"][number]; i: number }>;
    const q = filter.trim().toLowerCase();
    const rows = plan.memories.map((m, i) => ({ m, i })).filter(({ m }) => {
      if (!q) return true;
      const ctrl = plan.controllers[m.controller]?.name ?? "";
      return [m.path, m.module, m.type, m.algorithm, m.clockDomain, ctrl]
        .some((s) => s.toLowerCase().includes(q));
    });
    const key = (x: { m: MbistPlanResult["memories"][number] }) => {
      const m = x.m;
      switch (sortBy) {
        case "controller": return plan.controllers[m.controller]?.name ?? "";
        case "clockDomain": return m.clockDomain;
        case "type": return m.type;
        case "words": return m.words;
        case "powerMw": return m.powerMw;
        case "cycles": return m.cycles;
        default: return m.path;
      }
    };
    rows.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === "number" && typeof kb === "number"
        ? ka - kb : String(ka).localeCompare(String(kb));
      return sortDesc ? -c : c;
    });
    return rows;
  }, [plan, filter, sortBy, sortDesc]);

  const allShownPicked = shown.length > 0 && shown.every(({ m }) => picked.includes(m.path));
  const toggleAllShown = () => setPicked(allShownPicked
    ? picked.filter((p) => !shown.some(({ m }) => m.path === p))
    : [...new Set([...picked, ...shown.map(({ m }) => m.path)])]);

  const knob = (key: keyof Knobs, label: string, title: string) => (
    <label className="muted" title={title} style={{ whiteSpace: "nowrap" }}>
      {label}
      <input className="findinput" style={{ width: 60, marginLeft: 4 }} value={knobs[key]}
             onChange={(e) => setKnobs({ ...knobs, [key]: Number(e.target.value) })}
             onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
    </label>
  );

  // Drag payload: whatever is ticked, or just the row being dragged.
  const dragPayload = (path: string) => (picked.includes(path) && picked.length ? picked : [path]);
  const dropOn = async (ctrlName: string, step?: number) => {
    const paths = dragging ?? [];
    setDragging(null);
    setDropTarget(null);
    if (paths.length) await assign(ctrlName, paths, step);
  };

  return (
    <div className="drctab" id="mbisttab">
      <div className="crhead">
        <span style={{ fontWeight: 600 }}>MBIST Planner</span>
        {(["matrix", "repair", "floorplan"] as Sub[]).map((s) => (
          <button key={s} className="findbtn" data-sub={s}
                  style={{ fontWeight: sub === s ? 700 : 400 }} onClick={() => setSub(s)}>
            {s === "matrix" ? "Controller Matrix" : s === "repair" ? "Repair" : "Floorplan"}
          </button>
        ))}
        {plan && (
          <span className="crstat" style={{ marginLeft: "auto" }}>
            {plan.controllers.length} controller · {plan.steps.length} step · {plan.memories.length} memory ·
            test time {(plan.totalRuntimeNs / 1e6).toFixed(2)} ms · peak {f2(plan.peakPowerMw)} mW
          </span>
        )}
      </div>

      {sub === "matrix" && (
        <div className="crhead">
          <input className="findinput" style={{ flex: 1, minWidth: 170 }} spellCheck={false}
                 placeholder="memory library dir (*.tcd_memory) — the only required input"
                 value={dir} onChange={(e) => setDir(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
          <input className="findinput" style={{ flex: 1, minWidth: 120 }} spellCheck={false}
                 placeholder="DEF (optional)"
                 value={def} onChange={(e) => setDef(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
          {knob("defaultPeriodNs", "period ns", "clock period used when no SDC period is known")}
          {knob("maxPowerPerStepMw", "max mW/step", "per-step power budget: memories in a step run in parallel and their power adds up")}
          {knob("maxMemoriesPerStep", "max mem/step", "0 = unlimited")}
          <button className="findbtn" data-btn="mbist-plan" onClick={() => void run()} disabled={busy}>
            {busy ? "…" : "Plan"}</button>
        </div>
      )}

      {plan && plan.errors.length > 0 && (
        <div className="crnote">{plan.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}</div>
      )}

      {sub === "matrix" && !plan && (
        <div className="muted pad">
          给出 memory library 目录即可出计划:类型/算法/容量/功耗来自 *.tcd_memory,时钟域由
          RTL 走线解析。DEF/UPF 不是必须输入。出计划后可在左树上拖拽存储器改分组。
        </div>
      )}

      {sub === "matrix" && plan && (
        <div style={{ display: "flex", minHeight: 0, flex: 1, gap: 10, padding: "6px 10px", overflow: "hidden" }}>
          {/* ---------------- left: the collapsible, drop-target tree ---------------- */}
          <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", minHeight: 0,
                        border: "1px solid #333" }}>
            <div style={{ display: "flex", gap: 4, padding: 4, borderBottom: "1px solid #333" }}>
              <span className="muted" style={{ flex: 1, alignSelf: "center" }}>
                Controller / Step / Memory</span>
              <button className="findbtn" data-btn="tree-expand" title="expand all"
                      onClick={() => setCollapsed({})}>＋</button>
              <button className="findbtn" data-btn="tree-collapse" title="collapse all"
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        plan.controllers.forEach((c, ci) => {
                          all[`c${ci}`] = true;
                          c.steps.forEach((si) => { all[`s${si}`] = true; });
                        });
                        setCollapsed(all);
                      }}>−</button>
            </div>
            <div style={{ overflow: "auto", flex: 1, padding: 4 }} data-tree="mbist">
              {plan.controllers.map((c, ci) => {
                const cKey = `c${ci}`;
                const cClosed = collapsed[cKey];
                const cSel = selCtrl.includes(c.name);
                return (
                  <div key={cKey} data-ctrl={c.name}>
                    {renamingCtrl === c.name ? (
                      <div className="drcrow" style={{ fontWeight: 600 }}>
                        <input className="findinput" autoFocus data-input="ctrl-rename"
                               style={{ width: 160 }} value={renameVal}
                               onChange={(e) => setRenameVal(e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === "Enter") void renameCtrl(c.name, renameVal);
                                 if (e.key === "Escape") setRenamingCtrl(null);
                               }}
                               onBlur={() => void renameCtrl(c.name, renameVal)} />
                      </div>
                    ) : (
                      <div className="drcrow" data-row="ctrl" data-sel={cSel || undefined}
                           style={{ cursor: "pointer", fontWeight: 600,
                                    background: dropTarget === cKey ? "#2f4a2f"
                                      : cSel ? "#3a3a1f" : undefined }}
                           onDragOver={(e) => { e.preventDefault(); setDropTarget(cKey); }}
                           onDragLeave={() => setDropTarget((t) => (t === cKey ? null : t))}
                           onDrop={(e) => { e.preventDefault(); void dropOn(c.name); }}
                           onClick={(e) => selectCtrl(c.name, e.ctrlKey || e.metaKey || e.shiftKey)}
                           onContextMenu={(e) => {
                             e.preventDefault();
                             if (!cSel) selectCtrl(c.name, false);
                             setCtxMenu({ x: e.clientX, y: e.clientY,
                                          target: { kind: "controller", name: c.name } });
                           }}
                           title={`${c.type} · ${c.clockDomain} · ${c.memories.length} memories` +
                                  (c.violations.length ? `\n⚠ ${c.violations.join("\n")}` : "")}>
                        <span onClick={(e) => { e.stopPropagation();
                                                 setCollapsed({ ...collapsed, [cKey]: !cClosed }); }}>
                          {cClosed ? "▸" : "▾"}</span> {c.userDefined ? "👤 " : ""}{c.name}
                        <span className="muted"> ({c.memories.length})</span>
                        {c.violations.length > 0 && <span style={{ color: "#e0a03a" }}> ⚠</span>}
                      </div>
                    )}
                    {!cClosed && c.steps.map((si) => {
                      const st = plan.steps[si];
                      const sKey = `s${si}`;
                      const sClosed = collapsed[sKey];
                      const sSel = selStep.includes(si);
                      return (
                        <div key={sKey}>
                          <div className="drcrow" data-row="step" data-step={si} data-sel={sSel || undefined}
                               style={{ cursor: "pointer", paddingLeft: 14,
                                        background: dropTarget === sKey ? "#2f4a2f"
                                          : sSel ? "#3a3a1f" : undefined }}
                               onDragOver={(e) => { e.preventDefault(); setDropTarget(sKey); }}
                               onDragLeave={() => setDropTarget((t) => (t === sKey ? null : t))}
                               onDrop={(e) => { e.preventDefault(); void dropOn(c.name, st.index); }}
                               onClick={(e) => selectStep(si, e.ctrlKey || e.metaKey || e.shiftKey)}
                               onContextMenu={(e) => {
                                 e.preventDefault();
                                 if (!sSel) selectStep(si, false);
                                 setCtxMenu({ x: e.clientX, y: e.clientY,
                                              target: { kind: "step", ctrlName: c.name, index: st.index } });
                               }}
                               title={`${f2(st.powerMw)} mW · ${st.cycles} cycles` +
                                      (st.ruleId ? `\nnew step: ${st.ruleId} ${st.ruleWhy}` : "")}>
                            <span onClick={(e) => { e.stopPropagation();
                                                     setCollapsed({ ...collapsed, [sKey]: !sClosed }); }}>
                              {sClosed ? "▸" : "▾"}</span> Step {st.index}
                            <span className="muted"> ({st.members.length})</span>
                          </div>
                          {!sClosed && st.members.map((mi) => {
                            const m = plan.memories[mi];
                            return (
                              <div key={mi} className="drcrow" draggable data-mem={leaf(m.path)}
                                   style={{ cursor: "grab", paddingLeft: 30,
                                            background: picked.includes(m.path) ? "#2a3a4a" : undefined }}
                                   onDragStart={() => setDragging(dragPayload(m.path))}
                                   onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                                   onClick={(e) => {
                                     setSelCtrl([]); setSelStep([]);
                                     if (e.ctrlKey || e.metaKey || e.shiftKey)
                                       setPicked((p) => p.includes(m.path)
                                         ? p.filter((x) => x !== m.path) : [...p, m.path]);
                                     else setPicked([m.path]);
                                   }}
                                   onContextMenu={(e) => {
                                     e.preventDefault();
                                     if (!picked.includes(m.path)) {
                                       setSelCtrl([]); setSelStep([]); setPicked([m.path]);
                                     }
                                     setCtxMenu({ x: e.clientX, y: e.clientY,
                                                  target: { kind: "memory", path: m.path } });
                                   }}
                                   title={`${m.path}\n${m.words}x${m.width} · ${m.clockDomain} · ${f2(m.powerMw)} mW`}>
                                {leaf(m.path)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{ padding: 4, borderTop: "1px solid #333", fontSize: 11 }}>
              拖动存储器到控制器/步骤节点即可改分组 · Ctrl+点击多选 · 右键节点：复制/粘贴/删除/重命名
              (Ctrl+C/V, Delete, F2)
            </div>
          </div>

          {ctxMenu && (
            <MbistContextMenu ctxMenu={ctxMenu} clip={clip} plan={plan}
                               selCtrlCount={selCtrl.length} selStepCount={selStep.length}
                               pickedCount={picked.length}
                               onClose={() => setCtxMenu(null)}
                               onCopy={() => { doCopy(); setCtxMenu(null); }}
                               onPaste={(hint) => { void pasteOnto(ctxMenu.target, hint); setCtxMenu(null); }}
                               onDelete={() => { void doDelete(); setCtxMenu(null); }}
                               onRename={() => {
                                 if (ctxMenu.target.kind === "controller") {
                                   setRenamingCtrl(ctxMenu.target.name);
                                   setRenameVal(ctxMenu.target.name);
                                 }
                                 setCtxMenu(null);
                               }} />
          )}

          {/* ---------------- right: summaries + bulk editing ---------------- */}
          <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
            <Section id="controllers" title="Controller Summary">
              <Table head={["Controller", "Type", "Clock", "Period", "Power (mW)", "Runtime (ns)",
                            "Cycles", "Flops", "Steps", "Memories", "Cluster", "Separated by (CCR)", ""]}
                     rows={plan.controllers.map((c, ci) => ({
                       key: String(ci),
                       note: c.violations,
                       cells: [(c.userDefined ? "👤 " : "") + c.name, c.type, c.clockDomain,
                               f2(c.periodNs), f2(c.powerMw), f2(c.runtimeNs), String(c.cycles),
                               String(c.flops), String(c.steps.length), String(c.memories.length),
                               c.physicalCluster || "-",
                               c.userDefined ? "user assignment"
                                 : c.ruleId ? `${c.ruleId}: ${c.ruleWhy}` : "—"],
                       action: c.userDefined
                         ? { label: "release", run: () => void release(c.name) } : undefined,
                     }))} />
            </Section>
            <Section id="steps" title="Step Summary">
              <Table head={["Step", "Controller", "Power (mW)", "Runtime (ns)", "Cycles",
                            "Comparator", "Memories", "New step because (SCR)"]}
                     rows={plan.steps.map((s, si) => ({
                       key: String(si),
                       cells: [`Step ${s.index}`, plan.controllers[s.controller]?.name ?? "",
                               f2(s.powerMw), f2(s.runtimeNs), String(s.cycles), s.comparator,
                               s.members.map((m) => leaf(plan.memories[m].path)).join(", "),
                               s.ruleId ? `${s.ruleId}: ${s.ruleWhy}` : "—"],
                     }))} />
            </Section>

            {/* bulk editing bar — filter, select-all-filtered, then one move */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
                          margin: "0 0 6px" }}>
              <input className="findinput" style={{ width: 200 }} spellCheck={false}
                     data-input="mem-filter"
                     placeholder="filter memories (name / clock / type / controller)"
                     value={filter} onChange={(e) => setFilter(e.target.value)} />
              <span className="muted">{picked.length} selected of {shown.length} shown</span>
              <button className="findbtn" data-btn="select-all" onClick={toggleAllShown}>
                {allShownPicked ? "Deselect shown" : "Select all shown"}</button>
              {newName === null ? (
                <button className="findbtn" data-btn="mbist-new-ctrl" disabled={!picked.length || busy}
                        onClick={() => setNewName(
                          `${plan.memories[0]?.path.split(".")[0] ?? "design"}_mbist_user1`)}>
                  Move to new controller…</button>
              ) : (
                <>
                  <input className="findinput" style={{ width: 180 }} autoFocus
                         data-input="new-ctrl-name" value={newName}
                         onChange={(e) => setNewName(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === "Enter" && newName.trim()) void assign(newName.trim(), picked);
                           if (e.key === "Escape") setNewName(null);
                         }} />
                  <button className="findbtn" data-btn="new-ctrl-ok" disabled={!newName.trim() || busy}
                          onClick={() => void assign(newName.trim(), picked)}>Create</button>
                  <button className="findbtn" onClick={() => setNewName(null)}>Cancel</button>
                </>
              )}
              <select className="findinput" style={{ width: 190 }} value=""
                      data-select="move-existing" disabled={!picked.length || busy}
                      onChange={(e) => { if (e.target.value) void assign(e.target.value, picked); }}>
                <option value="">Move to existing controller…</option>
                {plan.controllers.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.memories.length})</option>
                ))}
              </select>
              <button className="findbtn" data-btn="regroup-clock" disabled={busy}
                      title="one controller per clock domain"
                      onClick={() => void regroup("clock")}>Group by clock</button>
              <button className="findbtn" data-btn="regroup-chunk" disabled={busy}
                      title="one controller per 4 memories"
                      onClick={() => void regroup("chunk", 4)}>Group by 4</button>
              <button className="findbtn" data-btn="release-all" disabled={busy}
                      title="hand every manual assignment back to the automatic CCR partition"
                      onClick={() => void release()}>Reset manual</button>
            </div>

            <Section id="memories"
                     title={`Memory Summary — ${shown.length} of ${plan.memories.length}`}>
              <Table head={[<input key="all" type="checkbox" checked={allShownPicked}
                                   onChange={toggleAllShown} data-check="all" />,
                            ...([["path", "Memory"], ["controller", "Controller"], ["", "Step"],
                                 ["", "IFID"], ["type", "Type"], ["words", "Words"], ["", "Width"],
                                 ["", "Algorithm"], ["clockDomain", "Clock"],
                                 ["powerMw", "Power (mW)"], ["cycles", "Cycles"],
                                 ["", "Placement"]] as Array<[string, string]>)
                              .map(([k, label]) => k ? (
                                <span key={label} style={{ cursor: "pointer" }}
                                      onClick={() => {
                                        if (sortBy === k) setSortDesc(!sortDesc);
                                        else { setSortBy(k as SortKey); setSortDesc(false); }
                                      }}>{label}{sortBy === k ? (sortDesc ? " ▾" : " ▴") : ""}</span>
                              ) : <span key={label}>{label}</span>)]}
                     rows={shown.map(({ m, i }) => ({
                       key: String(i),
                       drag: { paths: () => dragPayload(m.path),
                               start: (p: string[]) => setDragging(p),
                               end: () => { setDragging(null); setDropTarget(null); } },
                       pick: {
                         checked: picked.includes(m.path),
                         toggle: () => setPicked((p) => p.includes(m.path)
                           ? p.filter((x) => x !== m.path) : [...p, m.path]),
                       },
                       cells: [m.path.replace(/\./g, "/"),
                               plan.controllers[m.controller]?.name ?? "", String(m.step),
                               m.interfaceId, m.type, String(m.words), String(m.width),
                               m.algorithm, m.clockDomain, f2(m.powerMw), String(m.cycles),
                               m.placed ? `(${m.x.toFixed(1)}, ${m.y.toFixed(1)})` : "-"],
                     }))} />
            </Section>

            <Section id="rules" title="Compatibility Rules — CCR (controller) / SCR (step)">
              <Table head={["Rule", "Effect", "Requires"]}
                     rows={plan.rules.map((r) => ({
                       key: r.id,
                       hi: r.splits > 0,
                       cells: [r.id,
                               !r.applies ? "n/a" : r.splits ? `split ×${r.splits}` : "satisfied",
                               r.title],
                     }))} />
            </Section>
            {plan.notes.length > 0 && (
              <div className="crnote" style={{ marginTop: 8 }}>
                {plan.notes.map((n, i) => <div key={i}>· {n}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {sub === "repair" && (
        <SramRepairAdvisorView memories={(plan?.memories ?? []).map((m) => ({
          path: m.path, bits: m.words * (m.width || 1),
        }))} />
      )}

      {sub === "floorplan" && (
        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          <FloorplanView plan={plan} dir={dir} def={def} />
        </div>
      )}
    </div>
  );
}

/** Copy/Paste/Delete/Rename for the tree's current selection — one right-click menu shared by
 *  all three node kinds, showing only what's actually coherent for whichever kind was clicked
 *  (a Step has no persisted identity to rename; a Memory can't be a paste target). */
function MbistContextMenu({ ctxMenu, clip, plan, selCtrlCount, selStepCount, pickedCount,
                             onClose, onCopy, onPaste, onDelete, onRename }: {
  ctxMenu: { x: number; y: number; target:
    { kind: "controller"; name: string } | { kind: "step"; ctrlName: string; index: number }
    | { kind: "memory"; path: string } };
  clip: { kind: "controller" | "step" | "memory"; members: string[]; name?: string } | null;
  plan: MbistPlanResult;
  selCtrlCount: number; selStepCount: number; pickedCount: number;
  onClose: () => void; onCopy: () => void;
  onPaste: (hint?: "above" | "below") => void; onDelete: () => void; onRename: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const { target } = ctxMenu;
  const copyCount = target.kind === "controller" ? selCtrlCount
    : target.kind === "step" ? selStepCount : pickedCount;
  const canPasteHere = !!clip && target.kind !== "memory";
  const stepTarget = target.kind === "step";
  const deleteLabel = target.kind === "controller"
    ? `Release ${selCtrlCount || 1} controller(s)`
    : target.kind === "step" ? `Un-pin ${selStepCount || 1} step(s)`
    : `Exclude ${pickedCount || 1} memory(ies)`;
  const renameDisabled = target.kind !== "controller";
  const renameTitle = target.kind === "step"
    ? "steps are computed automatically from the power/count budget — only Controllers can be renamed"
    : target.kind === "memory" ? "a memory's name is its design instance name" : "rename (F2)";

  const item = (label: string, onClick: () => void, disabled?: boolean, title?: string) => (
    <div className="findbtn" role="menuitem" aria-disabled={disabled}
         style={{ padding: "5px 10px", cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap" }}
         title={title} onClick={disabled ? undefined : onClick}>
      {label}
    </div>
  );

  return (
    <div ref={ref} data-ctxmenu={target.kind}
         style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 30,
                  background: "#1e1e1e", border: "1px solid #444", borderRadius: 4,
                  boxShadow: "0 4px 14px rgba(0,0,0,.4)", minWidth: 170 }}>
      {item(`Copy${copyCount > 1 ? ` (${copyCount})` : ""}`, onCopy)}
      {stepTarget ? (
        <>
          {item("Paste above", () => onPaste("above"), !canPasteHere)}
          {item("Paste below", () => onPaste("below"), !canPasteHere)}
        </>
      ) : (
        item("Paste", () => onPaste(), !canPasteHere)
      )}
      <div style={{ borderTop: "1px solid #333", margin: "3px 0" }} />
      {item(deleteLabel, onDelete)}
      {item("Rename", onRename, renameDisabled, renameTitle)}
    </div>
  );
}

function Section({ title, id, children }: {
  title: string; id?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }} data-section={id}>
      <div style={{ color: "#4fa3ff", fontWeight: 600, margin: "2px 0 4px" }}>{title}</div>
      <div style={{ border: "1px solid #333", overflowX: "auto" }}>{children}</div>
    </div>
  );
}

interface Row {
  key: string;
  hi?: boolean;
  cells: string[];
  /** Tick box (memory rows). */
  pick?: { checked: boolean; toggle: () => void };
  /** Makes the row draggable onto a tree node. */
  drag?: { paths: () => string[]; start: (p: string[]) => void; end: () => void };
  /** Warning lines rendered under the row (a user controller's rule violations). */
  note?: string[];
  /** Trailing inline action (e.g. release a user-defined controller). */
  action?: { label: string; run: () => void };
}

function Table({ head, rows }: { head: React.ReactNode[]; rows: Row[] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <thead>
        <tr>{head.map((h, i) => (
          <th key={i} style={{ textAlign: "left", padding: "4px 8px",
                               borderBottom: "1px solid #333", color: "#9aa4af",
                               fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.key}>
            <tr style={{ background: r.hi ? "#2a3a4a" : undefined,
                         cursor: r.drag ? "grab" : undefined }}
                draggable={!!r.drag}
                onDragStart={() => r.drag?.start(r.drag.paths())}
                onDragEnd={() => r.drag?.end()}>
              {r.pick && (
                <td style={{ padding: "3px 8px", borderBottom: "1px solid #222" }}>
                  <input type="checkbox" checked={r.pick.checked} onChange={r.pick.toggle} />
                </td>
              )}
              {r.cells.map((c, i) => (
                <td key={i} style={{ padding: "3px 8px", borderBottom: "1px solid #222",
                                     whiteSpace: "nowrap" }}>{c}</td>
              ))}
              {r.action && (
                <td style={{ padding: "3px 8px", borderBottom: "1px solid #222" }}>
                  <button className="findbtn" onClick={r.action.run}>{r.action.label}</button>
                </td>
              )}
            </tr>
            {r.note?.map((n, i) => (
              <tr key={r.key + "n" + i}>
                <td colSpan={head.length + 1}
                    style={{ padding: "2px 8px 4px 24px", borderBottom: "1px solid #222",
                             color: "#e0a03a" }}>⚠ {n}</td>
              </tr>
            ))}
          </Fragment>
        ))}
        {rows.length === 0 && (
          <tr><td className="muted" style={{ padding: 8 }} colSpan={head.length + 1}>(none)</td></tr>
        )}
      </tbody>
    </table>
  );
}
