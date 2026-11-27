// SRAM Yield Model tab — a segmented Binomial/Foundry selector switching between the two model
// panels, matching the QButtonGroup at src/ui/SramRepairAdvisor.cpp:1766-1795.
import { useState } from "react";
import { BinomialPanel } from "./BinomialPanel.tsx";
import { FoundryPanel } from "./FoundryPanel.tsx";

export function YieldModelTab({ memories }: { memories: Array<{ path: string; bits: number }> }) {
  const [model, setModel] = useState<"binomial" | "foundry">("binomial");
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px 0" }}>
        <span className="muted" style={{ fontSize: 12 }}>Model:</span>
        <button className="findbtn" data-btn="ym-binomial"
                title="Parameter-driven yield curve — no memory data required"
                style={{ fontWeight: model === "binomial" ? 700 : 400,
                         background: model === "binomial" ? "#0b5394" : undefined,
                         color: model === "binomial" ? "#fff" : undefined }}
                onClick={() => setModel("binomial")}>Binomial Model</button>
        <button className="findbtn" data-btn="ym-foundry"
                title="Redundancy-free-density analysis over your memory list"
                style={{ fontWeight: model === "foundry" ? 700 : 400,
                         background: model === "foundry" ? "#0b5394" : undefined,
                         color: model === "foundry" ? "#fff" : undefined }}
                onClick={() => setModel("foundry")}>Foundry Model</button>
      </div>
      {/* Both stay mounted (CSS show/hide) — matching the Qt QStackedWidget, whose Binomial/
          Foundry pages are constructed once and never destroyed on toggle. */}
      <div data-panel="binomial" style={{ display: model === "binomial" ? "flex" : "none", flex: 1, minHeight: 0 }}>
        <BinomialPanel />
      </div>
      <div data-panel="foundry" style={{ display: model === "foundry" ? "flex" : "none", flex: 1, minHeight: 0 }}>
        <FoundryPanel memories={memories} />
      </div>
    </div>
  );
}
