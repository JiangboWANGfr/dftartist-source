// DRC workbench: rule categories on the LEFT, one row per violation on the RIGHT,
// double-click a row -> the clock-path schematic for that exact violation (debug view).
//
// Rule ids mirror dp_shell's report_drc_rules (C* = clock, R* = reset) and are classified
// from the same CrPathItem fields, so the table and the shell can never disagree.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { CrPathItem, ClockResetTreeResult } from "../core-bridge/model.ts";
import { SchematicTab } from "./schematic/SchematicTab.tsx";
import { buildCrSchematic } from "./core/crSchematic.ts";
import { splitDefId } from "./core/defId.ts";
import { crCacheGet, crCacheHas, crCacheSet } from "./core/crCache.ts";
import { notify } from "../common/notify.ts";
import { askResetFix } from "./ResetFixDialog.tsx";
import { proposeResetFixes, fixPoint, muxCoverage, muxCoveredGroups } from "./core/resetFix.ts";
import { DYNAMIC_RE, STATIC_RE, dfxIpDir, scanIpLibrary } from "./core/dfxIpLib.ts";

// e2e handle: the REAL proposal function, so a spec can plan exactly what the autofix would
// plan instead of hard-coding mux targets that drift the moment the analysis improves.
(window as unknown as { __proposeResetFixesForTest?: typeof proposeResetFixes })
  .__proposeResetFixesForTest = proposeResetFixes;
(window as unknown as { __muxCoveredGroupsForTest?: typeof muxCoveredGroups })
  .__muxCoveredGroupsForTest = muxCoveredGroups;

interface Rule {
  id: string;
  desc: string;
  match: (i: CrPathItem) => boolean;
  /** What actually goes wrong on silicon if this stays — the consequence, not the symptom. */
  why: string;
  /** The remedy, in this tool's own commands/flows. */
  fix: string;
}

const RULES: Rule[] = [
  { id: "C1", desc: "clock pin is not driven by a defined clock (value X)",
    why: "该组寄存器的时钟不是任何已定义时钟(值 X)——扫描时没有可控时钟,链无法移位也无法捕获。",
    fix: "确认 SDC create_clock 覆盖到该时钟源;若路径经过 ICG/时钟单元被挡住,提供 dft_lib_setting.yaml 让走查穿透;测试时钟由 OCC 提供的,用 add_occ_point 声明。",
    match: (i) => i.kind === "clock" && i.value === "X" && i.terminus !== "logic" },
  { id: "C2", desc: "clock is held at a constant (never pulses)",
    why: "时钟被钳在常量 0/1,永不翻转——该组寄存器在测试下完全不工作,链断在这里。",
    fix: "沿 debug 电路找到钳住它的门控/选择逻辑,add_pin_constraint 使能它,或在时钟选择处规划测试路径。",
    match: (i) => i.kind === "clock" && (i.value === "0" || i.value === "1") },
  { id: "C3", desc: "clock passes through combinational logic that blocks the edge",
    why: "时钟穿过组合逻辑后边沿到不了寄存器(值 X)——移位/捕获脉冲丢失。",
    fix: "打开 debug 电路,约束该组合逻辑的旁路/使能输入(add_pin_constraint),让边沿有一条确定的通路。",
    match: (i) => i.kind === "clock" && i.value === "X" && i.terminus === "logic" },
  // A recorded mux that drives the reset to its ACTIVE value: the plan itself asserts the
  // reset. Its own row, red, naming the culprit — Fix reset DRC proposes deleting exactly it.
  { id: "RB", desc: "a PLANNED mux drives this reset to its ACTIVE value — the plan asserts it",
    why: "已规划的 mux 把复位驱到 ACTIVE 值——计划本身把这些寄存器摁在复位态,比不修更糟(rail 选错或落点在反相器错误一侧的典型症状)。",
    fix: "点 Fix reset DRC:第一轮列为 HARMFUL 提议 delete_dft_ctrl_mux,自动重跑后按『寄存器极性×路径反相』重新给出正确 rail(dfx_rst/set_scan_n/p)。",
    match: (i) => i.kind === "reset" && !i.ok && !!i.plannedFix },
  { id: "R1", desc: "async reset is not at its inactive value in test",
    why: "shift 阶段该异步复位/置位处于确定的 ACTIVE 值——移位过程中寄存器被复位/置位,链上数据被破坏,图形全废。",
    fix: "在 common source 规划 mux(Fix reset DRC 自动提议;rail 按寄存器极性与路径反相选 dfx_rst/set_scan_n/p),或检查把它驱成 ACTIVE 的约束。",
    match: (i) => i.kind === "reset" && !i.ok && i.value !== "X" && !i.plannedFix },
  { id: "R2", desc: "async reset value is unknown (X)",
    why: "该复位在 shift 阶段是 X(不可控)——无约束即 X、X 即违例:无法保证移位时不复位。",
    fix: "沿 debug 电路约束其来源输入(add_pin_constraint;IP 内的 report_dft_ip_circuit 会指名第一个未约束输入),或在 common source 规划 mux。",
    match: (i) => i.kind === "reset" && i.value === "X" && i.terminus !== "sequential" },
  // The reset comes straight out of a flip-flop (typically a reset synchroniser). A registered
  // value CANNOT be forced combinationally, so during scan shift there is no way to hold this
  // reset at its inactive value — the chain will not shift. This is unacceptable regardless of
  // what the static value calculus says, which is why it is its own rule and not folded into R2.
  // A PLANNED mux bypasses the register in test mode: the nearest planned point drives the
  // reset, so "comes from a register" stops being true for the DRC the plan describes. Those
  // groups move to the FIX row below instead of staying red — a fixed violation that still
  // counts as a violation is a report nobody can act on.
  { id: "R3", desc: "async reset comes directly from a register — cannot be held inactive during scan shift",
    why: "复位直接出自寄存器(典型:复位同步器)——寄存器值无法用组合方式强制,shift 期间没有任何约束能把它保持在 inactive,链必然移不动。",
    fix: "在该寄存器输出(即 common source)规划 mux 旁路(Fix reset DRC 自动提议),测试模式下由 dfx_rst/set_scan rail 接管。",
    match: (i) => i.kind === "reset" && i.terminus === "sequential" && !i.plannedFix },
  // SCAN dimension — only meaningful once the user has declared OCC points, so these stay
  // empty (not "everything is a violation") until then.
  // NOT a violation — the yellow row: resets that pass ONLY because a planned mux holds them.
  // Listed so the plan's coverage is inspectable; drawn yellow so it can never be read as
  // "fine as the netlist stands".
  { id: "FIX", desc: "reset held inactive by a PLANNED mux (designed, not inserted)",
    why: "不是违例(黄色):这些组仅因『已规划』的 mux 才通过——网表本身还没有这颗 mux。",
    fix: "插入流程必须真正落实它们:Export fix scripts(write_dft_instantiation)交给 scan insertion;插入后重跑 DRC,黄转绿才算闭环。",
    match: (i) => i.kind === "reset" && i.ok && !!i.plannedFix },
  { id: "S1", desc: "clock does not reach an OCC definition point in scan mode",
    why: "扫描模式下该时钟没有落在任何已声明的 OCC 定义点上——链移位时钟不受 OCC 控制,ATPG 无法驱动。",
    fix: "在正确的时钟点 add_occ_point,或修正 scan 时钟路径;S 列显示强制 DFT 信号后的到达点。",
    match: (i) => i.kind === "clock" && !!i.scanChecked && !i.scanOcc && i.scanValue !== "X" },
  { id: "S2", desc: "clock is dead in scan mode (no edge reaches the flop)",
    why: "强制 DFT 信号后该时钟为 X/无边沿——扫描模式下这组寄存器没有时钟。",
    fix: "检查 scan_enable/测试使能的强制值与时钟门控路径;必要处 add_pin_constraint 或规划时钟测试通路。",
    match: (i) => i.kind === "clock" && !!i.scanChecked && i.scanValue === "X" },
];

