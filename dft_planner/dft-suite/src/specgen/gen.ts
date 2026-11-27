// 纯生成器：config（嵌套 overrides）+ 组件 schema → Tessent .spec 片段。移植 specgen genBlock。
import type { BlockSchema } from "./schema.ts";

export type SpecData = { [key: string]: string | SpecData | SpecData[] };

export const ind = (n: number): string => "  ".repeat(n);

export function genBlock(bs: BlockSchema, data: SpecData, depth: number): string {
  let out = "";
  for (const p of bs.props ?? []) {
    const v = data[p.name];
    if (typeof v === "string" && v.trim()) out += ind(depth) + p.name.padEnd(28) + ": " + v + ";\n";
  }
  for (const b of bs.blocks ?? []) {
    const name = b.name as string;
    if (b.id !== null) {
      const arr = data[name];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const id = typeof (item as SpecData).id === "string" ? ((item as SpecData).id as string) : "";
        const idStr = id ? `(${id})` : "";
        const inner = genBlock(b, item as SpecData, depth + 1);
        if (!idStr && !inner.trim()) continue;
        out += ind(depth) + name + (idStr ? " " + idStr : "") + " {\n" + inner + ind(depth) + "}\n";
      }
    } else {
      const bd = data[name];
      if (!bd || typeof bd !== "object" || Array.isArray(bd)) continue;
      const inner = genBlock(b, bd as SpecData, depth + 1);
      if (!inner.trim()) continue;
      out += ind(depth) + name + " {\n" + inner + ind(depth) + "}\n";
    }
  }
  return out;
}

/** 单个 datapath 组件的裸片段：`CompName (instanceName) { ...props/blocks... }`。 */
export function genIpFragment(comp: BlockSchema, instanceName: string, config: SpecData): string {
  const inner = genBlock(comp, config, 1);
  return `${comp.name} (${instanceName}) {\n` + inner + "}\n";
}
