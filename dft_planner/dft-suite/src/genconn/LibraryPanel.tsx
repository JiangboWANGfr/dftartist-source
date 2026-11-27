// F5 — 左·模块库面板：空白 harden + 已入库模块（点选加实例到当前层）。

import { useStore } from "./store.ts";
import { usageCount } from "./core/edit.ts";

export function LibraryPanel() {
  const doc = useStore((s) => s.doc);
  const addBlankHarden = useStore((s) => s.addBlankHarden);
  const addInstanceFromDef = useStore((s) => s.addInstanceFromDef);

  const libDefs = doc.library.defs.filter((d) => d.inLibrary);

  return (
    <aside className="panel left lib">
      <div className="lib-head">Module Library</div>
      <button className="lib-blank" onClick={addBlankHarden}>＋ Blank harden</button>

      <ul className="lib-list">
        {libDefs.map((d) => {
          const disabled = d.id === doc.ui.openDefId;
          return (
            <li
              key={d.id}
              className={disabled ? "disabled" : ""}
              title={disabled ? "Cannot add the current layer to itself" : `Add an instance of ${d.designName}`}
              onClick={() => !disabled && addInstanceFromDef(d.id)}
            >
              <span className="lib-name">{d.designName}</span>
              <small className="lib-meta">
                {d.designType} · in use {usageCount(doc, d.id)}
              </small>
            </li>
          );
        })}
        {libDefs.length === 0 && <li className="muted">(Library is empty: drag in a blank harden, configure it, then save to library)</li>}
      </ul>
    </aside>
  );
}
