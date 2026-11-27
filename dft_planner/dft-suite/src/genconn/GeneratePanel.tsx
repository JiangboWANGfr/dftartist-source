// F4 — 生成面板（底部，可收起）：调 dft-core genconn CLI 生成，列出产文件、预览、下载。
// 产文件来自 C++ genconn binary（源头），UNCONNECTED 计算来自 TS validate.ts（渲染层）。

import { useEffect, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { validateDocument } from "./core/validate.ts";
import { serialize } from "./core/document.ts";
import { dftGenconn } from "../core-bridge/genconn.ts";
import { downloadText, pickTextFile } from "./persist.ts";
import { injectDft, defNeedsDft } from "./core/vinject.ts";
import type { GenConnDocument } from "./core/model.ts";
import { expandDef } from "./core/order.ts";
import { GenPreview } from "../common/genpreview/GenPreview.tsx";
import { useProject, writeToProject } from "../store/project.ts";
import { archConnectionFiles, connLeafName, withDftPortFile } from "../store/outputLayout.ts";
import { notify } from "../common/notify.ts";

const basename = (p: string): string => p.split("/").pop() ?? p;

/** 从文档模型里找出 tiling 层中缺配对驱动的 client 输入端口。
 *  逻辑镜像 generate.ts 里的 driver map 构建，但只扫 unconnected，不产文件。 */
function computeUnconnected(doc: GenConnDocument): { def: string; instance: string; ports: string[] }[] {
  const lib = doc.library;
  const byId = new Map(lib.defs.map((d) => [d.id, d]));
  const out: { def: string; instance: string; ports: string[] }[] = [];

  for (const root of lib.defs) {
    const insts = new Map(root.childInstances.map((i) => [i.id, i]));
    const isTiling = (hardenId: string) => byId.get(hardenId)?.designType === "tiling";

    // Build driver map: instId → portName → hasSrc
    const driven = new Map<string, Set<string>>();
    for (const conn of root.connections) {
      const A = insts.get(conn.secondaryInstanceId);
      const B = insts.get(conn.clientInstanceId);
      if (!A || !B || !isTiling(A.hardenId) || !isTiling(B.hardenId)) continue;
      const defB = byId.get(B.hardenId);
      if (!defB) continue;
      const ifaceC = defB.interfaces.find((i) => i.id === conn.clientInterfaceId);
      if (!ifaceC) continue;
      let s = driven.get(B.id);
      if (!s) { s = new Set(); driven.set(B.id, s); }
      // We just need to know which instance has at least one incoming connection.
      // Mark the client interface as having a driver (simplified: mark all ports).
      s.add(conn.clientInterfaceId);
    }

    // Check each tiling instance for any input ports with no driver
    for (const inst of root.childInstances) {
      if (!isTiling(inst.hardenId)) continue;
      const def = byId.get(inst.hardenId);
      if (!def) continue;
      const { inputPorts } = expandDef(def, undefined);
      if (inputPorts.length === 0) continue;

      // Find client interfaces that lack connections (no entry in driven map means all unconnected)
      const connectedIfaces = driven.get(inst.id) ?? new Set<string>();
      const missingIfaces = def.interfaces.filter(
        (iface) => iface.role === "client" && !connectedIfaces.has(iface.id),
      );
      if (missingIfaces.length === 0) continue;

      // Collect port names from missing interfaces
      const { inputPorts: allInputs } = expandDef(def, undefined);
      // A port is "unconnected" if it belongs to a client interface that has no driver
      // We can't easily map ports back to interfaces here, so just mark all inputs as unconnected
      // when there's at least one unconnected client interface.
      // Better: check if there's NO connection at all for this instance.
      if (connectedIfaces.size === 0 && allInputs.length > 0) {
        out.push({ def: root.designName, instance: inst.instanceName, ports: allInputs.map((p) => p.name) });
      }
    }
  }
  return out;
}

type FileEntry = { name: string; text: string };

export function GeneratePanel() {
  const doc = useStore((s) => s.doc);
  const open = useStore((s) => s.genOpen);
  const setOpen = useStore((s) => s.setGenOpen);
  const rtlFiles = useStore((s) => s.rtlFiles);
  const projOpen = useProject((s) => !!s.path);

  const [showWarn, setShowWarn] = useState(false);

  // Async generation state
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Validation (sync, for structural error before even calling CLI)
  let validError: string | null = null;
  try {
    validateDocument(doc);
  } catch (e: any) {
    validError = String(e?.message ?? e);
  }

  // Unconnected ports: computed from TS model (CLI doesn't report them)
  const warns = !validError ? computeUnconnected(doc) : [];
  const warnCount = warns.reduce((n, w) => n + w.ports.length, 0);

  // Track doc identity to cancel stale async calls
  const docRef = useRef(doc);
  docRef.current = doc;

  // Run generate when panel opens or doc changes (and no structural error)
  useEffect(() => {
    if (!open || validError) {
      setFiles([]);
      setGenError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setGenError(null);

    const docJson = serialize(doc);
    dftGenconn.generateAll(docJson).then((result) => {
      if (cancelled) return;
      setFiles(result.files);
      setLoading(false);
    }).catch((e: any) => {
      if (cancelled) return;
      setGenError(String(e?.message ?? e));
      setFiles([]);
      setLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc, validError]);

  // 导出带 DFT 的 .v（TS vinject，同步）
  const exportDftV = () => {
    const defs = doc.library.defs.filter((d) => defNeedsDft(d, doc.library));
    if (defs.length === 0) { notify("No DFT connections or promoted interfaces to inject"); return; }
    const missing: string[] = [];
    const failed: string[] = [];
    for (const d of defs) {
      const fn = d.fileName;
      let text: string | undefined = fn ? (rtlFiles[fn] ?? rtlFiles[basename(fn)]) : undefined;
      if (text == null) text = rtlFiles[`${d.designName}.v`];
      if (text == null) { missing.push(d.designName); continue; }
      try {
        downloadText(`${d.designName}_with_dft.v`, injectDft(text, doc.library, d.id));
      } catch (e: any) {
        failed.push(`${d.designName}: ${e?.message ?? e}`);
      }
    }
    if (missing.length) notify(`The original .v for these layers is not in memory. Upload the matching RTL under "Design Hierarchy" on the left before exporting: ${missing.join(", ")}`);
    if (failed.length) notify(`Injection failed:\n${failed.join("\n")}`);
  };

  // 写入工程:连接文件 → Arch/<层>.connection.tcl;架构快照经 saveGenconn 写到工程记录的
  // genconnDoc(= Arch/<design>.arch)——与工程重开时载入的文件同路径,不产生孤儿副本(spec §4)。
  const writeConn = () => {
    void useProject.getState().saveGenconn(serialize(doc));
    void writeToProject(archConnectionFiles(files));
  };

  // 注入写入工程:每个需 DFT 的层注入 → design_info/<design>.with_dft_port.v
  const writeInject = () => {
    const defs = doc.library.defs.filter((d) => defNeedsDft(d, doc.library));
    if (defs.length === 0) { notify("No DFT connections or promoted interfaces to inject"); return; }
    const out: { relPath: string; text: string }[] = [];
    const missing: string[] = [];
    for (const d of defs) {
      const fn = d.fileName;
      let text: string | undefined = fn ? (rtlFiles[fn] ?? rtlFiles[basename(fn)]) : undefined;
      if (text == null) text = rtlFiles[`${d.designName}.v`];
      if (text == null) { missing.push(d.designName); continue; }
      out.push(withDftPortFile(d.designName, injectDft(text, doc.library, d.id)));
    }
    if (missing.length) { notify(`The original .v for these layers is not in memory. Upload the matching RTL under "Design Hierarchy" on the left: ${missing.join(", ")}`); return; }
    void writeToProject(out);
  };

  // Inject via CLI: pick .v files, call genconn inject, download results
  const injectViaCli = async () => {
    const text = await pickTextFile(".v,text/plain");
    if (!text) return;
    const docJson = serialize(doc);
    // We don't have the path, use a placeholder name
    const vFiles = [{ path: "netlist.v", text }];
    try {
      const results = await dftGenconn.inject(docJson, vFiles);
      for (const r of results) {
        downloadText(basename(r.path).replace(/\.v$/, "_injected.v"), r.text);
      }
    } catch (e: any) {
      notify(`Injection failed: ${e?.message ?? e}`);
    }
  };

  if (!open) return null;

  const error = validError ?? genError;

  return (
    <section className="genpanel" id="gc-genpanel">
      <header className="genpanel-head">
        <strong>Generated Results</strong>
        {error ? (
          <span className="err">{validError ? "Validation failed: " : "Generation failed: "}{error}</span>
        ) : loading ? (
          <span className="muted">Generating…</span>
        ) : (
          <span className="muted">{files.length} files (one per layer with tiling sub-blocks)</span>
        )}
        <span className="spacer" />
        {files.length > 1 && (
          <button onClick={() => files.forEach((f) => downloadText(connLeafName(f.name), f.text))}>Download All</button>
        )}
        {projOpen && files.length > 0 && (
          <button onClick={writeConn} title="Write connection files + architecture snapshot into the project's Arch/">Write to Project</button>
        )}
        <button
          data-action="generate-inject"
          onClick={injectViaCli}
          title="Pick a .v file, inject the current DFT connections, and download the result"
        >
          Export DFT-Injected .v
        </button>
        <button onClick={() => exportDftV()} title="Inject the currently paired DFT connections into the original netlist and export a .v with DFT ports">Export .v with DFT</button>
        {projOpen && <button onClick={writeInject} title="Inject and write into the project's design_info/">Inject &amp; Write to Project</button>}
        <button onClick={() => setOpen(false)}>Collapse</button>
      </header>

      {!error && warnCount > 0 && (
        <div className="genpanel-warn">
          <button className="warn-toggle" onClick={() => setShowWarn((v) => !v)}>
            ⚠ {warnCount} client interfaces unpaired (will generate as UNCONNECTED){showWarn ? " ▾" : " ▸"}
          </button>
          {showWarn && (
            <ul className="warn-list">
              {warns.map((w, i) => (
                <li key={i}>
                  <code>{w.def}</code> · {w.instance} → {w.ports.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!error && !loading && files.length > 0 && (
        <div className="genpanel-body" id="gc-genoutput">
          <GenPreview
            files={files.map((f) => ({ name: connLeafName(f.name), text: f.text }))}
            onCopy={(f) => void navigator.clipboard?.writeText(f.text)}
            onDownload={(f) => downloadText(f.name, f.text)}
          />
        </div>
      )}
      {!error && !loading && files.length === 0 && (
        <div className="genpanel-body empty">No files generated (no layer with tiling sub-blocks currently).</div>
      )}
    </section>
  );
}
