// F2 — 顶部工具栏：新建 / 打开 / 保存 / 另存为 + 生成 + 未保存指示。

import { useState } from "react";
import { useStore } from "./store.ts";
import { saveGenconnDoc } from "./save.ts";
import { fsOpen, resetHandle, lsSave } from "./persist.ts";
import { promptText } from "./promptDialog.tsx";
import { LayerMenu } from "./LayerMenu.tsx";
import { notify, appConfirm } from "../common/notify.ts";

export function Toolbar() {
  const doc = useStore((s) => s.doc);
  const dirty = useStore((s) => s.dirty);
  const newDoc = useStore((s) => s.newDoc);
  const openText = useStore((s) => s.openText);
  const toText = useStore((s) => s.toText);
  const setGenOpen = useStore((s) => s.setGenOpen);
  const polyDraw = useStore((s) => s.polyDraw);
  const setPolyDraw = useStore((s) => s.setPolyDraw);
  const hideWires = useStore((s) => s.hideWires);
  const toggleHideWires = useStore((s) => s.toggleHideWires);
  const [fileOpen, setFileOpen] = useState(false);
  const navStack = useStore((s) => s.navStack);
  const gotoCrumb = useStore((s) => s.gotoCrumb);

  const nameOf = (id: string) => doc.library.defs.find((d) => d.id === id)?.designName ?? id;

  const confirmDiscard = async () => !dirty || (await appConfirm("Discard unsaved changes?"));

  const onNew = async () => {
    if (!(await confirmDiscard())) return;
    const name = await promptText("Top-level module name for the new document:", "chip");
    if (!name) return;
    resetHandle();
    newDoc(name);
    lsSave(toText());
  };

  const onOpen = async () => {
    if (!(await confirmDiscard())) return;
    const text = await fsOpen();
    if (text == null) return;
    try {
      openText(text);
      lsSave(toText());
    } catch (e: any) {
      notify(`Open failed: ${e?.message ?? e}`);
    }
  };

  const doSave = (saveAs: boolean) => saveGenconnDoc(saveAs);

  const onGenerate = () => setGenOpen(true);
  const undo = () => useStore.temporal.getState().undo();
  const redo = () => useStore.temporal.getState().redo();

  return (
    <header className="toolbar">
      <strong>DFT Stream Planner</strong>
      <span className="tb-menu-wrap">
        <button className={fileOpen ? "active" : ""} onClick={() => setFileOpen((v) => !v)} title="File operations">File ▾</button>
        {fileOpen && (
          <div className="tb-menu" onMouseLeave={() => setFileOpen(false)}>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void onNew(); }}>New</div>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void onOpen(); }}>Open…</div>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void doSave(false); }}>Save</div>
            <div className="tb-menu-item" onClick={() => { setFileOpen(false); void doSave(true); }}>Save As…</div>
          </div>
        )}
      </span>
      <button data-btn="save" onClick={() => void doSave(false)}
              title="Save the document (Ctrl+S also works from the File menu)">
        Save{dirty ? " ●" : ""}
      </button>
      <span className="tb-sep" />
      <button onClick={undo} title="Undo (Ctrl/Cmd+Z)">↶</button>
      <button onClick={redo} title="Redo (Ctrl/Cmd+Shift+Z)">↷</button>
      <span className="tb-sep" />
      <button className={polyDraw ? "active" : ""} onClick={() => setPolyDraw(!polyDraw)} title="Draw orthogonal polygon harden (click corners, close by returning to start, Esc to cancel)">▱ Draw Polygon</button>
      <button className={hideWires ? "active" : ""} onClick={toggleHideWires} title="Hide/show drawn connection polylines (view only, does not affect pairing or generation)">{hideWires ? "Show Wires" : "Hide Wires"}</button>
      <LayerMenu />
      <nav className="crumb">
        {navStack.map((entry, i) => (
          <span key={`${entry.defId}-${i}`}>
            {i > 0 && <span className="sep"> ▸ </span>}
            <a onClick={() => gotoCrumb(i)} title="Jump to this layer">
              {nameOf(entry.defId)}
              {entry.defId === doc.ui.rootDefId ? " ⌂" : ""}
            </a>
          </span>
        ))}
      </nav>
      <span className="spacer" />
      {dirty && <span className="dirty" title="Unsaved">●</span>}
      <button onClick={onGenerate}>⚙ Generate</button>
    </header>
  );
}
