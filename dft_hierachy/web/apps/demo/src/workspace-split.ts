import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** CSS owns the responsive axis; each arrangement keeps its own local size preference. */
export function useWorkspaceSplit() {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ axis: "y", min: 260, max: 260, span: 480 });
  const [preferences, setPreferences] = useState<Readonly<Record<string, number>>>({});
  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => {
      const css = getComputedStyle(element);
      const axis = css.getPropertyValue("--demo-split-axis").trim();
      const available = axis === "x" ? element.clientWidth : element.clientHeight;
      if (available === 0) return;
      const min = parseFloat(css.getPropertyValue("--demo-split-graph-min"));
      const sourceMin = parseFloat(css.getPropertyValue("--demo-split-source-min"));
      const gap = parseFloat(css.getPropertyValue("--demo-split-gap"));
      const span = Math.max(min + sourceMin, available - gap);
      const max = span - sourceMin;
      setBounds((previous) =>
        previous.axis === axis && previous.min === min && previous.max === max
          ? previous
          : { axis, min, max, span },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const value = Math.max(
    bounds.min,
    Math.min(bounds.max, preferences[bounds.axis] ?? bounds.span / 2),
  );
  return {
    ref,
    axis: bounds.axis,
    style: { "--demo-split-first": `${value}px` } as CSSProperties,
    divider: {
      side: bounds.axis === "x" ? ("left" as const) : ("top" as const),
      value,
      min: bounds.min,
      max: bounds.max,
      onChange: (size: number) =>
        setPreferences((previous) => ({ ...previous, [bounds.axis]: size })),
      onCancel: () =>
        setPreferences((previous) => {
          const next = { ...previous };
          const original = preferences[bounds.axis];
          if (original === undefined) delete next[bounds.axis];
          else next[bounds.axis] = original;
          return next;
        }),
      onReset: () =>
        setPreferences((previous) => {
          const next = { ...previous };
          delete next[bounds.axis];
          return next;
        }),
    },
  };
}
