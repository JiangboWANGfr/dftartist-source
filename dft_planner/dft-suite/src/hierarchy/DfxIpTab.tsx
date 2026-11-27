// DFX IP planner: the user's reset-fix methodology needs dfx_dynamic_hyper_ctl /
// dfx_static_hyper_ctl_tdr instantiated BEFORE any dmux2_1 patch can reference their
// outputs (dfx_rst_scan_n / dfx_scan_mode). This tab:
//   1. scans the user's dfx_ip library dir for IP modules (+ ports, light parse),
//   2. records planned instantiations through dp_shell `add_dft_ip` (replayable, listed),
//   3. draws the CONTROL CIRCUIT around a selected IP: the IP box, every recorded
//      dmux2_1 (add_dft_ctrl_mux) wired from its outputs, original reset in, patched out.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { dftDesign as hs } from "../core-bridge/client.ts";
import type { DpShellResult } from "../core-bridge/model.ts";
import { SchematicTab } from "./schematic/SchematicTab.tsx";
import type { SchematicGraph, SchNode, SchEdge } from "./core/schematic.ts";
import { notify } from "../common/notify.ts";
import { DFX_IP_DIR_KEY, forgetIpLibrary, scanIpLibrary, type IpModule } from "./core/dfxIpLib.ts";

const userPath = (p: string) => p.replace(/[.:]/g, "/");

/** The planned hierarchical path of a recorded IP instance. */
const ipPath = (x: { instance: string; at: string }): string =>
  x.at ? `${userPath(x.at)}/${x.instance}` : x.instance;

