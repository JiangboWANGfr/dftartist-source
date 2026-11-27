// if 名 / pd 的下拉建议：收集当前文档里所有接口已用过的 interfaceName / powerDomain（去重、去空、排序）。

import type { HardenLibrary } from "./core/model.ts";

export function ifaceSuggestions(lib: HardenLibrary): { ifNames: string[]; pds: string[] } {
  const ifNames = new Set<string>();
  const pds = new Set<string>();
  for (const d of lib.defs) {
    for (const i of d.interfaces) {
      if (i.interfaceName) ifNames.add(i.interfaceName);
      if (i.powerDomain) pds.add(i.powerDomain);
    }
  }
  return { ifNames: [...ifNames].sort(), pds: [...pds].sort() };
}
