// App-lifecycle wiring for the genconn canvas (renderer side).
//  - Change 3: opening a NEW design (shared useDesign.filelist changes) resets the canvas to a
//    fresh empty doc, with a save guard when the current doc is dirty.
//  - Change 4: before the window closes, if the doc is dirty, coordinate a 保存/不保存/取消 prompt
//    with the main process (native dialog) and only then let the window close.
// Wired once at startup (main.tsx). No-op outside Electron (no window.dft.app bridge).

import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import { lsSave } from "./persist.ts";
import { appConfirm } from "../common/notify.ts";

/** Change 3 — reset the genconn doc to empty when the shared design filelist switches. */
function installDesignSwitchReset(): void {
  let last = useDesign.getState().filelist;
  useDesign.subscribe((s) => {
    const next = s.filelist;
    const prev = last;
    last = next;
    if (!next || next === prev) return; // not a switch to a new design
    if (prev == null) return; // first design after launch: keep the in-progress canvas, don't wipe
    const gc = useStore.getState();
    void (async () => {
      if (gc.dirty) {
        const keep = await appConfirm("The connection canvas has unsaved changes; switching design will clear it. Save first?");
        if (keep) {
          const text = gc.toText();
          void import("../store/project.ts").then(({ useProject }) =>
            useProject.getState().saveGenconn(text).then((ok) => { if (!ok) lsSave(text); }));
          gc.markSaved();
        }
      }
      useStore.getState().newDoc("chip");
    })();
  });
}

/** Change 4 — answer the main process's before-close query and run the chosen save action. */
function installBeforeClose(): void {
  const app = (window as any).dft?.app;
  if (!app?.onBeforeClose || !app?.respondClose) return; // not in Electron (or old preload)
  // Under e2e there is no user to answer a native dialog, and tests call app.close() — never
  // block on a save prompt there (report clean so the window closes immediately).
  const e2e = new URLSearchParams(window.location.search).has("e2e");
  app.onBeforeClose(async () => {
    const gc = useStore.getState();
    // Clean doc (or e2e) → close immediately. Dirty doc → main shows 保存/不保存/取消.
    const action = await app.respondClose({ dirty: e2e ? false : gc.dirty }); // "closed" | "save" | "discard" | "cancel"
    if (action === "save") {
      const text = gc.toText();
      try {
        const { useProject } = await import("../store/project.ts");
        const ok = await useProject.getState().saveGenconn(text);
        if (!ok) lsSave(text); // 无工程 → 兜底本地草稿
        gc.markSaved();
      } catch {
        lsSave(text); // 保存失败也别把窗口卡住：落本地草稿，仍放行关闭
      }
      await app.confirmClose();
    } else if (action === "discard") {
      await app.confirmClose();
    }
    // "closed" → main already closed on its own; "cancel" → leave the window open.
  });
}

/** 工程绑定：当前工程(path)变化时，若工程记录了 genconnDoc 且可读 → 载入；否则回到空文档。
 *  用动态 import 取工程 store，避免与 store/design/project 的 import 顺序耦合。 */
function installProjectBinding(): void {
  const projApi = (window as any).dft?.project;
  if (!projApi?.read) return; // 非 Electron / 旧 preload
  let lastPath: string | null = null;
  void import("../store/project.ts").then(({ useProject }) => {
    useProject.subscribe((s) => {
      if (s.path === lastPath) return;
      lastPath = s.path;
      if (!s.project) return; // 关闭工程不动画布
      const gc = useStore.getState();
      const doc = s.project.genconnDoc;
      if (doc) {
        const abs = doc.startsWith("/") ? doc : s.path!.replace(/[^/]+$/, "") + doc;
        void projApi.read(abs).then(
          (text: string) => { try { gc.openText(text); } catch { gc.newDoc("chip"); } },
          () => gc.newDoc("chip"), // 读不到 → 空
        );
      } else {
        gc.newDoc("chip");
      }
    });
  });
}

/** Install renderer-side lifecycle hooks. Safe to call once at app startup. */
export function installGenconnLifecycle(): void {
  installDesignSwitchReset();
  installBeforeClose();
  installProjectBinding();
}
