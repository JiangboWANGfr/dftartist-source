// 轻量 LCS 行 diff(纯函数,无依赖)。用于生成预览的改动着色。
export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

/** 经典 LCS 动态规划,返回 unified 行序列。before 为空 → 全部 add(新文件)。 */
export function diffLines(before: string | undefined, after: string): DiffLine[] {
  const b = !before ? [] : before.split("\n"); // 空/undefined 视为新文件(全 add)
  const a = after.split("\n");
  if (b.length === 0) return a.map((text) => ({ type: "add" as const, text }));
  const n = b.length, m = a.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = b[i] === a[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (b[i] === a[j]) { out.push({ type: "ctx", text: a[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: b[i] }); i++; }
    else { out.push({ type: "add", text: a[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: b[i] }); i++; }
  while (j < m) { out.push({ type: "add", text: a[j] }); j++; }
  return out;
}

export function fileStat(before: string | undefined, after: string): { added: number; removed: number; isNew: boolean } {
  const d = diffLines(before, after);
  return {
    added: d.filter((l) => l.type === "add").length,
    removed: d.filter((l) => l.type === "del").length,
    isNew: !before,
  };
}
