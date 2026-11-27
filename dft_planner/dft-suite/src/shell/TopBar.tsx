import { useDesign } from "../store/design.ts";
import { ProjectMenu } from "./ProjectMenu.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

const TABS = [
  { id: "hierarchy", label: "Hierarchy" },
  { id: "genconn",   label: "DFT Stream Planner" },
  { id: "specgen",   label: "DFTSpec Planner" },
  { id: "scanplan",  label: "Scan Planner" },
  { id: "clocktree", label: "Clock Tree" },
  { id: "drc",       label: "DRC" },
  { id: "sdc",       label: "SDC Check" },
  { id: "dfxip",     label: "DFX IP" },
  { id: "memory",    label: "MBIST Planner" },
  { id: "dftcfg",    label: "DFT Config" },
] as const;

export function TopBar() {
  const workspace = useDesign(s => s.workspace);
  const status = useDesign(s => s.status);

  return (
    <div id="topbar" className="topbar">
      <div className="brand">
        <span className="logo" />
        dft_stark<span className="brand-sub">:planner</span>
      </div>
      {status !== "idle" && (
        <div className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab${workspace === tab.id ? " active" : ""}`}
              data-tab={tab.id}
              onClick={() => useDesign.getState().setWorkspace(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="spacer" />
      <ProjectMenu />
      <ThemeToggle />
    </div>
  );
}
