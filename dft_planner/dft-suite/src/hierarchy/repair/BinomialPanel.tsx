// Port of BinomialModelWindow (src/ui/SramRepairAdvisor.cpp:330-506) — parameter-driven
// negative-binomial yield model, no memory data required. A "Calculate Yield" button, matching
// the Qt source exactly: parameters are held as plain text (so an invalid/non-positive value is
// caught the same way — a warning, not a silently-recomputed 0), the Results/plot stay at their
// placeholder text until Calculate is pressed, sections are real bordered group boxes (QGroupBox
// -> <fieldset>/<legend>, which cuts the border natively regardless of surrounding background),
// and the yield curve is the large, filling centerpiece (YieldCurveWidget's paintEvent, ported to
// SVG almost line for line: gradient fill under the curve, amber 99.9% threshold, green repairs
// marker + dot, axis frame and titles).
import { useState } from "react";
import type { ReactNode } from "react";
import { computeYield, tiersFromGuideline, type RepairTier } from "../core/repairModel.ts";
import { FuseCalcPanel } from "./FuseCalcPanel.tsx";
import { notify } from "../../common/notify.ts";

const num = (v: string, set: (s: string) => void, label: string) => (
  <label className="muted" style={{ display: "block", margin: "3px 0" }}>
    <span style={{ display: "inline-block", width: 90 }}>{label}</span>
    <input className="findinput" style={{ width: 90 }} value={v}
           onChange={(e) => set(e.target.value)} />
  </label>
);

/** QGroupBox -> <fieldset>/<legend>: the browser cuts the top border for the title natively, so
 *  this needs no background-color hack to match whatever it is placed on. */
export function GroupBox({ title, children, style }: { title: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <fieldset style={{ border: "1px solid #3c3c3c", borderRadius: 6, padding: "8px 10px 10px",
                       margin: "10px 0 0", ...style }}>
      <legend style={{ padding: "0 5px", fontSize: 12, fontWeight: 600, color: "#d4d4d4" }}>{title}</legend>
      {children}
    </fieldset>
  );
}

interface YieldCalc { repairs: number; cdf: number[] }

/** Port of YieldCurveWidget::paintEvent (SramRepairAdvisor.cpp:166-266) — a responsive SVG
 *  standing in for the QPainter drawing, at the same virtual proportions. */
