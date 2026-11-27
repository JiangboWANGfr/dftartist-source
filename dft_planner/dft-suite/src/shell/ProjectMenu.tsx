import { useEffect, useState } from "react";
import { useProject } from "../store/project.ts";

function baseName(p: string): string { return p.split("/").pop() ?? p; }

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const path = useProject((s) => s.path);
  const recent = useProject((s) => s.recent);
  useEffect(() => { void useProject.getState().loadRecent(); }, []);

  const label = path ? baseName(path).replace(/\.dftproj$/, "") : "Project";

  async function quickOpenDesign() {
    setOpen(false);
    const fl = await (window as any).dft?.design?.pickFilelist?.();
    if (fl) await useProject.getState().openFilelist(fl);
  }

  return (
    <span className="proj-menu-wrap">
      <button className="tbtn primary" data-proj="btn" onClick={() => setOpen((v) => !v)}>{label} <span className="chev">▾</span></button>
      {open && (
        <div className="proj-menu" onMouseLeave={() => setOpen(false)}>
          <div className="proj-menu-item" data-proj-item="new" onClick={() => { setOpen(false); void useProject.getState().newProject(); }}>New Project…</div>
          <div className="proj-menu-item" data-proj-item="open" onClick={() => { setOpen(false); void useProject.getState().openProject(); }}>Open Project…</div>
          <div className="proj-menu-item" data-proj-item="quick" onClick={quickOpenDesign}>Quick Open Design…</div>
          {recent.length > 0 && <div className="proj-menu-sep" />}
          {recent.map((r) => (
            <div key={r} className="proj-menu-item recent" title={r} onClick={() => { setOpen(false); void useProject.getState().openRecent(r); }}>
              {baseName(r).replace(/\.dftproj$/, "")}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
