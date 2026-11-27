// DFT Config(dft_cfg YAML)编辑 + library 识别。DFT Studio 把 harden 的 yaml/dft_cfg 目录
// 传给 planner(launchOptions.dftCfgDir,或在此 Browse);左侧列 YAML 文件,右侧整文件编辑,
// 保存直接写回磁盘 —— Qt 侧每次操作都是现场读这些 YAML,所以保存即生效,无需同步协议。
// 同时解析这些 YAML 识别库(dft_lib_setting.yaml → membistlib;dft_user_ins_setting.yaml →
// DFX IP verilog),保存后立即重新识别,daemon 状态跟着编辑走。
import { useCallback, useEffect, useState } from "react";
import { dftDesign as hs } from "../core-bridge/client.ts";
import { MEMBIST_DIR_KEY } from "./core/membist.ts";
import { parseDfxIpFiles, parseMembistDir, prjPathOf } from "./core/dftCfg.ts";
import { notify } from "../common/notify.ts";
import { useStore } from "./store.ts";

export function DftCfgTab() {
  const setError = useStore((s) => s.setError);
  const [dir, setDir] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [current, setCurrent] = useState("");        // selected file name
  const [text, setText] = useState("");              // editor content
  const [savedText, setSavedText] = useState("");    // last on-disk content (dirty check)
  const [libInfo, setLibInfo] = useState("");        // recognition summary line
  const [prjPath, setPrjPath] = useState("");

  const p = () => (window as unknown as {
    dft: { project: { read(p: string): Promise<string>;
                      listDir(p: string): Promise<string[]>;
                      writeFiles(d: string, f: { relPath: string; text: string }[]): Promise<string[]> };
           design: { pickFolder?(): Promise<string | null> } };
  }).dft;

  /** 解析已知 YAML,更新识别摘要;dft_lib_setting 的 membistlib 顺手预热 memory-map。 */
  const recognize = useCallback(async (d: string, prj: string) => {
    const parts: string[] = [];
    try {
      const mdir = parseMembistDir(await p().project.read(`${d}/dft_lib_setting.yaml`));
      if (mdir) {
        parts.push(`membistlib: ${mdir}`);
        localStorage.setItem(MEMBIST_DIR_KEY, mdir);
        try { await hs.memoryMap(mdir); } catch { /* Memory 页会报细节 */ }
      }
    } catch { /* 该文件不存在 */ }
    try {
      const fs = parseDfxIpFiles(await p().project.read(`${d}/dft_user_ins_setting.yaml`), prj);
      if (fs.length) parts.push(`dfx_ip: ${fs.length} file(s)`);
    } catch { /* 该文件不存在 */ }
    setLibInfo(parts.length ? `识别到 ${parts.join(" · ")}` : "未识别到库路径");
  }, []);

  const loadDir = useCallback(async (d: string) => {
    try {
      const names = (await p().project.listDir(d))
        .filter((n) => /\.ya?ml$/.test(n)).sort();
      setDir(d);
      setFiles(names);
      const first = names.includes("dft_user_ins_setting.yaml")
        ? "dft_user_ins_setting.yaml" : names[0] ?? "";
      if (first) {
        const t = await p().project.read(`${d}/${first}`);
        setCurrent(first); setText(t); setSavedText(t);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setError]);

  // 启动参数里的 dft_cfg 目录:有则直接加载并做一次识别。
  useEffect(() => {
    void (async () => {
      try {
        const lo = await (window as unknown as {
          dft?: { app?: { launchOptions?(): Promise<{ dftCfgDir: string | null; projectDir: string | null }> } };
        }).dft?.app?.launchOptions?.();
        const prj = lo?.projectDir ? prjPathOf(lo.projectDir) : "";
        setPrjPath(prj);
        if (lo?.dftCfgDir) { await loadDir(lo.dftCfgDir); await recognize(lo.dftCfgDir, prj); }
      } catch { /* standalone 运行:用 Browse */ }
    })();
  }, [loadDir, recognize]);

  const open = async (name: string) => {
    if (text !== savedText && !window.confirm(`${current} 有未保存的修改,放弃?`)) return;
    try {
      const t = await p().project.read(`${dir}/${name}`);
      setCurrent(name); setText(t); setSavedText(t);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const save = async () => {
    try {
      await p().project.writeFiles(dir, [{ relPath: current, text }]);
      setSavedText(text);
      notify(`saved ${current}`);
      // 库设置被编辑过 → 立即重新识别,daemon(memory-map / read_dfx_ip)跟上新内容。
      if (current === "dft_lib_setting.yaml") await recognize(dir, prjPath);
      if (current === "dft_user_ins_setting.yaml" && prjPath) {
        const fs = parseDfxIpFiles(text, prjPath);
        for (const f of fs) {
          try { await hs.dpShell(`read_dfx_ip {${f}}`); } catch { /* 单个文件失败不阻塞 */ }
        }
        await recognize(dir, prjPath);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const dirty = text !== savedText;
  return (
    <div className="drctab" id="dftcfgtab">
      <div className="crhead">
        <span style={{ fontWeight: 600 }}>DFT Config (dft_cfg)</span>
        <input className="findinput" style={{ flex: 1, minWidth: 260 }} spellCheck={false}
               placeholder="harden 的 yaml/dft_cfg 目录(由 --projectpath/--harden 推导,或 Browse)"
               value={dir} onChange={(e) => setDir(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void loadDir(dir).then(() => recognize(dir, prjPath)); }} />
        <button className="findbtn" onClick={() => void (async () => {
          const d = await p().design.pickFolder?.();
          if (d) { await loadDir(d); await recognize(d, prjPath); }
        })()}>Browse…</button>
        <span className="crstat">{libInfo}</span>
      </div>
      {!dir && <div className="muted pad">
        打开工程后自动定位 &lt;projectpath&gt;/dft_studio_db/&lt;harden&gt;/yaml/dft_cfg;
        也可 Browse 手选目录。编辑保存直接写回磁盘,DFT Studio 与 flow 读同一份文件。
      </div>}
      {dir && (
        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          <div style={{ width: 240, overflow: "auto", borderRight: "1px solid #333", padding: "6px 0" }}>
            {files.map((n) => (
              <div key={n} className="drcrow"
                   style={{ cursor: "pointer", fontWeight: n === current ? 600 : 400 }}
                   onClick={() => void open(n)}>
                <span className="c-inst" style={{ flex: 1 }}>{n}{n === current && dirty ? " *" : ""}</span>
              </div>
            ))}
            {files.length === 0 && <div className="muted pad">目录里没有 YAML 文件</div>}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, padding: "4px 8px", alignItems: "center" }}>
              <span className="muted" style={{ flex: 1 }}>{current && `${dir}/${current}`}</span>
              <button className="findbtn" disabled={!dirty} onClick={() => setText(savedText)}>Revert</button>
              <button className="findbtn" data-btn="save-cfg" disabled={!dirty || !current}
                      onClick={() => void save()}>{dirty ? "Save" : "Saved"}</button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
                      style={{ flex: 1, resize: "none", background: "#141414", color: "#d4d4d4",
                               border: "1px solid #333", margin: "0 8px 8px", padding: 8,
                               font: "12px/1.5 'JetBrains Mono', Consolas, monospace",
                               whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto" }} />
          </div>
        </div>
      )}
    </div>
  );
}
