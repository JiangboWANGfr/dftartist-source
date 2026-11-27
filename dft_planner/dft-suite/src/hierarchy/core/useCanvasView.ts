// Shared Ctrl+wheel zoom + drag-to-pan for the SVG structure views (clock diagram, topology).
// The Konva schematic surface has its own stage-level equivalent; this gives the SVG views the
// SAME feel: Ctrl+wheel zooms about the pointer, plain wheel scrolls, dragging the background
// pans. Extracted so the two views can never drift apart.

import { useCallback, useRef, useState,
         type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";

export interface CanvasView {
  zoom: number;
  /** Spread onto the scrolling container: <div {...view.bind}>. `ref` is a CALLBACK ref —
   *  React's DOM ref prop rejects RefObject<T | null>, which a plain useRef would produce. */
  bind: {
    ref: (el: HTMLDivElement | null) => void;
    onMouseDown: (e: ReactMouseEvent) => void;
    onWheel: (e: ReactWheelEvent) => void;
    style: { cursor: string };
  };
  reset: () => void;
}

const MIN = 0.1, MAX = 5, STEP = 1.12;

// Zoom + scroll offset per view id, at module level so switching views/tabs (which unmounts
// these components) does not throw the user's zoom away.
const savedBySeed = new Map<string, { zoom: number; sl: number; st: number }>();

/** @param id stable id for this view; omit for a throwaway canvas with no memory. */
export function useCanvasView(id = ""): CanvasView {
  const [zoom, setZoom] = useState(() => (id && savedBySeed.get(id)?.zoom) || 1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const remember = useCallback(() => {
    const el = scrollRef.current;
    if (id && el) savedBySeed.set(id, { zoom, sl: el.scrollLeft, st: el.scrollTop });
  }, [id, zoom]);
  // Restore the scroll offset once the container exists (the zoom is already restored above).
  const setRef = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    const v = id ? savedBySeed.get(id) : undefined;
    if (el && v) requestAnimationFrame(() => { el.scrollLeft = v.sl; el.scrollTop = v.st; });
  }, [id]);

  // Drag the background to pan (scrolls the container). Ignored when the press started on an
  // interactive element, so right-click menus and controls keep working.
  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = "grabbing";
    const move = (ev: globalThis.MouseEvent) => {
      const p = panRef.current, s = scrollRef.current;
      if (!p || !s) return;
      s.scrollLeft = p.sl - (ev.clientX - p.x);
      s.scrollTop = p.st - (ev.clientY - p.y);
    };
    const up = () => {
      panRef.current = null;
      if (scrollRef.current) scrollRef.current.style.cursor = "grab";
      remember();
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Ctrl+wheel zooms ABOUT THE POINTER (keeping the point under the cursor fixed is what makes
  // zooming into a deep part of a big tree usable); plain wheel keeps scrolling the container.
  const onWheel = (e: ReactWheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const el = scrollRef.current;
    setZoom((z) => {
      const next = Math.max(MIN, Math.min(MAX, z * (e.deltaY < 0 ? STEP : 1 / STEP)));
      if (el && next !== z) {
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left + el.scrollLeft;    // pointer in content coords (old zoom)
        const py = e.clientY - r.top + el.scrollTop;
        const k = next / z;
        // after the content rescales by k, keep the same content point under the cursor
        requestAnimationFrame(() => {
          const s = scrollRef.current;
          if (!s) return;
          s.scrollLeft = px * k - (e.clientX - r.left);
          s.scrollTop = py * k - (e.clientY - r.top);
          if (id) savedBySeed.set(id, { zoom: next, sl: s.scrollLeft, st: s.scrollTop });
        });
      }
      return next;
    });
  };

  return {
    zoom,
    bind: { ref: setRef, onMouseDown, onWheel, style: { cursor: "grab" } },
    reset: () => setZoom(1),
  };
}
