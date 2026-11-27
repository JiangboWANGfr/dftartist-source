// 总线图层下拉：全部 + 4 层（逐层选活动层 + 👁 显隐）。genconn Toolbar 与 SpecGen 共用同一个，保证行为一致。
// 打开后点组件外（含 Konva 画布）或按 Esc → 关闭。
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store.ts";
import { BUS_LAYERS } from "./layers.ts";
import { BUS_COLOR } from "./layout.ts";

export function LayerMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const activeLayer = useStore((s) => s.activeLayer);
  const hiddenLayers = useStore((s) => s.hiddenLayers);
  const setActiveLayer = useStore((s) => s.setActiveLayer);
  const toggleLayerHidden = useStore((s) => s.toggleLayerHidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button className={activeLayer || hiddenLayers.size ? "active" : ""} onClick={() => setOpen((v) => !v)} title="Bus layers: pick an active layer to focus (others dim and lock) + per-layer show/hide">Layers ▾</button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "#fff", border: "1px solid #d0d5dd", borderRadius: 6, padding: 4, minWidth: 170, boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}>
          <div onClick={() => setActiveLayer(null)} style={{ padding: "4px 8px", cursor: "pointer", fontWeight: activeLayer === null ? 700 : 400 }}>{activeLayer === null ? "● " : "○ "}All</div>
          {BUS_LAYERS.map((bt) => {
            const hidden = hiddenLayers.has(bt);
            return (
              <div key={bt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
                <span onClick={() => setActiveLayer(bt)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1, fontWeight: activeLayer === bt ? 700 : 400, textDecoration: hidden ? "line-through" : "none", color: hidden ? "#98a2b3" : "#111" }}>
                  {activeLayer === bt ? "● " : "○ "}<span style={{ width: 10, height: 10, background: BUS_COLOR[bt], borderRadius: 2, display: "inline-block" }} />{bt}
                </span>
                <span onClick={() => toggleLayerHidden(bt)} style={{ cursor: "pointer" }} title={hidden ? "Show this layer" : "Hide this layer"}>{hidden ? "🚫" : "👁"}</span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
