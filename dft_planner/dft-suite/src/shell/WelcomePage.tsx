// 启动欢迎页(spec 2026-07-11):冷启动无设计时显示。左品牌+动作,右最近工程。
// 连接型 + IO 无关的动作全走 useProject/useDesign 已有 action。
import { useEffect } from "react";
import { useProject } from "../store/project.ts";

function baseName(p: string): string { return p.split("/").pop() ?? p; }

export function WelcomePage() {
  const recent = useProject((s) => s.recent);
  const pending = useProject((s) => s.pendingLaunchDir);
  useEffect(() => { void useProject.getState().loadRecent(); }, []);

  async function quickOpenDesign() {
    const fl = await (window as any).dft?.design?.pickFilelist?.();
    if (fl) await useProject.getState().openFilelist(fl);
  }

  return (
    <div className="welcome" data-welcome>
      <div className="wl-inner">
        <div className="wl-left">
          <div className="wl-brand">
            <span className="wl-logo" />
            <div>
              <div className="wl-title">dft_stark<span className="brand-sub">:planner</span></div>
              <div className="wl-sub">DFT Stream Planner · DFTSpec Planner · Pad/BScan</div>
            </div>
          </div>
          <div className="wl-actions">
            <button className="wl-action primary" data-wl="new" onClick={() => void useProject.getState().newProject()}>
              <span className="wl-ico">＋</span>
              <span className="wl-atext"><b>New Project</b><small>{pending ? "pick filelist; output dir set by launch args" : "pick filelist + output dir"}</small></span>
            </button>
            <button className="wl-action" data-wl="open" onClick={() => void useProject.getState().openProject()}>
              <span className="wl-ico">📂</span>
              <span className="wl-atext"><b>Open Project</b><small>.dftproj</small></span>
            </button>
            <button className="wl-action" data-wl="quick" onClick={quickOpenDesign}>
              <span className="wl-ico">⚡</span>
              <span className="wl-atext"><b>Quick Open Design</b><small>{pending ? "load filelist and create the project in the launch dir" : "browse hierarchy only, no project"}</small></span>
            </button>
          </div>
          {pending && (
            <div className="wl-launch-dir" data-wl="launch-dir">
              Launch args set the project directory: {pending} — loading a filelist will create the project there
            </div>
          )}
        </div>
        <div className="wl-right">
          <div className="wl-recent-head">Recent Projects</div>
          {recent.length === 0 ? (
            <div className="wl-empty">No projects yet — click New Project to start</div>
          ) : (
            <ul className="wl-recent">
              {recent.map((r) => (
                <li key={r} className="wl-rec" data-wl-recent={r} title={r} onClick={() => void useProject.getState().openRecent(r)}>
                  <span className="wl-rn">{baseName(r).replace(/\.dftproj$/, "")}</span>
                  <span className="wl-rp">{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
