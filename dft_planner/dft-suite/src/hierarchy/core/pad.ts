// Pad/BScan table pure logic (spec: docs/specs/2026-07-10-pad-bscan-tab-design.md).
// Types mirror `pad table --json` (camelCase); overlay serialization maps to the
// frozen P1 snake_case format. No React, no window.

export interface PadRow {
  path: string;
  gpio: string;
  cell: string;
  dir: "in" | "out" | "inout";
  padNet: string;
  coreInNet: string;
  coreOutNet: string;
  autoEnableNet: string;
  bscanEn: boolean;
  reuse: "" | "in" | "out";
  func: string;
  enable: string;
}
export interface SsnSummary { inWidth: number; outWidth: number; }
export interface PadTableResult { pads: PadRow[]; ssn: SsnSummary; warnings: string[]; }

/** 手工列 patch（批量条/单元格编辑共用）。undefined = 不改。 */
export interface PadPatch {
  bscanEn?: boolean;
  reuse?: "" | "in" | "out";
  func?: string;
  enable?: string;
}

/** 名称模式 → 命中的行 path 集合。三种形式（spec §4.2）：
 *  - 数字区间 "GPIO_33..64"：前缀 + from..to，gpio 以前缀开头且余部为纯数字 n 且 from<=n<=to
 *    （按数值比较，GPIO_01 与 GPIO_1 都命中 1）
 *  - glob "EMMC_*"：'*' 通配任意段（其余字符字面匹配）
 *  - 其余：大小写不敏感子串匹配
 *  空模式 → 空集合。 */
export function selectByPattern(rows: PadRow[], pattern: string): Set<string> {
  const out = new Set<string>();
  const p = pattern.trim();
  if (!p) return out;
  const range = /^(.*?)(\d+)\.\.(\d+)$/.exec(p);
  if (range) {
    const [, prefix, a, b] = range;
    const from = Number(a), to = Number(b);
    for (const r of rows) {
      if (!r.gpio.startsWith(prefix)) continue;
      const rest = r.gpio.slice(prefix.length);
      if (!/^\d+$/.test(rest)) continue;
      const n = Number(rest);
      if (n >= from && n <= to) out.add(r.path);
    }
    return out;
  }
  if (p.includes("*")) {
    const re = new RegExp("^" + p.split("*").map(escapeRe).join(".*") + "$");
    for (const r of rows) if (re.test(r.gpio)) out.add(r.path);
    return out;
  }
  const lc = p.toLowerCase();
  for (const r of rows) if (r.gpio.toLowerCase().includes(lc)) out.add(r.path);
  return out;
}
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** 批量应用：返回新 rows + 跳过数。reuse 只落在 dir==="inout" 的行（其余跳过计数）。 */
export function applyBulk(
  rows: PadRow[], selected: ReadonlySet<string>, patch: PadPatch,
): { rows: PadRow[]; skipped: number } {
  let skipped = 0;
  const next = rows.map((r) => {
    if (!selected.has(r.path)) return r;
    const p: PadPatch = { ...patch };
    if (p.reuse !== undefined && r.dir !== "inout") {
      delete p.reuse;
      skipped++;
      if (Object.keys(p).length === 0) return r;
    }
    return { ...r, ...p };
  });
  return { rows: next, skipped };
}

/** 行级校验（P1 overlay 规则前移，spec §4.4）。合法 → null。 */
export function rowIssue(r: PadRow): string | null {
  if (r.func === "ssn" && r.dir === "inout" && r.reuse === "")
    return "An inout pad with func=ssn must be assigned a reuse";
  return null;
}

/** 表格筛选（spec §3 筛选行）。 */
export interface PadFilter {
  dir: "" | "in" | "out" | "inout";
  state: "" | "no-reuse" | "bscan-y" | "unresolved";
  name: string; // 子串，大小写不敏感，匹配 gpio 或 path
}
export function filterRows(rows: PadRow[], f: PadFilter): PadRow[] {
  const lc = f.name.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.dir && r.dir !== f.dir) return false;
    if (f.state === "no-reuse" && (r.reuse !== "" || r.dir !== "inout")) return false;
    if (f.state === "bscan-y" && !r.bscanEn) return false;
    if (f.state === "unresolved" && r.gpio !== "") return false;
    if (lc && !r.gpio.toLowerCase().includes(lc) && !r.path.toLowerCase().includes(lc)) return false;
    return true;
  });
}

/** rows → P1 overlay JSON 对象（snake_case；只含非默认值的行/键，spec §5 命名映射）。
 *  默认：bscanEn=false、reuse=""、func=""、enable===autoEnableNet。 */
export function overlayFromRows(rows: PadRow[]): { pads: Record<string, Record<string, string>> } {
  const pads: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const e: Record<string, string> = {};
    if (r.bscanEn) e.bscan_en = "yes";
    if (r.reuse) e.reuse = r.reuse;
    if (r.func) e.func = r.func;
    if (r.enable !== r.autoEnableNet) e.enable = r.enable;
    if (Object.keys(e).length) pads[r.path] = e;
  }
  return { pads };
}

/** 读入 pad_cfg.json 合并到 rows（path 对齐）。返回新 rows + 未命中的 cfg path（供提示丢弃）。 */
export function mergeCfg(
  rows: PadRow[], cfg: { pads?: Record<string, Record<string, string>> } | null,
): { rows: PadRow[]; dropped: string[] } {
  if (!cfg || !cfg.pads) return { rows, dropped: [] };
  const byPath = new Map(rows.map((r) => [r.path, r]));
  const dropped: string[] = [];
  const patched = new Map<string, PadRow>();
  for (const [path, e] of Object.entries(cfg.pads)) {
    const r = byPath.get(path);
    if (!r) { dropped.push(path); continue; }
    const next = { ...r };
    if (e.bscan_en !== undefined) next.bscanEn = e.bscan_en === "yes" || e.bscan_en === "y";
    if (e.reuse === "in" || e.reuse === "out") next.reuse = e.reuse;
    if (e.func !== undefined) next.func = e.func;
    if (e.enable !== undefined) next.enable = e.enable;
    patched.set(path, next);
  }
  return { rows: rows.map((r) => patched.get(r.path) ?? r), dropped };
}

/** 实时 ssn 位宽（有效方向 = inout 取 reuse, 否则 dir; 与 C++ ssnSummary 同语义）。 */
export function ssnWidths(rows: PadRow[]): SsnSummary {
  let inWidth = 0, outWidth = 0;
  for (const r of rows) {
    if (r.func !== "ssn") continue;
    const eff = r.dir === "inout" ? r.reuse : r.dir;
    if (eff === "in") inWidth++; else if (eff === "out") outWidth++;
  }
  return { inWidth, outWidth };
}

/** 把 pad 生成的整块文本按第一处 set_boundary_scan_port_options 行切两段(spec §6)。 */
export function splitPadOutput(text: string): { auxiliary: string; bscanOptions: string } {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trimStart().startsWith("set_boundary_scan_port_options"));
  if (i < 0) return { auxiliary: text.trim(), bscanOptions: "" };
  return {
    auxiliary: lines.slice(0, i).join("\n").trim(),
    bscanOptions: lines.slice(i).join("\n").trim(),
  };
}
