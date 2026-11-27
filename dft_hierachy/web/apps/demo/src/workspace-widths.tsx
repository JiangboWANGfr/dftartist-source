import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ownsWorkspaceKeyboard } from "./workspace-keyboard.js";

const navigationMinimum = 150;
const inspectorMinimum = 240;
const mainMinimum = 320;
const dividerWidth = 10;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Presentation preferences belong to one mounted workspace, never to the design models. */
export function useWorkspaceWidths(showNavigation: boolean, showInspector: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [navigationPreference, setNavigation] = useState<number>();
  const [inspectorPreference, setInspector] = useState<number>();
  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => setAvailable(element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  // The existing small-window defaults apply to the workspace width, excluding app padding.
  const compact = available <= 1084;
  const budget = available - mainMinimum - dividerWidth * (+showNavigation + +showInspector);
  const navigation = clamp(
    navigationPreference ?? (compact ? 170 : 200),
    navigationMinimum,
    Math.min(420, budget - (showInspector ? inspectorMinimum : 0)),
  );
  const inspector = clamp(
    inspectorPreference ?? (compact ? 270 : 300),
    inspectorMinimum,
    Math.min(560, budget - (showNavigation ? navigation : 0)),
  );
  return {
    ref,
    style: {
      "--demo-navigation-width": `${navigation}px`,
      "--demo-inspector-width": `${inspector}px`,
    } as CSSProperties,
    navigation: {
      value: navigation,
      min: navigationMinimum,
      max: Math.max(navigationMinimum, Math.min(420, budget - (showInspector ? inspector : 0))),
      onChange: setNavigation,
      onCancel: () => setNavigation(navigationPreference),
      onReset: () => setNavigation(undefined),
    },
    inspector: {
      value: inspector,
      min: inspectorMinimum,
      max: Math.max(inspectorMinimum, Math.min(560, budget - (showNavigation ? navigation : 0))),
      onChange: setInspector,
      onCancel: () => setInspector(inspectorPreference),
      onReset: () => setInspector(undefined),
    },
  };
}

export function WorkspaceDivider({
  label,
  controls,
  side,
  hidden,
  value,
  min,
  max,
  onChange,
  onCancel,
  onReset,
}: {
  label: string;
  controls: string;
  side: "left" | "right" | "bottom" | "top";
  hidden: boolean;
  value: number;
  min: number;
  max: number;
  onChange: (size: number) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const drag = useRef<{
    id: number;
    coordinate: number;
    size: number;
    element: HTMLDivElement;
    restore: () => void;
  }>();
  function endDrag(cancelled: boolean) {
    const start = drag.current;
    if (!start) return;
    // Revoke first: releasing capture can synchronously notify lostpointercapture.
    drag.current = undefined;
    if (cancelled) start.restore();
    if (start.element.hasPointerCapture(start.id)) start.element.releasePointerCapture(start.id);
  }
  const cancelDrag = () => endDrag(true);
  useLayoutEffect(() => {
    if (hidden) cancelDrag();
    return cancelDrag;
  }, [hidden, side]);
  const horizontal = side === "bottom" || side === "top";
  const direction = side === "left" || side === "top" ? 1 : -1;
  return (
    <div
      className="demo-divider"
      role="separator"
      aria-label={label}
      aria-controls={controls}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${Math.round(value)} 像素`}
      title={`拖动或方向键调整${horizontal ? "高度" : "宽度"}；Enter/双击恢复默认；Escape取消拖动`}
      tabIndex={0}
      hidden={hidden}
      onPointerDown={(event) => {
        if (
          hidden ||
          event.defaultPrevented ||
          !event.isPrimary ||
          event.button !== 0 ||
          drag.current
        )
          return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id: event.pointerId,
          coordinate: horizontal ? event.clientY : event.clientX,
          size: value,
          element: event.currentTarget,
          // Preserve the raw preference, including the absence of an explicit preference.
          restore: onCancel,
        };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start?.id !== event.pointerId) return;
        // With chorded mouse buttons, primary release is a move until the last button is up.
        if (!(event.buttons & 1)) {
          endDrag(false);
          return;
        }
        const coordinate = horizontal ? event.clientY : event.clientX;
        onChange(clamp(start.size + (coordinate - start.coordinate) * direction, min, max));
      }}
      onPointerUp={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        endDrag(false);
      }}
      onPointerCancel={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        cancelDrag();
      }}
      onLostPointerCapture={(event) => {
        // Browser cancellation / hiding the handle must not leave a stale drag active.
        if (drag.current?.id !== event.pointerId) return;
        cancelDrag();
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (hidden || !ownsWorkspaceKeyboard(event)) return;
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          cancelDrag();
          return;
        }
        if (drag.current) return;
        const next =
          event.key === (horizontal ? "ArrowUp" : "ArrowLeft")
            ? value - 20 * direction
            : event.key === (horizontal ? "ArrowDown" : "ArrowRight")
              ? value + 20 * direction
              : event.key === "Home"
                ? min
                : event.key === "End"
                  ? max
                  : undefined;
        if (next !== undefined) {
          event.preventDefault();
          onChange(clamp(next, min, max));
        } else if (event.key === "Enter") {
          event.preventDefault();
          onReset();
        }
      }}
    />
  );
}
