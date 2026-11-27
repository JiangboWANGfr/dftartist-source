// F2 — 存取适配（UI 专用，浏览器 API）。
// 优先 File System Access API（Chromium）；不支持则下载 / <input type=file> 兜底。
// localStorage 做自动存 / 开机恢复。序列化/校验仍由 core 的 serialize/deserialize 负责。

const LS_KEY = "genconn:lastdoc";

export function lsSave(text: string): void {
  try {
    localStorage.setItem(LS_KEY, text);
  } catch {
    /* 配额/隐私模式：忽略 */
  }
}
export function lsLoad(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}
export function lsClear(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

// 记住当前文件句柄，"保存"可直接写回不再弹框。
let currentHandle: any = null;
export function resetHandle(): void {
  currentHandle = null;
}

const hasFsAccess = (): boolean => typeof (window as any).showSaveFilePicker === "function";
// 文档主扩展名 .arch(与工程 Arch/<design>.arch 一致);兼容打开旧的 .genconn.json。内容始终是 JSON。
const PICKER_TYPES = [{ description: "GenConn Document", accept: { "application/json": [".arch", ".json"] } }];

/** 直接触发一次文本下载（生成结果用）。 */
export function downloadText(name: string, text: string): void {
  download(name, text);
}

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a); // Safari/Firefox：detached anchor 的 click 不触发下载
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000); // 延后吊销：立刻吊销会取消大文件下载（→ 空文件/无法查看）
}

/** 保存文本。saveAs=true 强制弹框另存。返回 false = 用户取消。 */
export async function fsSave(
  text: string,
  opts: { saveAs?: boolean; suggestedName?: string } = {},
): Promise<boolean> {
  const name = opts.suggestedName ?? "design.arch";
  if (hasFsAccess()) {
    try {
      if (!currentHandle || opts.saveAs) {
        currentHandle = await (window as any).showSaveFilePicker({ suggestedName: name, types: PICKER_TYPES });
      }
      const w = await currentHandle.createWritable();
      await w.write(text);
      await w.close();
      return true;
    } catch (e: any) {
      if (e?.name === "AbortError") return false; // 用户取消
      // 其它错误 → 兜底下载
    }
  }
  download(name, text);
  return true;
}

/** 打开文件，返回其文本内容；null = 用户取消。 */
export async function fsOpen(): Promise<string | null> {
  if (hasFsAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({ types: PICKER_TYPES });
      currentHandle = handle;
      const file = await handle.getFile();
      return await file.text();
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
    }
  }
  return await pickViaInput();
}

function pickViaInput(): Promise<string | null> {
  return pickTextFile(".arch,.json,application/json");
}

/** 通用：选一个文本文件返回内容（如「导出带 DFT 的 .v」兜底选原始 .v）。取消返回 null。 */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    input.click();
  });
}