function YieldCurveChart({ result }: { result: YieldCalc | null }) {
  const VB_W = 760, VB_H = 460;
  const mL = 58, mR = 24, mT = 40, mB = 46;
  const plotL = mL, plotT = mT, plotR = VB_W - mR, plotB = VB_H - mB;
  const X = (i: number) => plotL + (plotR - plotL) * (i / 99);
  const Y = (v: number) => plotB - (plotB - plotT) * Math.min(Math.max(v, 0), 1);

  const title = result
    ? `Cumulative Yield — 99.9% reached at ${result.repairs.toFixed(1)} repairs`
    : "Cumulative Yield Curve";
  const n = result ? Math.min(100, result.cdf.length) : 0;
  const path = result
    ? Array.from({ length: n }, (_, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(result.cdf[i]).toFixed(1)}`).join("")
    : "";
  const area = result ? `M${X(0).toFixed(1)},${plotB} L${path.slice(1)} L${X(n - 1).toFixed(1)},${plotB} Z` : "";
  const mi = result ? Math.min(Math.max(Math.round(result.repairs), 0), n - 1) : 0;

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%"
         style={{ display: "block" }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sra-yield-fill" x1="0" y1={plotT} x2="0" y2={plotB} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3884ff" stopOpacity={0.47} />
          <stop offset="1" stopColor="#3884ff" stopOpacity={0.04} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={VB_W} height={VB_H} rx={10} fill="#1b1e24" />
      <text x={VB_W / 2} y={24} textAnchor="middle" fill="#e6e9ef" fontSize={16} fontWeight={700}>{title}</text>

      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((g) => (
        <g key={g}>
          <line x1={plotL} y1={Y(g)} x2={plotR} y2={Y(g)} stroke="rgba(255,255,255,0.09)" />
          <text x={plotL - 8} y={Y(g) + 4} fill="#8b949e" fontSize={11} textAnchor="end">{g.toFixed(1)}</text>
        </g>
      ))}
      {[0, 20, 40, 60, 80].map((gx) => (
        <g key={gx}>
          <line x1={X(gx)} y1={plotT} x2={X(gx)} y2={plotB} stroke="rgba(255,255,255,0.07)" />
          <text x={X(gx)} y={plotB + 18} fill="#8b949e" fontSize={11} textAnchor="middle">{gx}</text>
        </g>
      ))}
      <line x1={plotL} y1={plotB} x2={plotR} y2={plotB} stroke="#555b66" />
      <line x1={plotL} y1={plotT} x2={plotL} y2={plotB} stroke="#555b66" />
      <text x={(plotL + plotR) / 2} y={VB_H - 12} fill="#c0c6d0" fontSize={12} textAnchor="middle">
        Number of Repairs</text>
      <text x={16} y={(plotT + plotB) / 2} fill="#c0c6d0" fontSize={12} textAnchor="middle"
            transform={`rotate(-90 16 ${(plotT + plotB) / 2})`}>Cumulative Yield</text>

      {!result ? (
        <text x={(plotL + plotR) / 2} y={(plotT + plotB) / 2} fill="#6b7280" fontSize={13}
              textAnchor="middle">Press Calculate to plot the yield curve</text>
      ) : (
        <>
          <path d={area} fill="url(#sra-yield-fill)" stroke="none" />
          <line x1={plotL} y1={Y(0.999)} x2={plotR} y2={Y(0.999)} stroke="#f5a623" strokeWidth={1.2}
                strokeDasharray="5 4" opacity={0.85} />
          <text x={plotR - 4} y={Y(0.999) - 6} fill="#f5a623" fontSize={11} textAnchor="end">99.9%</text>
          <line x1={X(result.repairs)} y1={plotT} x2={X(result.repairs)} y2={plotB}
                stroke="#22c55e" strokeWidth={1.6} strokeDasharray="5 4" opacity={0.9} />
          <path d={path} fill="none" stroke="#3884ff" strokeWidth={2.6} />
          <circle cx={X(result.repairs)} cy={Y(result.cdf[mi])} r={5.5} fill="#22c55e" stroke="#fff" strokeWidth={1.8} />
        </>
      )}
    </svg>
  );
}

export function BinomialPanel() {
  // Defaults match BinomialModelWindow::buildUi (SramRepairAdvisor.cpp:383-387) exactly.
  const [d0, setD0] = useState("1.0");
  const [complexity, setComplexity] = useState("1.0");
  const [area, setArea] = useState("1.0");
  const [alpha, setAlpha] = useState("1.0");
  const [adjust, setAdjust] = useState("1.0");
  const [tiers, setTiers] = useState<RepairTier[]>(() => tiersFromGuideline());
  const [result, setResult] = useState<YieldCalc | null>(null);

  const calculate = () => {
    setTiers(tiersFromGuideline());
    const vals = [d0, complexity, adjust, area, alpha].map(Number);
    if (!vals.every((v) => Number.isFinite(v)) || vals.some((v) => v <= 0)) {
      notify("All parameters must be positive");
      return;
    }
    const [d0v, complexityV, adjustV, areaV, alphaV] = vals;
    const y = computeYield({ d0: d0v, complexity: complexityV, adjust: adjustV, area: areaV, alpha: alphaV });
    setResult({ repairs: y.repairs, cdf: y.cdf });
  };
  const refreshStrategy = () => {
    setTiers(tiersFromGuideline());
    notify("Repair strategy refreshed from Table 1");
  };

  return (
    <div style={{ display: "flex", gap: 14, padding: 10, overflow: "auto", minHeight: 0, flex: 1 }}>
      <div style={{ flex: "0 0 340px", overflowY: "auto" }}>
        <div className="muted" style={{ fontSize: 11 }}>
          Parameter-driven negative-binomial yield model — no memory data required.
        </div>

        <GroupBox title="Binomial Parameters">
          {num(d0, setD0, "D0:")}
          {num(complexity, setComplexity, "Complexity:")}
          {num(area, setArea, "Area:")}
          {num(alpha, setAlpha, "Alpha:")}
          {num(adjust, setAdjust, "Adjust:")}
        </GroupBox>
        <button className="findbtn" onClick={calculate}
                style={{ background: "#4CAF50", color: "#fff", width: "100%", marginTop: 10, height: 36, fontWeight: 700 }}>
          Calculate Yield
        </button>

        <GroupBox title="Results">
          <div className="muted" style={{ fontSize: 11 }}>
            {result
              ? <><b style={{ color: "#e6e9ef" }}>Calculation complete.</b><br />Repairs needed: {result.repairs.toFixed(1)}</>
              : <>Press <b>Calculate Yield</b> to run the model.</>}
          </div>
        </GroupBox>

        <GroupBox title="Repair Strategy (from Table 1)">
          <div className="muted" style={{ fontSize: 11 }}>
            {tiers.map((t, i) => (
              <div key={i}>Tier {i + 1}: {(t.min / 1024).toFixed(0)}K – {t.max === Infinity ? "∞" : `${(t.max / 1024).toFixed(0)}K`} → <b>{t.repair}</b></div>
            ))}
            <div style={{ marginTop: 4, fontSize: 10 }}>
              Derived from the Redundancy Guideline (Table 1). Edit the table on the Redundancy
              Guideline tab, then Refresh.
            </div>
          </div>
          <button className="findbtn" onClick={refreshStrategy}
                  style={{ background: "#FF9800", color: "#fff", width: "100%", marginTop: 8 }}>
            Refresh from Table 1
          </button>
        </GroupBox>

        <FuseCalcPanel repairs={result?.repairs ?? 0} />
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 380, display: "flex" }}>
        <YieldCurveChart result={result} />
      </div>
    </div>
  );
}
