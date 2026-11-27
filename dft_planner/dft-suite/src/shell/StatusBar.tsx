import { useDesign } from "../store/design.ts";
import { useProject } from "../store/project.ts";

const baseName = (p: string) => p.split("/").pop() ?? p;

export function StatusBar() {
  const status = useDesign(s => s.status);
  const top = useDesign(s => s.top);
  const filelist = useDesign(s => s.filelist);
  const selected = useDesign(s => s.selected);
  const projPath = useProject(s => s.path);

  if (status === "idle") {
    return (
      <div id="statusbar" className="status">
        <div className="seg">
          <span className="dot" />
          No design open
        </div>
        <div className="sp" />
        <div className="seg muted">Open Design → Hierarchy / DFT Stream Planner</div>
      </div>
    );
  }

  if (status === "opening") {
    return (
      <div id="statusbar" className="status">
        <div className="seg">
          <span className="dot warn" />
          Opening…
        </div>
        <div className="sp" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div id="statusbar" className="status">
        <div className="seg">
          <span className="dot err" />
          Failed to open
        </div>
        <div className="sp" />
      </div>
    );
  }

  // ready
  return (
    <div id="statusbar" className="status">
      <div className="seg">
        <span className="dot ok" />
        Kernel <b>Ready</b>
      </div>
      {projPath && <div className="seg">Project <b>{baseName(projPath).replace(/\.dftproj$/, "")}</b></div>}
      {top && <div className="seg">Design <b>{top}</b></div>}
      {filelist && !top && <div className="seg">Filelist <b>{filelist}</b></div>}
      {selected && (
        <div className="seg">Selected <b>{selected.nodeId} : {selected.defId}</b></div>
      )}
      <div className="sp" />
      <div className="seg muted">hdl-core · dft_stark:planner</div>
    </div>
  );
}
