// Port of the SRAM Repair Advisor main window (src/ui/SramRepairAdvisor.cpp:1737-1805) — three
// switchable tabs: Redundancy Guideline · SRAM Yield Model · Help Documentation.
import { useState } from "react";
import { RedundancyGuidelineTab } from "./RedundancyGuidelineTab.tsx";
import { YieldModelTab } from "./YieldModelTab.tsx";
import { RepairHelpTab } from "./RepairHelpTab.tsx";

type Sub = "guideline" | "yield" | "help";

export function SramRepairAdvisorView({ memories }: { memories: Array<{ path: string; bits: number }> }) {
  const [sub, setSub] = useState<Sub>("guideline");
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="crhead">
        {([
          ["guideline", "Redundancy Guideline"],
          ["yield", "SRAM Yield Model"],
          ["help", "Help  Documentation"],
        ] as const).map(([s, label]) => (
          <button key={s} className="findbtn" data-sub={`sra-${s}`}
                  style={{ fontWeight: sub === s ? 700 : 400 }} onClick={() => setSub(s)}>
            {label}
          </button>
        ))}
      </div>
      {/* All three stay mounted (CSS show/hide, not conditional rendering) — matching the Qt
          QTabWidget, whose pages are constructed once and never destroyed on tab switch. An
          unmount/remount-per-switch would silently discard an unsaved guideline edit or a
          typed-in Foundry memory list the moment the user glanced at another tab. */}
      <div data-panel="sra-guideline" style={{ display: sub === "guideline" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <RedundancyGuidelineTab />
      </div>
      <div data-panel="sra-yield" style={{ display: sub === "yield" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <YieldModelTab memories={memories} />
      </div>
      <div data-panel="sra-help" style={{ display: sub === "help" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <RepairHelpTab />
      </div>
    </div>
  );
}
