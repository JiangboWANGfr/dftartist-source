// DFX 缝合自动判定(spec §1.2/D2/D8)。纯函数,零依赖。
// tie 字面量来自 hdl-core M0 补丁(SVInt binary,无前导零):"1'b0" / "4'b101"。

export type Stitch = "mux" | "replace" | "connect";

/** "4'b101" -> 每位 0/1,下标 = 位号(bit0 = LSB)。非法/空 -> null。 */
export function parseTie(tie: string, width: number): (0 | 1)[] | null {
  const m = /^(\d+)'b([01]+)$/.exec(tie);
  if (!m) return null;
  if (Number(m[1]) !== width) return null; // 声明宽度必须与端口宽度一致
  const bits = m[2].padStart(width, "0");
  if (bits.length !== width) return null;
  const out: (0 | 1)[] = [];
  for (let i = 0; i < width; i++) out.push(bits[width - 1 - i] === "1" ? 1 : 0);
  return out;
}

/** 单个位的判定:tie0 -> replace;tie1 或真实网 -> mux;悬空 -> connect(D7)。 */
export function judgeBit(c: { net: string; tie: 0 | 1 | null }): Stitch {
  if (c.net !== "") return "mux";
  if (c.tie === 0) return "replace";
  if (c.tie === 1) return "mux";
  return "connect";
}

/** 整引脚判定,按位返回(总线混合驱动自然分解,D8)。 */
export function judgePin(conn: { net: string; tie: string }, width: number): Stitch[] {
  const bits = parseTie(conn.tie, width);
  const out: Stitch[] = [];
  for (let i = 0; i < width; i++)
    out.push(judgeBit({ net: conn.net, tie: bits ? bits[i] : null }));
  return out;
}

/** daemon nodeId(top.a.b,点分隔含顶层)-> tcl 层次目标(a/b/pin,去顶层斜杠)。 */
export function tclTarget(nodeId: string, pin: string): string {
  const segs = nodeId.split(".");
  return [...segs.slice(1), pin].join("/");
}

/** nodeId 的父层 id;顶层返回 null。 */
export function parentOf(nodeId: string): string | null {
  const i = nodeId.lastIndexOf(".");
  return i < 0 ? null : nodeId.slice(0, i);
}
