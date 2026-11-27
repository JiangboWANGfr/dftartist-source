// 统一 genconn 文档保存(工具栏「保存/另存为」与 Ctrl+S 共用一条路径,避免逻辑分叉)。
// 工程打开且非「另存为」→ 直接写进工程记录的 genconn 文档(Arch/<design>.arch),不弹框;
// 否则走浏览器文件选择器存 <设计名>.arch(内容仍是 JSON,与工程一致)。

import { useProject } from "../store/project.ts";
import { fsSave } from "./persist.ts";
import { useStore } from "./store.ts";

export async function saveGenconnDoc(saveAs = false): Promise<void> {
  const s = useStore.getState();
  const text = s.toText();
  if (!saveAs && (await useProject.getState().saveGenconn(text))) { s.markSaved(); return; }
  const ok = await fsSave(text, { saveAs, suggestedName: `${s.doc.ui.rootDefId}.arch` });
  if (ok) s.markSaved();
}
