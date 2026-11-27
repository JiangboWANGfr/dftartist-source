// SpecGen 画布缩放/平移：Konva Stage 的 scale+position 单一真源 + world↔screen 换算。
// 手势：ctrl/cmd+wheel(触摸板捏合) = 以光标为中心缩放；裸 wheel(双指滚动) = 平移；拖空白处 = 平移(Stage draggable)。
import { useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";

export interface ZoomView { scale: number; x: number; y: number; }
const MIN = 0.25, MAX = 4;
const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));

export function useZoomPan() {
  const [view, setView] = useState<ZoomView>({ scale: 1, x: 0, y: 0 });

  const toWorld = (p: { x: number; y: number }) => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });

  /** 以屏幕点 sp 为不动点缩放 factor 倍。 */
  const zoomAt = (sp: { x: number; y: number }, factor: number) =>
    setView((v) => {
      const s = clamp(v.scale * factor);
      const w = { x: (sp.x - v.x) / v.scale, y: (sp.y - v.y) / v.scale };
      return { scale: s, x: sp.x - w.x * s, y: sp.y - w.y * s };
    });

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const k = e.evt.deltaMode ? 16 : 1; // 行模式(物理滚轮)按 16px/行归一
    const dx = e.evt.deltaX * k, dy = e.evt.deltaY * k;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const sp = e.target.getStage()?.getPointerPosition();
      if (sp) zoomAt(sp, Math.exp(-dy * 0.01));
    } else {
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    }
  };

  /** 工作区 rect 适应视口 vp（留 80px 边距）并居中。 */
  const fit = (rect: { w: number; h: number }, vp: { w: number; h: number }) =>
    setView(() => {
      const s = clamp(Math.min(vp.w / (rect.w + 80), vp.h / (rect.h + 80)));
      return { scale: s, x: (vp.w - rect.w * s) / 2, y: (vp.h - rect.h * s) / 2 };
    });

  return { view, setView, toWorld, zoomAt, onWheel, fit };
}