/** One violation, explained in full: what it is, what it does, where it comes from. Used as
 *  the row tooltip and the debug header line — the reader must never have to reverse-engineer
 *  the rule from four table cells. */
function explainItem(i: CrPathItem, strip: (s: string) => string): string {
  const what = i.kind === "clock" ? "时钟" : i.set ? "异步置位(set)" : "异步复位";
  const head = `${strip(i.owner)}/${i.net} ×${i.flopCount}bit: ${what} ${i.edge} 有效`;
  const req = i.kind === "reset"
    ? `;要求 shift=inactive(${i.inactive}),实际 s(${i.value})` +
      (i.sacValue !== undefined ? `-sac(${i.sacValue})/asc(${i.ascValue})` : "")
    : `;值 ${i.value}(需要 010 边沿)`;
  const src = i.detail ? `;来源: ${i.terminus} ${strip(i.detail.split(" <-")[0])}`
                       : `;来源: ${i.terminus}`;
  const inv = i.inverted ? ";路径含反相器" : "";
  const plan = i.plannedFix
    ? (i.ok ? ";由 planned mux 保持 inactive(黄色=计划,未插入)"
            : `;⚠ planned mux(${strip(i.plannedMuxTarget ?? "")})把它驱到 ACTIVE`)
    : "";
  return head + req + src + inv + plan;
}

// The DRC page unmounts on every workspace switch; these survive it, so coming back finds
// the SAME rule, the same open debug tabs and the same active one ("页面切换数据不要丢失").
// The schematic graphs themselves already live in the store keyed by seed; this is the little
// UI state around them. `builtDbg` remembers which item CONTENT a debug graph was built from,
// so a remount does NOT rebuild (and wipe) a circuit the user has grown — only a genuinely
// new analysis result does.
const drcUi: { rule: string; tabs: CrPathItem[]; key: string } = { rule: "C1", tabs: [], key: "" };
const builtDbg = new Map<string, string>();

