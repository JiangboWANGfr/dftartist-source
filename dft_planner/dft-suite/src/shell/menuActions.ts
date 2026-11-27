// 把原生菜单动作派发到已有 store。仅是「多一个触发入口」，不新增业务逻辑。
// genconn 的文件命令（new/open/save）沿用 genconn 快捷键既有实现——这里只覆盖
// 一定跨工作区可用的动作（切工作区 / 主题）。文件类动作转发到 genconn store 已有 action。
import { useDesign } from "../store/design.ts";
import { useStore as useGenconnStore } from "../genconn/store.ts";
import { useProject } from "../store/project.ts";

export function installMenuActions(): void {
  const app = (window as any).dft?.app;
  if (!app?.onMenuAction) return; // 非 Electron / 旧 preload
  app.onMenuAction((action: string) => {
    switch (action) {
      case "ws-hierarchy": useDesign.getState().setWorkspace("hierarchy"); break;
      case "ws-genconn": useDesign.getState().setWorkspace("genconn"); break;
      case "ws-specgen": useDesign.getState().setWorkspace("specgen"); break;
      case "toggle-theme": {
        const cur = useDesign.getState().theme;
        useDesign.getState().setTheme(cur === "dark" ? "light" : "dark");
        break;
      }
      case "undo": useGenconnStore.temporal.getState().undo(); break;
      case "redo": useGenconnStore.temporal.getState().redo(); break;
      case "project-new": void useProject.getState().newProject(); break;
      case "project-open": void useProject.getState().openProject(); break;
      // new/open/save/save-as：P1 占位——切到 genconn 工作区,真实文件命令由 genconn 渲染层快捷键负责。
      case "new": case "open": case "save": case "save-as":
        useDesign.getState().setWorkspace("genconn");
        break;
    }
  });
}
