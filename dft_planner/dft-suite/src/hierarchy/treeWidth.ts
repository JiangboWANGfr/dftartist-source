// 层次树左栏宽度的纯逻辑（clamp + localStorage 记忆）。复用 genconn 的拖拽记忆思路，
// 但抽成纯函数以便单测。折叠态不走这里（组件本地 boolean state）。
export const TREE_W_MIN = 200;
export const TREE_W_MAX = 640;
export const TREE_W_DEFAULT = 320;
const LS_KEY = "hierarchy:leftW";

export function clampTreeWidth(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return TREE_W_DEFAULT;
  return Math.max(TREE_W_MIN, Math.min(TREE_W_MAX, Math.round(px)));
}

export function loadTreeWidth(): number {
  try { return clampTreeWidth(Number(localStorage.getItem(LS_KEY))); }
  catch { return TREE_W_DEFAULT; }
}

export function saveTreeWidth(px: number): void {
  try { localStorage.setItem(LS_KEY, String(clampTreeWidth(px))); } catch { /* ignore */ }
}