export function DrcTab() {
  const roots = useStore((s) => s.rootInstanceIds);
  const setError = useStore((s) => s.setError);
  const putSchematic = useStore((s) => s.putSchematic);
  const sdc0 = localStorage.getItem("dft-suite.funcSdc") ?? "";
  const lib0 = localStorage.getItem("dft-suite.dftLib") ?? "";
  const [sdc, setSdc] = useState(sdc0);
  const [lib] = useState(lib0);
  // Shared with Clock Tree — it is the same walk, so analyzing in either makes the other
  // instant, and switching between them no longer discards the result (or the open views).
  const [data, setData] = useState<ClockResetTreeResult | null>(() => crCacheGet(sdc0, lib0) ?? null);
  const [busy, setBusy] = useState(false);
  const [ruleId, setRuleId] = useState(() => drcUi.rule);
  // Double-clicked violations become DEBUG TABS in the header: several circuits stay open at
  // once and the user switches between them while debugging (each keeps its own layout).
  const [debugTabs, setDebugTabs] = useState<CrPathItem[]>(() => drcUi.tabs);
  const [debugKey, setDebugKey] = useState(() => drcUi.key);   // active tab ("" = closed)
  useEffect(() => { drcUi.rule = ruleId; }, [ruleId]);
  useEffect(() => { drcUi.tabs = debugTabs; }, [debugTabs]);
  useEffect(() => { drcUi.key = debugKey; }, [debugKey]);
  const keyOf = (i: CrPathItem) => `${i.kind}:${i.owner}:${i.net}`;
  const debug = debugTabs.find((i) => keyOf(i) === debugKey) ?? null;

  /** The same propose→review→record flow the Clock Tree page has — HERE, because this is the
   *  page the violations are read on. Deletions of harmful/redundant recorded muxes ride in the
   *  same reviewed list, so the plan heals itself instead of waiting for a console command. */
  const [fixing, setFixing] = useState(false);
  const doFix = async () => {
    if (!data) return;
    setFixing(true);
    try {
      let dynamicModule: string | undefined, staticModule: string | undefined;
      try {
        const libMods = await scanIpLibrary(dfxIpDir(),
          (d) => (window as unknown as { dft: { project: { listDir(d: string): Promise<string[]> } } }).dft.project.listDir(d),
          (f) => hs.readSource(f));
        dynamicModule = libMods.find((m) => DYNAMIC_RE.test(m.name))?.name;
        staticModule = libMods.find((m) => STATIC_RE.test(m.name))?.name;
      } catch { /* no library scanned — the house names are used */ }
      // MULTI-ROUND until converged: a fix that must first DELETE a harmful mux only knows
      // what to ADD after the re-run (the deleted mux was deciding the values). One click
      // walks the rounds — each with its own review dialog — instead of leaving the plan
      // half-repaired and the schematic looking "还是没正确autofix".
      let cur = data;
      for (let round = 0; round < 4; round++) {
        const st = await hs.dpShell("report_dft_ips; report_dft_ctrl_mux");
        const ips = (st.dftIps ?? []).map((x) => ({ instance: x.instance, module: x.module, at: x.at }));
        const patched = (st.ctrlMuxes ?? []).map((m) => m.target);
        const picked = await askResetFix({ items: cur.items, ips, patched, dynamicModule, staticModule,
          currentMuxes: st.ctrlMuxes ?? [] });
        if (!picked?.length) return;
        const ran = picked.filter((x) => !x.command.startsWith("#"));
        for (const a of ran) await hs.dpShell(a.command);
        const r = await load();   // re-run: RB/R1/R3 move to FIX, and what remains is real work
        if (!r) return;
        cur = r;
        // Deletions change what the next round must add — continue. A round that only ADDED
        // is terminal: the re-run just showed its outcome.
        if (!ran.some((x) => x.command.startsWith("delete_dft_ctrl_mux"))) return;
        if (!cur.items.some((i) => i.kind === "reset" && !i.ok)) return;   // already clean
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setFixing(false); }
  };

  // ---- SCRIPTS PREVIEW: the autofix's actual output, readable on demand ("我希望这里能有
  // preview 的界面看看 autofix 对应的脚本"). Three artifacts, fetched live from the daemon /
  // the plan directory, refreshed whenever the plan moves while the panel is open:
  //   dfx_dft_plan.tcl              — the replayable plan (IPs, muxes, constraints)
  //   reset_drc_pin_constraint.tcl  — the DRC's own constraint setup
  //   dft instantiation             — create_instance/create_connection for the insertion flow
  const [scripts, setScripts] = useState<{ plan: string; cons: string; inst: string } | null>(null);
  const [showScripts, setShowScripts] = useState(false);
  const drcRevForScripts = useStore((st) => st.drcRev);
  useEffect(() => {
    if (!showScripts) return;
    let dead = false;
    void (async () => {
      let plan = "", cons = "";
      try {
        const lo = await (window as unknown as {
          dft?: { app?: { launchOptions?(): Promise<{ specLogicTestDir?: string }> } };
        }).dft?.app?.launchOptions?.();
        const dir = lo?.specLogicTestDir;
        if (dir) {
          plan = await hs.readSource(`${dir}/dfx_dft_plan.tcl`).catch(() => "");
          cons = await hs.readSource(`${dir}/reset_drc_pin_constraint.tcl`).catch(() => "");
        }
      } catch { /* standalone run: no plan dir — the shell state below still shows */ }
      let inst = "";
      try { inst = (await hs.dpShell("report_dft_instantiation")).output; } catch { /* daemon gone */ }
      if (!dead) setScripts({ plan: plan || "# (no dfx_dft_plan.tcl yet)",
                              cons: cons || "# (no reset_drc_pin_constraint.tcl yet)",
                              inst: inst || "# (nothing planned yet)" });
    })();
    return () => { dead = true; };
  }, [showScripts, drcRevForScripts]);

  /** Write the three scripts the insertion flow consumes, and report exactly where they are.
   *  Everything is produced by the shell's own commands, so a script can do the same thing. */
  const [exporting, setExporting] = useState(false);
  const exportFix = async () => {
    setExporting(true);
    try {
      // write_occ_def_points + the plan auto-write need an out dir; write_dft_instantiation
      // defaults into it too. The shell reports each file it writes.
      const r = await hs.dpShell("write_dft_instantiation");
      const lines = [r.output.trim()];
      // The plan + constraint files are kept current on every change; naming them here saves
      // the user hunting for where the auto-write went.
      const st = await hs.dpShell("set_occ_out_dir");
      const dir = /:\s*(\S+)/.exec(st.output)?.[1] ?? "";
      if (dir) lines.push(`plan:        ${dir}/dfx_dft_plan.tcl`,
                          `constraints: ${dir}/reset_drc_pin_constraint.tcl`);
      if (!r.ok && r.error) throw new Error(r.error);
      const nl = String.fromCharCode(10);
      notify("Fix scripts written:" + nl + lines.filter(Boolean).join(nl) + nl +
             "Run them in your insertion flow, then re-open the inserted design — " +
             "yellow FIX turns green when the netlist really holds.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setExporting(false); }
  };

  const openDebug = (i: CrPathItem) => {
    setDebugTabs((ts) => (ts.some((t) => keyOf(t) === keyOf(i)) ? ts : [...ts, i]));
    setDebugKey(keyOf(i));
  };
  const closeDebug = (k: string) => {
    setDebugTabs((ts) => ts.filter((t) => keyOf(t) !== k));
    setDebugKey((cur) => (cur === k ? "" : cur));
  };

  // Active tab -> the EXACT circuit of this violation (only the walked hops), rendered by
  // the real schematic engine. The violating flop group and the point where the signal is
  // lost are flagged red — that is where the user starts debugging.
  const debugSeed = debug ? `drcsch:${keyOf(debug)}` : "";
  useEffect(() => {
    // Tell the schematic WHICH violation this canvas is about, so each planned mux can be
    // labelled "本组的修复点" vs "其他分支" instead of both reading as the same fix twice.
    useStore.getState().setCrDebugItem(debug ?? null);
    if (!debug) return;
    // Remount with the SAME analysis result: keep the existing (possibly user-grown) graph.
    const h = JSON.stringify(debug);
    if (builtDbg.get(debugSeed) === h && useStore.getState().schematics[debugSeed]) return;
    builtDbg.set(debugSeed, h);
    const insts = useStore.getState().instances;
    putSchematic(buildCrSchematic([debug], {
      // alert only while the item still VIOLATES a rule — after a fixing Run DRC the red
      // flags come off and the debug header shows ✔ resolved.
      seedId: debugSeed, roots,
      isBad: (i) => RULES.some((ru) => ru.id !== "FIX" && ru.match(i)),
      moduleNameOf: (id) => {
        const d = insts[id]?.definitionId;
        return d ? splitDefId(d).designName : undefined;
      },
    }));
  }, [debug, debugSeed, roots, putSchematic]);

  // Debug right pane: what the engineer needs NEXT TO the circuit. Default = the fix script
  // for THIS violation ("我希望右边显示 fix script"); the walked path and the rule text are
  // one tab away instead of front and center with no stated purpose.
  const [debugTab, setDebugTab] = useState<"fix" | "path" | "why">("fix");
  const [debugFix, setDebugFix] = useState<{
    recorded: string[]; proposed: string[]; coverage?: string[];
  } | null>(null);
  // The latest DRC result, readable inside the async fix-panel effect without making that
  // effect re-run on every analysis (it keys on the selected violation, by design).
  const dataRef = useRef<ClockResetTreeResult | null>(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const debugKeyStr = debug ? keyOf(debug) : "";
  const drcRevDbg = useStore((st) => st.drcRev);
  useEffect(() => {
    if (!debug) { setDebugFix(null); return; }
    let dead = false;
    void (async () => {
      try {
        const st = await hs.dpShell("report_dft_ips; report_dft_ctrl_mux");
        const ips = (st.dftIps ?? []).map((x) => ({ instance: x.instance, module: x.module, at: x.at }));
        const cur = st.ctrlMuxes ?? [];
        const patched = cur.map((m) => m.target);
        const u = (x: string) => x.replace(/[.:]/g, "/");
        // commands already recorded that BEAR on this violation (its planned mux / its source)
        const mine = new Set([u(debug.plannedMuxTarget ?? ""), fixPoint(debug)].filter(Boolean));
        const recorded = cur
          .filter((m) => [...mine].some((t) => u(m.target) === t || u(m.target).endsWith("/" + t) || t.endsWith("/" + u(m.target))))
          .map((m) => `add_dft_ctrl_mux ${u(m.target)} -override_source ${m.overrideSource} -select ${m.select}`);
        // …and what Fix would run for it now (empty when it already passes)
        const proposed = debug.ok ? [] :
          proposeResetFixes({ items: [debug], ips, patched, currentMuxes: cur })
            .filter((a) => !a.command.startsWith("#"))
            .map((a) => a.command);
        // WHO each recorded mux is for. Several muxes sit on one wire because a reset chain
        // crosses several register outputs, and each of those is X while shifting no matter
        // what feeds it — so they serve disjoint flop groups rather than repeating a fix. One
        // that no failing group names is genuinely redundant, and says so.
        const cov = muxCoverage(dataRef.current?.items ?? [], patched.map(u)).map((c) =>
          c.redundant
            ? `# ${c.target}: 没有任何复位组(失败的或被它保持的)需要它 —— 可能是多余的 mux`
            : `# ${c.target}: 服务 ${c.groups} 个复位组 / ${c.flops} 个触发器` +
              (c.serves.length ? `(${c.serves.join(", ")})` : ""));
        if (!dead) setDebugFix({ recorded, proposed, coverage: cov });
      } catch { if (!dead) setDebugFix({ recorded: [], proposed: [], coverage: [] }); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugKeyStr, drcRevDbg]);

  // Scan-mode force list. `scan_enable` is the conventional name; the user can change it and
  // anything they have recorded with set_case_analysis still applies underneath.
  const [scanSig, setScanSig] = useState(() => localStorage.getItem("dft-suite.scanSignal") ?? "");
  // Width of the hop-list pane. The schematic takes the rest; drag the divider to trade one for
  // the other (a long hierarchical path does not fit in a fixed 40% column).
  const [pathW, setPathW] = useState(() => Number(localStorage.getItem("dft-suite.drcPathW")) || 420);
  const dragPath = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = pathW;
    const move = (ev: MouseEvent) => {
      const w = Math.max(160, Math.min(1400, startW - (ev.clientX - startX)));
      setPathW(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      localStorage.setItem("dft-suite.drcPathW", String(pathW));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Outcome of the LAST Run DRC vs the one before: the proof a constraint worked.
  const [lastDiff, setLastDiff] = useState<{ fixed: string[]; added: string[]; total: number } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      // The OCC definition points come from dp_shell — the same list `write_occ_points` emits,
      // so the DRC checks the plan the user actually recorded, never an inferred one.
      let occ: string[] = [];
      // Pin constraints declared in the shell (add_pin_constraint) apply to THIS run too —
      // "constrain in the shell, click Run DRC" must behave exactly like run_drc in the shell.
      let cons: Array<{ pin: string; value: string }> = [];
      try {
        const st = await hs.dpShell("report_occ_def_points");
        occ = st.occPoints.map((p) => p.pin);
        cons = (st.pinConstraints ?? []).filter((c) => c.value === "0" || c.value === "1");
      } catch { /* shell not ready: fall back to a functional-only run */ }
      const forces = scanSig.trim() ? [{ pin: scanSig.trim(), value: 1 }] : [];
      // Run the analysis THROUGH dp_shell so the console shows exactly what was executed and the
      // same commands can be replayed from a script — the GUI must never be able to do something
      // the shell cannot express.
      const script = [
        "set_scope drc_analysis",
        sdc ? `read_sdc ${sdc}` : "",
        lib ? `set_dft_lib ${lib}` : "",
        ...(scanSig.trim() ? [`add_dft_signals ${scanSig.trim()} -value 1`] : []),
        "run_drc",
      ].filter(Boolean).join("\n");
      try { await hs.dpShell(script); } catch { /* console echo is best-effort */ }
      // phases:true — the debug schematic labels DFFs s()-sac()/asc(), same as Clock Tree.
      const r = await hs.clockResetTree(sdc, lib, occ, forces, cons, true);
      // DIFF against the previous run: which violations a re-run FIXED (and which appeared).
      const vioKeys = (d: ClockResetTreeResult | null): Set<string> => {
        const out = new Set<string>();
        for (const i of d?.items ?? [])
          if (RULES.some((ru) => ru.id !== "FIX" && ru.match(i))) out.add(keyOf(i));
        return out;
      };
      const before = vioKeys(data);
      const after = vioKeys(r);
      if (data) {
        const fixed = [...before].filter((k) => !after.has(k));
        const added = [...after].filter((k) => !before.has(k));
        setLastDiff({ fixed, added, total: after.size });
        notify(`Run DRC: ${after.size} violation(s) — ${fixed.length} fixed, ${added.length} new`);
      }
      crCacheSet(sdc, lib, r);
      setData(r);
      // Publish for the schematic: it labels each planned mux with the flop groups that need
      // it, so two muxes in series on one wire can be told apart instead of reading as one
      // fix applied twice.
      useStore.getState().setCrItems(r.items);
      useStore.getState().setCrClocks(r.clocks);
      // Open debug tabs hold ITEM SNAPSHOTS — refresh them from the new run so the wire
      // value chips update (a constraint that fixed a path must show 0/1, not stale X).
      setDebugTabs((ts) => ts.map((t) => r.items.find((i) => keyOf(i) === keyOf(t)) ?? t));
      if (sdc) localStorage.setItem("dft-suite.funcSdc", sdc);
      if (scanSig.trim()) localStorage.setItem("dft-suite.scanSignal", scanSig.trim());
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [sdc, lib, scanSig, data, setError]);

  // DRC runs ONLY when the user asks. Auto-running on first paint meant a full-chip walk every
  // time the page was opened — on a large design that is seconds of stall before the user has
  // even chosen an SDC. A cached result from an earlier explicit run is still shown immediately
  // (`data` is seeded from crCache), so re-opening the page costs nothing.
  //
  // …but once a result IS on screen, a plan change (add_pin_constraint from the schematic's
  // context menu, a recorded mux, a phase constraint) RE-SIMULATES it automatically: the user
  // constrains a pin on the picture and the whole page — table, debug schematics, wire values —
  // recomputes with the real propagated states. "constrain, then remember to click Run DRC"
  // is exactly the stale-view trap this tool exists to remove.
  const drcRev = useStore((s) => s.drcRev);
  const firstRev = useRef(drcRev);
  useEffect(() => {
    if (drcRev === firstRev.current) return;   // mount, not a change
    firstRev.current = drcRev;
    if (data && !busy) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drcRev]);

  const items = data?.items ?? [];
  const byRule = useMemo(() => {
    const m = new Map<string, CrPathItem[]>();
    for (const r of RULES) m.set(r.id, items.filter(r.match));
    return m;
  }, [items]);
  const strip = (id: string) => {
    for (const r of roots) if (id === r) return id;
    for (const r of roots) if (id.startsWith(r + ".")) return id.slice(r.length + 1);
    return id;
  };
  const rows = byRule.get(ruleId) ?? [];
  // The FIX row is coverage, not a violation — a plan that fixes 113 groups must LOWER this
  // number, or fixing things reads as making no difference.
  const total = RULES.reduce((a, r) => a + (r.id === "FIX" ? 0 : byRule.get(r.id)?.length ?? 0), 0);

  return (
    <div className="drctab">
      <div className="crhead">
        <span style={{ fontWeight: 600 }}>DFT DRC</span>
        <input className="findinput" style={{ width: 300 }} placeholder="func SDC file"
               value={sdc} spellCheck={false}
               onChange={(e) => setSdc(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void load(); }} />
        <button className="findbtn" title="Pick an SDC/XDC file"
                onClick={() => void (async () => {
                  const p = await window.dft.design.pickSdc();
                  if (p) setSdc(p);
                })()}>
          Browse…
        </button>
        <input className="findinput" style={{ width: 150 }} placeholder="scan enable signal"
               value={scanSig} spellCheck={false}
               title="Forced to 1 for the scan-mode pass (S1/S2). Leave empty to skip that dimension."
               onChange={(e) => setScanSig(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void load(); }} />
        <button className="findbtn" onClick={() => void load()} disabled={busy}>{busy ? "…" : "Run DRC"}</button>
        <button className="findbtn" data-btn="open-dfxip" title="planned DFX IPs (dfx_dynamic/static_hyper_ctl) — reset-fix mux sources"
                onClick={() => useDesign.getState().setWorkspace("dfxip")}>DFX IP</button>
        <button className="findbtn" data-btn="scripts-preview"
                title="autofix 生成脚本的实时预览: dfx_dft_plan.tcl / reset_drc_pin_constraint.tcl / 虚拟例化脚本"
                onClick={() => setShowScripts(true)}>Scripts</button>
        {/* THE HANDOVER. The plan lives in this tool; the insertion happens in the user's flow.
            This writes everything that flow consumes and SAYS WHERE — the yellow FIX rows turn
            green only after these scripts are executed and the inserted design is re-analyzed. */}
        <button className="findbtn primary" data-btn="fix-reset-drc" disabled={fixing || !data}
                title="Propose the fix for every failing reset — harmful/redundant recorded muxes are deleted first; reviewed before anything is recorded"
                onClick={() => void doFix()}>
          {fixing ? "…" : "Fix reset DRC…"}
        </button>
        <button className="findbtn" data-btn="export-fix" disabled={exporting}
                title="Write dfx_dft_plan.tcl / dfx_instantiation.tcl / reset_drc_pin_constraint.tcl for your insertion flow"
                onClick={() => void exportFix()}>
          {exporting ? "…" : "Export fix scripts"}
        </button>
        {/* header TABS: the violations table + one FULL-PAGE debug tab per opened violation */}
        <div className="drctabs">
          <span className={"drcdbgtab" + (debugKey === "" ? " on" : "")}
                onClick={() => setDebugKey("")}>
            violations{total > 0 ? ` (${total})` : ""}
          </span>
          {debugTabs.map((t) => {
            const k = keyOf(t);
            const name = `${t.owner.split(".").pop()}/${t.net}`;
            return (
              <span key={k} className={"drcdbgtab" + (k === debugKey ? " on" : "")}
                    title={`${strip(t.owner)} / ${t.net} — click to show this violation's circuit`}
                    onClick={() => setDebugKey(k)}>
                {name}
                <span className="drcdbgx" title="close"
                      onClick={(e) => { e.stopPropagation(); closeDebug(k); }}>×</span>
              </span>
            );
          })}
        </div>
        <span className="crstat">
          {data && `${total} violation(s) over ${items.length} clock/reset group(s)`}
        </span>
      </div>
      {data && data.sdcErrors.length > 0 && (
        <div className="crnote">{data.sdcErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}</div>
      )}
      {/* Outcome of the last Run DRC vs the run before — the direct answer to "did my
          constraint fix it?". Names the first few fixed violations explicitly. */}
      {lastDiff && (lastDiff.fixed.length > 0 || lastDiff.added.length > 0) && (
        <div className={"drcdiff" + (lastDiff.added.length ? " warn" : "")} data-status="run-diff">
          {lastDiff.fixed.length > 0 && (
            <span>✔ fixed {lastDiff.fixed.length} violation(s):&nbsp;
              {lastDiff.fixed.slice(0, 3).map((k) => strip(k.split(":").slice(1).join("/"))).join(", ")}
              {lastDiff.fixed.length > 3 ? ` … +${lastDiff.fixed.length - 3}` : ""}</span>
          )}
          {lastDiff.added.length > 0 && (
            <span style={{ marginLeft: 12 }}>⚠ {lastDiff.added.length} new violation(s)</span>
          )}
          <span className="muted" style={{ marginLeft: 12 }}>{lastDiff.total} remaining</span>
        </div>
      )}

      {showScripts && (() => {
        const pre: React.CSSProperties = {
          margin: 0, padding: "6px 8px", flex: 1, minHeight: 0, overflow: "auto",
          fontSize: 11, lineHeight: 1.45, whiteSpace: "pre",
          background: "rgba(0,0,0,0.25)", border: "1px solid #333a44", borderRadius: 4,
        };
        const copy = (t: string) => { void navigator.clipboard?.writeText(t); notify("copied"); };
        const blocks: Array<[string, string, string]> = [
          ["dfx_dft_plan.tcl — 可重放的完整计划 (IP/mux/约束)", scripts?.plan ?? "loading…", "plan"],
          ["reset_drc_pin_constraint.tcl — DRC 约束", scripts?.cons ?? "loading…", "cons"],
          ["DFT 虚拟例化 — create_instance / create_connection (交给 insertion)", scripts?.inst ?? "loading…", "inst"],
        ];
        return (
          <div className="gc-prompt-overlay" onMouseDown={() => setShowScripts(false)}>
            <div className="cmux-box" style={{ width: "min(1100px, 92vw)", height: "min(720px, 88vh)",
                                               display: "flex", flexDirection: "column" }}
                 onMouseDown={(e) => e.stopPropagation()}>
              <div className="cmux-head" style={{ display: "flex", alignItems: "center" }}>
                Autofix 生成脚本 preview — 随 plan 实时刷新
                <span style={{ flex: 1 }} />
                <button className="findbtn" onClick={() => setShowScripts(false)}>✕ close</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8,
                            flex: 1, minHeight: 0 }}>
                {blocks.map(([title, text, key]) => (
                  <div key={key} style={{ flex: 1, minHeight: 0, display: "flex",
                                          flexDirection: "column" }}>
                    <div style={{ fontSize: 11, opacity: 0.75, display: "flex", marginBottom: 2 }}>
                      {title}
                      <span style={{ flex: 1 }} />
                      <a style={{ cursor: "pointer" }} data-btn={"copy-" + key}
                         onClick={() => copy(text)}>copy</a>
                    </div>
                    <pre style={pre} data-panel={"script-" + key}>{text}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {!debug && <div className="drcbody">
        {/* LEFT: rule categories */}
        <div className="drcrules">
          {RULES.map((r) => {
            const n = byRule.get(r.id)?.length ?? 0;
            return (
              <div key={r.id}
                   className={"drcrule" + (ruleId === r.id ? " sel" : "") + (n ? " has" : "")}
                   onClick={() => setRuleId(r.id)}>
                <span className="drcid">{r.id}</span>
                <span className="drcdesc">{r.desc}</span>
                <span className={"drccnt" + (n ? (r.id === "FIX" ? " fix" : " bad") : "")}>{n}</span>
              </div>
            );
          })}
        </div>

        {/* RIGHT: violations of the selected rule */}
        <div className="drclist">
          {(() => {
            const r = RULES.find((x) => x.id === ruleId);
            if (!r) return null;
            return (
              <div className="crnote" data-note="rule-explain" style={{ whiteSpace: "normal" }}>
                <b>{r.id}</b> — {r.desc}
                <div style={{ marginTop: 2 }}>问题:{r.why}</div>
                <div>修复:{r.fix}</div>
              </div>
            );
          })()}
          <div className="drcrow drchd">
            <span className="c-inst">instance</span>
            <span className="c-net">clock/reset net</span>
            <span className="c-edge">edge</span>
            <span className="c-val">value</span>
            <span className="c-flops">regs</span>
            <span className="c-src">source (where the walk ended)</span>
          </div>
          {rows.length === 0 && <div className="muted pad">no {ruleId} violations</div>}
          {/* GROUPED BY ROOT CAUSE: violations sharing one culprit (same lost-signal
              statement / same missing OCC) are one FIX, not N problems — the header names
              the common point, biggest impact first. */}
          {(() => {
            const culpritOf = (i: CrPathItem): string => {
              if (ruleId.startsWith("S"))
                return i.scanOcc ? `OCC ${strip(i.scanOccPoint ?? "")}`
                  : `no OCC — ${i.scanTerminus}${i.scanDetail ? ": " + strip(i.scanDetail) : ""}`;
              if (i.terminusFile && i.terminusLine)
                return `${i.terminus} @ ${(i.terminusFile.split("/").pop() ?? "")}:${i.terminusLine}`
                  + (i.detail ? ` — ${strip(i.detail.split(" <-")[0].split(" [")[0])}` : "");
              if (i.detail) return `${i.terminus}: ${strip(i.detail.split(" <-")[0].split(" [")[0])}`;
              return i.terminus || "?";
            };
            const m = new Map<string, CrPathItem[]>();
            for (const i of rows) {
              const k = culpritOf(i);
              const a = m.get(k);
              if (a) a.push(i); else m.set(k, [i]);
            }
            const groups = [...m.entries()].sort((a, b) =>
              b[1].reduce((t, x) => t + x.flopCount, 0) - a[1].reduce((t, x) => t + x.flopCount, 0));
            return groups.map(([culprit, list]) => (
              <div key={culprit}>
                <div className="drcgroup" data-row="culprit"
                     title="every violation below shares this root cause — one fix clears the whole group">
                  根因 {culprit}
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {list.length} violation(s) · ×{list.reduce((t, x) => t + x.flopCount, 0)} flops
                  </span>
                </div>
                {list.map((i) => (
            <div key={i.owner + i.net}
                 className={"drcrow" + (debug && keyOf(debug) === keyOf(i) ? " sel" : "")}
                 title={explainItem(i, strip) + "\n\n双击打开该违例的实际电路 (debug)"}
                 onDoubleClick={() => openDebug(i)}>
              <span className="c-inst" title={strip(i.owner)}>{strip(i.owner)}</span>
              <span className="c-net">{i.net}</span>
              <span className="c-edge">{i.edge}</span>
              <span className="c-val">
                <b>{i.value}</b>{i.kind === "reset" ? ` (inactive=${i.inactive})` : ""}
                {/* scan-mode result sits next to the functional one: the two differ, and it is
                    the scan value that decides whether the chain shifts. */}
                {i.scanChecked && <span className="muted"> · scan <b>{i.scanValue}</b></span>}
              </span>
              <span className="c-flops">×{i.flopCount}</span>
              <span className="c-src" title={i.scanChecked
                     ? `functional: ${i.path.join("  →  ")}\nscan: ${i.scanTerminus}${i.scanDetail ? " " + i.scanDetail : ""}`
                     : i.path.join("  →  ")}>
                {ruleId.startsWith("S")
                  ? (i.scanOcc ? `OCC ${strip(i.scanOccPoint ?? "")}`
                               : `no OCC — ends at ${i.scanTerminus}${i.scanDetail ? ": " + strip(i.scanDetail) : ""}`)
                  : `${i.terminus}${i.detail ? ": " + strip(i.detail) : ""}`}
              </span>
            </div>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>}

      {/* DEBUG tab (full page): the exact broken path drawn as a schematic, large. */}
      {debug && (
        <div className="drcdebug full">
          <div className="drcdebug-h">
            <span>debug: {strip(debug.owner)}/{debug.net}</span>
            {!RULES.some((ru) => ru.match(debug)) && (
              <span className="drcfixed" data-status="resolved" style={{ marginLeft: 10 }}>
                ✔ resolved — this violation is gone in the latest Run DRC
              </span>
            )}
            <span className="muted" style={{ marginLeft: 10 }}>
              {debug.path.length} hop(s) walked · hover the diagram for details
            </span>
            <button className="findbtn" style={{ marginLeft: "auto" }}
                    onClick={() => setDebugKey("")}>✕ close</button>
          </div>
          <div className="crnote" data-note="debug-explain" style={{ whiteSpace: "normal" }}>
            {explainItem(debug, strip)}
          </div>
          <div className="drcdebug-body">
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              {/* CURATED, same as the Clock Tree schematic (per user): hierarchical pins and
                  ports render identically — on-border markers, click-select, right-click
                  copy/add_occ_point — instead of the free-explore trace diamonds. Debugging
                  still grows the circuit through the node menus (Show RTL Primitives, Show
                  All Pins, trace-through on logic boxes), which merge dedup'd into this
                  graph; it is rebuilt only when the selected violation changes, so those
                  additions survive while the tab is open. */}
              <SchematicTab seedNodeId={debugSeed} curated allowOcc={debug.kind === "clock"} />
            </div>
            <div className="drcsplit" onMouseDown={dragPath}
                 style={{ width: 7, cursor: "col-resize", flexShrink: 0 }}
                 title="左右拖动调整宽度 (drag to resize)" />
            <div className="drcpath" style={{ flexBasis: pathW, maxWidth: "none",
                                              display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 4, padding: "2px 4px", flexShrink: 0 }}>
                {([["fix", "Fix 脚本"], ["path", "路径"], ["why", "说明"]] as const).map(([k, label]) => (
                  <button key={k} className={"findbtn" + (debugTab === k ? " primary" : "")}
                          data-btn={"dbg-" + k}
                          onClick={() => setDebugTab(k)}>{label}</button>
                ))}
              </div>
              {debugTab === "fix" && (() => {
                const blocks: Array<[string, string[]]> = [
                  ["已记录 (dfx_dft_plan.tcl 中与本违例相关)", debugFix?.recorded ?? []],
                  [debug.ok ? "无需新动作 — 该组已通过" : "Fix 将执行 (点 Fix reset DRC 应用)",
                   debugFix?.proposed ?? []],
                  // 同一根线上出现多个 mux 时,这里说明每个 mux 各自负责哪些触发器 ——
                  // 复位链每经过一级寄存器输出就多一个 X 源,必须各自控制,不是重复修复。
                  ["每个已记录 mux 覆盖谁 (复位链每级寄存器输出都是独立的 X 源)",
                   debugFix?.coverage ?? []],
                ];
                const all = blocks.flatMap(([, c]) => c).join("\n");
                return (
                  <div style={{ overflow: "auto", padding: "2px 6px", fontSize: 11,
                                lineHeight: 1.5, minHeight: 0 }}>
                    {blocks.map(([title, cmds]) => (
                      <div key={title} style={{ marginBottom: 6 }}>
                        <div style={{ opacity: 0.65 }}>{title}</div>
                        {cmds.length === 0
                          ? <div className="muted">(无)</div>
                          : cmds.map((c) => (
                              <pre key={c} style={{ margin: "2px 0", whiteSpace: "pre-wrap",
                                                    background: "rgba(0,0,0,0.25)",
                                                    border: "1px solid #333a44",
                                                    borderRadius: 4, padding: "3px 6px" }}>{c}</pre>
                            ))}
                      </div>
                    ))}
                    {all && (
                      <a style={{ cursor: "pointer", fontSize: 11 }} data-btn="copy-dbg-fix"
                         onClick={() => { void navigator.clipboard?.writeText(all); notify("copied"); }}>
                        copy 全部</a>
                    )}
                  </div>
                );
              })()}
              {debugTab === "path" && (
                <div style={{ overflow: "auto", minHeight: 0 }}>
                  {debug.path.map((p, k) => (
                    <div key={k} className="drcpath-hop">{k === 0 ? "flop  " : "  ↑   "}{strip(p).replace(/:/g, " : ")}</div>
                  ))}
                  <div className="drcpath-hop drcpath-end">
                    ✖ {debug.terminus}{debug.detail ? `  ${strip(debug.detail)}` : ""} — 信号在此丢失/终止
                  </div>
                </div>
              )}
              {debugTab === "why" && (() => {
                const r = RULES.find((ru) => ru.id !== "FIX" && ru.match(debug)) ??
                          RULES.find((ru) => ru.match(debug));
                return (
                  <div style={{ overflow: "auto", padding: "4px 8px", fontSize: 12,
                                lineHeight: 1.6, whiteSpace: "normal", minHeight: 0 }}>
                    <div>{explainItem(debug, strip)}</div>
                    {r && <>
                      <div style={{ marginTop: 6 }}><b>{r.id}</b> — {r.desc}</div>
                      <div style={{ marginTop: 4 }}>问题:{r.why}</div>
                      <div style={{ marginTop: 4 }}>修复:{r.fix}</div>
                    </>}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