export function DfxIpTab() {
  const putSchematic = useStore((s) => s.putSchematic);
  const setError = useStore((s) => s.setError);
  const [libDir, setLibDir] = useState(() => localStorage.getItem(DFX_IP_DIR_KEY) ?? "");
  const [modules, setModules] = useState<IpModule[]>([]);
  const [shell, setShell] = useState<DpShellResult | null>(null);
  const [selIp, setSelIp] = useState("");
  const [formModule, setFormModule] = useState("");
  const [formInst, setFormInst] = useState("");
  const [formAt, setFormAt] = useState("");
  // What the right pane shows. The library was scanned and then invisible: 9 modules existed
  // only as a count and a dropdown, and the Verilog behind them could not be read at all.
  const [view, setView] = useState<"circuit" | "verilog">("circuit");
  const [srcModule, setSrcModule] = useState("");   // module whose source is being read
  const [wholeFile, setWholeFile] = useState(false);
  const [src, setSrc] = useState<{ file: string; text: string } | null>(null);
  // Verilog EDITING ("希望在 verilog 界面可以编辑 IP"): the whole file in a textarea, saved
  // back to disk, then re-scanned AND re-compiled (read_dfx_ip) so every computed value
  // follows the edited circuit immediately.
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try { setShell(await hs.dpShell("report_dft_ips\nreport_dft_ctrl_mux")); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [setError]);
  useEffect(() => { void refresh(); }, [refresh]);

  const scan = useCallback(async (dirArg?: string) => {
    const dir = (dirArg ?? libDir).trim();
    if (!dir) return;
    try {
      // Scan button = re-read from disk; the memo is what the mux dialog shares.
      forgetIpLibrary(dir);
      const mods = await scanIpLibrary(dir,
        (d) => (window as any).dft.project.listDir(d), (f) => hs.readSource(f));
      setModules(mods);
      notify(`scanned ${mods.length} IP module(s)`);
      // COMPILE the library into the daemon too (idempotent for an unchanged path): planned-IP
      // pins evaluate from the real circuit the moment the library is picked — no reopen, no
      // manual read_dfx_ip. Failures are informative, not fatal: the scan above already worked.
      try { await hs.dpShell(`read_dfx_ip {${dir}}`); }
      catch (e) { notify(`read_dfx_ip: ${e instanceof Error ? e.message : String(e)}`); }
    } catch (e) { setError(`cannot scan ${dir}: ${e instanceof Error ? e.message : String(e)}`); }
  }, [libDir, setError]);
  // auto-scan the remembered dir on first open
  useEffect(() => { if (libDir.trim()) void scan(); /* eslint-disable-next-line */ }, []);

  // Source of the module being looked at. Read through the same daemon call the rest of the
  // tool uses, cached per file so flipping between modules of one file does not re-read it.
  const srcCache = useRef<Map<string, string>>(new Map());
  const mod = useMemo(() => modules.find((m) => m.name === srcModule), [modules, srcModule]);
  useEffect(() => {
    if (!mod) { setSrc(null); return; }
    let dead = false;
    void (async () => {
      let text = srcCache.current.get(mod.file);
      if (text === undefined) {
        try { text = await hs.readSource(mod.file); }
        catch (e) { text = `// cannot read ${mod.file}
// ${e instanceof Error ? e.message : String(e)}`; }
        srcCache.current.set(mod.file, text);
      }
      if (!dead) setSrc({ file: mod.file, text });
    })();
    return () => { dead = true; };
  }, [mod]);

  const shownSrc = useMemo(() => {
    if (!src || !mod) return "";
    const cut = src.text.slice(mod.at, mod.end);
    return wholeFile ? src.text : cut.replace(/^\s*\n/, "");
  }, [src, mod, wholeFile]);

  const addIp = useCallback(async () => {
    if (!formModule.trim() || !formInst.trim()) return;
    const cmd = `add_dft_ip ${formModule.trim()} -instance ${formInst.trim()}` +
                (formAt.trim() ? ` -at ${formAt.trim()}` : "");
    try {
      const r = await hs.dpShell(cmd);
      if (!r.ok) setError(`dp_shell: ${r.error || cmd}`);
      else { notify(`✓ ${cmd}`); setFormInst(""); }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [formModule, formInst, formAt, refresh, setError]);

  const removeIp = useCallback(async (inst: string) => {
    try { await hs.dpShell(`remove_dft_ip ${inst}`); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [refresh, setError]);

  const ips = shell?.dftIps ?? [];
  const muxes = shell?.ctrlMuxes ?? [];

  // ---- CONTROL CIRCUIT of the selected IP: IP box (real ports when the library knows the
  // module) + every dmux2_1 whose -select / -override_source comes from this instance, wired
  // per the user's methodology: s = dfx_scan_mode, in2 = dfx_rst_scan_n, in1 = original reset.
  const seed = selIp ? `dfxip:${selIp}` : "";
  useEffect(() => {
    if (!selIp) return;
    const ip = ips.find((x) => x.instance === selIp);
    if (!ip) return;
    const nodes: Record<string, SchNode> = {};
    const edges: SchEdge[] = [];
    const mkIpNode = (x: typeof ip): SchNode => {
      const lib = modules.find((mm) => mm.name === x.module);
      return {
        id: `dfxip:${x.instance}`, instanceName: x.instance, designName: x.module,
        kind: "module", isLeaf: true,
        ports: (lib?.ports.length ? lib.ports : [{ name: "…", dir: "out" as const }])
          .map((p) => ({ name: p.name, direction: p.dir === "inout" ? "in" : p.dir, busLabel: p.name })),
      };
    };
    nodes[`dfxip:${ip.instance}`] = mkIpNode(ip);
    const pinOf = (full: string): { node: string; port: string } | null => {
      for (const x of ips) {
        const pref = ipPath(x) + "/";
        if (full.startsWith(pref)) {
          if (!nodes[`dfxip:${x.instance}`]) nodes[`dfxip:${x.instance}`] = mkIpNode(x);
          return { node: `dfxip:${x.instance}`, port: full.slice(pref.length) };
        }
      }
      return null;
    };
    let k = 0;
    for (const m of muxes) {
      const selPin = pinOf(userPath(m.select));
      const srcPin = pinOf(userPath(m.overrideSource));
      const mine = (selPin?.node === `dfxip:${selIp}`) || (srcPin?.node === `dfxip:${selIp}`);
      if (!mine) continue;
      const mid = `dmux:${k++}:${m.target}`;
      nodes[mid] = {
        id: mid, instanceName: `dmux2_1 @ ${userPath(m.target)}`, designName: "MUX",
        kind: "logic", prim: "mux",
        ports: [
          { name: "s", direction: "in", busLabel: "s" },
          { name: "a", direction: "in", busLabel: "in2 (scan)" },
          { name: "b", direction: "in", busLabel: "in1 (func)" },
          { name: "o", direction: "out", busLabel: "out" },
        ],
      };
      const tapId = `net:${m.target}`;
      nodes[tapId] = {
        id: tapId, instanceName: userPath(m.target), designName: userPath(m.target),
        kind: "port", netTap: true,
        ports: [{ name: "o", direction: "out", busLabel: "original reset" }],
      };
      const outId = `out:${m.target}`;
      nodes[outId] = {
        id: outId, instanceName: "patched", designName: userPath(m.target),
        kind: "port", ports: [{ name: "i", direction: "in", busLabel: "to downstream" }],
      };
      if (selPin) edges.push({ id: `e${k}s`, fromNode: selPin.node, fromPort: selPin.port, toNode: mid, toPort: "s", netName: userPath(m.select), bus: false });
      if (srcPin) edges.push({ id: `e${k}a`, fromNode: srcPin.node, fromPort: srcPin.port, toNode: mid, toPort: "a", netName: userPath(m.overrideSource), bus: false });
      edges.push({ id: `e${k}b`, fromNode: tapId, fromPort: "o", toNode: mid, toPort: "b", netName: userPath(m.target), bus: false });
      edges.push({ id: `e${k}o`, fromNode: mid, fromPort: "o", toNode: outId, toPort: "i", netName: userPath(m.target), bus: false });
    }
    const g: SchematicGraph = { seedId: seed, nodes, edges, expanded: {}, empty: {}, inExpanded: {}, inEmpty: {} };
    putSchematic(g);
  }, [selIp, ips, muxes, modules, seed, putSchematic]);

  return (
    <div className="dfxip">
      <div className="dfxip-bar">
        <input className="findinput" style={{ flex: 1, minWidth: 200 }} spellCheck={false}
               placeholder="dfx_ip library dir (e.g. …/user_material/dfx_ip)"
               value={libDir} onChange={(e) => setLibDir(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void scan(); }} />
        <button className="findbtn" data-btn="browse-ip" title="pick the dfx_ip directory"
                onClick={() => void (async () => {
                  const d = await (window as any).dft.design.pickFolder?.();
                  if (d) { setLibDir(d); void scan(d); }
                })()}>Browse…</button>
        <button className="findbtn" data-btn="scan-ip" onClick={() => void scan()}>Scan</button>
        <span className="muted">{modules.length ? `${modules.length} module(s)` : "no library scanned"}</span>
      </div>
      <div className="dfxip-bar">
        <select className="findinput" value={formModule} onChange={(e) => setFormModule(e.target.value)}>
          <option value="">— module —</option>
          {modules.map((mm) => <option key={mm.name} value={mm.name}>{mm.name}</option>)}
        </select>
        <input className="findinput" placeholder="instance name (e.g. u_dfx_dyn_ctl)" spellCheck={false}
               value={formInst} onChange={(e) => setFormInst(e.target.value)} />
        <input className="findinput" placeholder="-at scope (empty = harden top)" spellCheck={false}
               value={formAt} onChange={(e) => setFormAt(e.target.value)} />
        <button className="findbtn" data-btn="add-ip" onClick={() => void addIp()}>add_dft_ip</button>
      </div>
      <div className="dfxip-body">
        <div className="dfxip-list">
          <div className="dfxip-sect">planned instances<span>{ips.length}</span></div>
          {ips.length === 0 && <div className="muted pad">no planned DFX IPs — add one above</div>}
          {ips.map((x) => (
            <div key={x.instance}
                 className={"dfxip-row" + (selIp === x.instance ? " sel" : "")}
                 onClick={() => { setSelIp(x.instance); setSrcModule(x.module); }}
                 title="click: show this IP's control circuit">
              <b>{x.instance}</b>
              <span className="muted">{x.module}</span>
              <span className="muted">{x.at ? `at ${userPath(x.at)}` : "at top"}</span>
              <button className="findbtn" style={{ marginLeft: "auto" }}
                      onClick={(e) => { e.stopPropagation(); void removeIp(x.instance); }}>✕</button>
            </div>
          ))}
          {/* THE LIBRARY ITSELF. It was scanned into a dropdown and a count — you could
              instantiate a module without ever seeing what it is. Clicking one opens its
              Verilog; the port list is what the control circuit is drawn from. */}
          <div className="dfxip-sect">library modules<span>{modules.length}</span></div>
          {modules.length === 0 && <div className="muted pad">no library scanned — pick a dir above</div>}
          {modules.map((mm) => (
            <div key={mm.file + mm.name}
                 className={"dfxip-row" + (srcModule === mm.name ? " sel" : "")}
                 onClickCapture={() => {
                   // Clicking a library module also FOLLOWS to its planned instance (if any),
                   // so the control-circuit pane never sits on "select a planned IP" while a
                   // perfectly good instance of the clicked module exists.
                   const inst = ips.find((x) => x.module === mm.name);
                   if (inst) setSelIp(inst.instance);
                 }}
                 onClick={() => { setSrcModule(mm.name); setView("verilog"); }}
                 title={`${mm.file}
click: show the Verilog`}>
              <b>{mm.name}</b>
              <span className="muted">{mm.ports.length} port(s)</span>
              <button className="findbtn" style={{ marginLeft: "auto" }}
                      title={`use ${mm.name} in the form above`}
                      onClick={(e) => { e.stopPropagation(); setFormModule(mm.name); }}>use</button>
            </div>
          ))}
        </div>
        <div className="dfxip-sch">
          <div className="dfxip-viewbar">
            <span className="sp-seg">
              <button className={view === "circuit" ? "on" : ""} onClick={() => setView("circuit")}>control circuit</button>
              <button className={view === "verilog" ? "on" : ""} onClick={() => setView("verilog")}>Verilog</button>
            </span>
            {view === "verilog" && mod && (
              <>
                <span className="muted" title={mod.file}>{mod.file.split(/[\/]/).pop()}</span>
                <label className="muted" title="show the whole file instead of just this module">
                  <input type="checkbox" checked={wholeFile} disabled={editing}
                         onChange={(e) => setWholeFile(e.target.checked)} />
                  whole file
                </label>
                <button className="findbtn" style={{ marginLeft: "auto" }}
                        onClick={() => void navigator.clipboard?.writeText(editing ? editText : shownSrc)}>Copy</button>
                <button className="findbtn" title="the module's ports, as the circuit view reads them"
                        onClick={() => notify(mod.ports.map((p) => `${p.dir} ${p.name}`).join("  ") || "no ports parsed")}>
                  ports
                </button>
                {!editing && (
                  <button className="findbtn" data-btn="edit-ip"
                          title="编辑该 IP 文件(整个文件);保存后自动重扫 + read_dfx_ip 重算"
                          onClick={() => { setEditText(src?.text ?? ""); setEditing(true); }}>
                    Edit
                  </button>
                )}
                {editing && (
                  <>
                    <button className="findbtn primary" data-btn="save-ip" disabled={saving}
                            onClick={() => void (async () => {
                              if (!src) return;
                              setSaving(true);
                              try {
                                const norm = src.file.replace(/\\/g, "/");
                                const cut = norm.lastIndexOf("/");
                                const dir = norm.slice(0, cut), name = norm.slice(cut + 1);
                                await (window as any).dft.project.writeFiles(dir, [{ relPath: name, text: editText }]);
                                notify(`saved ${name}`);
                                setEditing(false);
                                setSrc({ file: src.file, text: editText });
                                await scan();   // re-parse + read_dfx_ip: values follow the edit
                              } catch (e) {
                                setError(e instanceof Error ? e.message : String(e));
                              } finally { setSaving(false); }
                            })()}>
                      {saving ? "…" : "Save"}
                    </button>
                    <button className="findbtn" onClick={() => setEditing(false)}>Cancel</button>
                  </>
                )}
              </>
            )}
          </div>
          {view === "verilog" ? (
            mod
              ? (editing
                  ? <textarea className="dfxip-src" spellCheck={false} data-panel="ip-editor"
                              style={{ width: "100%", flex: 1, minHeight: 0, resize: "none",
                                       background: "rgba(0,0,0,0.25)", color: "inherit",
                                       font: "inherit", border: "1px solid #333a44" }}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)} />
                  : <pre className="dfxip-src">{shownSrc || "// reading…"}</pre>)
              : <div className="muted pad">pick a module on the left to read its Verilog</div>
          ) : selIp ? (
            <SchematicTab seedNodeId={seed} curated allowOcc={false} />
          ) : (
            <div className="muted pad">select a planned IP to see its control circuit
              (dmux2_1 patches wired from dfx_scan_mode / dfx_rst_scan_n)</div>
          )}
        </div>
      </div>
    </div>
  );
}
