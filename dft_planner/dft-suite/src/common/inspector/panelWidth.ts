// Inspector 面板宽度纯逻辑(clamp + localStorage 记忆),仿 hierarchy/treeWidth.ts。
// key 由调用方传入(不同面板各记一份)。
export const PANEL_W_MIN = 220;
export const PANEL_W_MAX = 560;
export const PANEL_W_DEFAULT = 300;

export function clampPanelWidth(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return PANEL_W_DEFAULT;
  return Math.max(PANEL_W_MIN, Math.min(PANEL_W_MAX, Math.round(px)));
}
export function loadPanelWidth(key: string): number {
  try { return clampPanelWidth(Number(localStorage.getItem(key))); } catch { return PANEL_W_DEFAULT; }
}
export function savePanelWidth(key: string, px: number): void {
  try { localStorage.setItem(key, String(clampPanelWidth(px))); } catch { /* ignore */ }
}
