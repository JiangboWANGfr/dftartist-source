// Shared "Fuse Calculation" form — port of buildFuseForm/computeFuses/calculateFuse
// (src/ui/SramRepairAdvisor.cpp:290-325, 481-498, 918 area), used identically by both the
// Binomial and Foundry panels in the original tool. A "Calculate Fuses" button, guarded on
// `repairs` (0 means the caller hasn't run its own Calculate Yield yet), matching the Qt
// source's explicit button-gated calculation exactly rather than recomputing on every keystroke.
import { useState } from "react";
import { computeFuses } from "../core/repairModel.ts";
import { notify } from "../../common/notify.ts";
import { GroupBox } from "./BinomialPanel.tsx";

const num = (v: string, set: (s: string) => void, label: string) => (
  <label className="muted" style={{ display: "block", margin: "3px 0" }}>
    <span style={{ display: "inline-block", width: 152 }}>{label}</span>
    <input className="findinput" style={{ width: 90 }} value={v}
           onChange={(e) => set(e.target.value)} />
  </label>
);

interface FuseResult { fusesPerSession: number; singleBitsNumberOfFuses: number }

export function FuseCalcPanel({ repairs }: { repairs: number }) {
  // Defaults match buildFuseForm (SramRepairAdvisor.cpp:314-318) exactly.
  const [buffer, setBuffer] = useState("32");
  const [zeroCnt, setZeroCnt] = useState("5");
  const [groups, setGroups] = useState("8");
  const [maxSess, setMaxSess] = useState("16");
  const [boxAddr, setBoxAddr] = useState("5");
  const [result, setResult] = useState<FuseResult | null>(null);

  const calculate = () => {
    if (repairs === 0) { notify("Please calculate yield first"); return; }
    const vals = [buffer, zeroCnt, groups, maxSess, boxAddr].map(Number);
    if (!vals.every((v) => Number.isInteger(v) && v > 0)) {
      notify("All fuse parameters must be positive integers");
      return;
    }
    const [bufferV, zeroCntV, groupsV, maxSessV, boxAddrV] = vals;
    setResult(computeFuses(repairs, {
      buffer: bufferV, zeroCnt: zeroCntV, groups: groupsV, maxSess: maxSessV, boxAddr: boxAddrV,
    }));
  };

  // Decimal count mirrors the C++ formatting exactly: FusesPerSession's precision depends on
  // whether `repairs` (the input) is a whole number; SingleBitsNumberOfFuses's own.
  const repairsDecimals = Number.isInteger(repairs) ? 0 : 1;

  return (
    <GroupBox title="Fuse Calculation">
      {num(buffer, setBuffer, "Buffer Size:")}
      {num(zeroCnt, setZeroCnt, "Zero Counter Bits:")}
      {num(groups, setGroups, "Number of Groups:")}
      {num(maxSess, setMaxSess, "Max Fuse Box Sessions:")}
      {num(boxAddr, setBoxAddr, "Fuse Box Address Bits:")}
      <button className="findbtn" onClick={calculate}
              style={{ background: "#9C27B0", color: "#fff", width: "100%", marginTop: 6 }}>
        Calculate Fuses
      </button>
      <div className="muted" style={{ margin: "6px 0", fontSize: 11 }}>
        {result ? (
          <>
            <div><b>FusesPerSession:</b> {result.fusesPerSession.toFixed(repairsDecimals)}</div>
            <div><b>SingleBitsNumberOfFuses:</b> {
              result.singleBitsNumberOfFuses.toFixed(Number.isInteger(result.singleBitsNumberOfFuses) ? 0 : 1)
            }</div>
          </>
        ) : <div><b>FusesPerSession:</b> </div>}
      </div>
    </GroupBox>
  );
}
