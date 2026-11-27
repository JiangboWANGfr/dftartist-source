// 统一生成/修改预览(spec §7):文件列表(新/改 + ±统计)+ 内容视图(diff 着色)+ 复制/下载。
// 展示型 + IO 无关:复制/下载经回调,调用方传实现。当前 genconn 生成为新文件 → 全绿「新」。
import { useState } from "react";
import { diffLines, fileStat } from "./linediff.ts";

export type GenFile = { name: string; text: string; before?: string };

function baseName(p: string): string { return p.split("/").pop() ?? p; }

export function GenPreview({ files, onCopy, onDownload }: {
  files: GenFile[];
  onCopy?: (f: GenFile) => void;
  onDownload?: (f: GenFile) => void;
}) {
  const [sel, setSel] = useState(0);
  if (files.length === 0) return <div className="genpreview-empty">No files produced.</div>;
  const idx = Math.min(sel, files.length - 1);
  const cur = files[idx];
  const lines = diffLines(cur.before, cur.text);

  return (
    <div className="genpreview">
      <ul className="gp-files">
        {files.map((f, i) => {
          const st = fileStat(f.before, f.text);
          return (
            <li key={f.name} className={"gp-file" + (i === idx ? " on" : "")}
                onClick={() => setSel(i)} title={f.name}>
              <span className="gp-file-name">{baseName(f.name)}</span>
              <span className={"gp-tag " + (st.isNew ? "gp-tag-new" : "gp-tag-mod")}>{st.isNew ? "New" : "Mod"}</span>
              <span className="gp-stat">
                {st.added > 0 && <span className="gp-stat-add">+{st.added}</span>}
                {st.removed > 0 && <span className="gp-stat-del">−{st.removed}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="gp-main">
        <div className="gp-actionbar">
          <span className="gp-cur-name" title={cur.name}>{baseName(cur.name)}</span>
          <span className="gp-spacer" />
          {onCopy && <button className="gp-btn" onClick={() => onCopy(cur)}>Copy</button>}
          {onDownload && <button className="gp-btn" onClick={() => onDownload(cur)}>Download</button>}
        </div>
        <pre className="gp-code">
          {lines.map((l, i) => (
            <div key={i} className={"gp-line gp-" + l.type}>
              <span className="gp-gutter">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
              <span className="gp-text">{l.text || " "}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
