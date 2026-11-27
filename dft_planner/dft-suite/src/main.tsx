import { createRoot } from "react-dom/client";
import { installSafeDrawImage } from "./common/safeCanvas.ts";

// Before anything creates a canvas: a momentarily-collapsed pane must never be able to take the
// whole workspace down (see safeCanvas.ts for the full story).
installSafeDrawImage();
import { App } from "./shell/App.tsx";
import { useDesign } from "./store/design.ts";
import { useProject } from "./store/project.ts";
import { useStore as useHierStore } from "./hierarchy/store.ts";
import { useStore as useGenconnStore } from "./genconn/store.ts";
import { installGenconnLifecycle } from "./genconn/lifecycle.ts";
import { installMenuActions } from "./shell/menuActions.ts";
import "./theme/theme.css";
import "./shell/shell.css";
import "./common/inspector/inspector.css";
import "./common/genpreview/genpreview.css";
const t = localStorage.getItem("dft-suite.theme");
if (t === "light") document.documentElement.classList.add("light");
// Expose shared stores so e2e can drive the real open path (one daemon →
// useDesign.ready → hierarchy reconciliation), mirroring the shell's 打开设计 button.
// Gated to ?e2e=1 (injected by electron/main.cjs only when DFT_E2E is set) so
// production builds never ship this hook.
if (new URLSearchParams(window.location.search).has("e2e")) {
  const w = window as unknown as { __dftStore: typeof useDesign; __hierStore: typeof useHierStore; __gcStore: typeof useGenconnStore; __projStore: typeof useProject };
  w.__dftStore = useDesign;
  w.__hierStore = useHierStore;
  w.__gcStore = useGenconnStore;
  w.__projStore = useProject;
}
installGenconnLifecycle();
installMenuActions();
createRoot(document.getElementById("root")!).render(<App />);
void useProject.getState().initFromLaunch();
