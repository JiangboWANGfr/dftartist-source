// Canvas chrome colors for the Konva stage. Konva shapes can't read CSS vars, so we
// read the shell theme.css vars off :root once and re-read whenever the theme toggles
// (CanvasView subscribes to useDesign(s=>s.theme) and recomputes via canvasColors()).
// HARDEN fills come from the doc (def.color / hexTint) and are NOT themed here — only chrome.

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface CanvasColors {
  grid: string;        // 网格点/线
  frame: string;       // 下钻外轮廓虚线框
  boxFill: string;     // 盒子默认填充（无自定义色时）
  boxStroke: string;   // 盒子默认描边
  accent: string;      // 选中描边 / 草稿线 / 框选
  textStrong: string;  // 实例名
  textDim: string;     // 子标题 / 接口标签
  textFaint: string;   // 子块名 / 兄弟上下文标签
  siblingFill: string; // 兄弟上下文淡显填充
  siblingStroke: string;
  tooltipBg: string;   // 悬停/选中接口浮签底
  tooltipText: string;
  pair: string;        // 已配对绿点
  warn: string;        // 未连 client 红
  ported: string;      // 已提升橙
}

/** 读取一次当前主题的画布 chrome 颜色。主题切换后需重新调用（见 CanvasView）。 */
export function canvasColors(): CanvasColors {
  return {
    grid: cssVar("--svg-dot", "#e4e7ec"),
    frame: cssVar("--svg-frame-stroke", "#98a2b3"),
    boxFill: cssVar("--svg-box", "#ffffff"),
    boxStroke: cssVar("--svg-box-stroke", "#155e63"),
    accent: cssVar("--accent", "#2e90fa"),
    textStrong: cssVar("--text-strong", "#101828"),
    textDim: cssVar("--text-dim", "#475467"),
    textFaint: cssVar("--text-faint", "#98a2b3"),
    siblingFill: cssVar("--svg-box", "#f2f4f7"),
    siblingStroke: cssVar("--svg-box-stroke", "#cbd2dc"),
    tooltipBg: cssVar("--menu-bg", "#1d2939"),
    tooltipText: cssVar("--text-strong", "#ffffff"),
    pair: cssVar("--green", "#12b76a"),
    warn: cssVar("--red", "#d92d20"),
    ported: cssVar("--orange", "#dc6803"),
  };
}
