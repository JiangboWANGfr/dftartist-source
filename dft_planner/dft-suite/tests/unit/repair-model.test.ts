// The SRAM repair math ported into the MBIST Planner must stay numerically/behaviorally
// identical to the Qt SRAM Repair Advisor (src/ui/SramRepairAdvisor.cpp) — same negative-
// binomial model, same 99.9% criterion, same fuse formulas, same editable Redundancy Guideline,
// same Foundry Model. The expected values here are computed from the C++ formulas directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySpareScheme, bandLabel, computeFuses, computeYield, defaultGuideline, foundryCalculate,
  foundryDistribution, foundrySortedOrder, formatStorageUnits, lookupGuideline, methodColor,
  parseStorageUnits, repairFor, tierBound, tiersFromGuideline,
} from "../../src/hierarchy/core/repairModel.ts";

test("yield: d0PerSqMm and m follow the C++ formula", () => {
  const r = computeYield({ d0: 0.1, complexity: 1, adjust: 1, area: 10, alpha: 2 });
  // (0.1 / 645.16) * 1 * 1
  assert.ok(Math.abs(r.d0PerSqMm - 0.1 / 645.16) < 1e-12);
  assert.ok(Math.abs(r.m - (10 * (0.1 / 645.16)) / 2) < 1e-12);
});

test("yield: cdf is monotone, starts at pmf[0], and stays <= 1", () => {
  const r = computeYield({ d0: 5, complexity: 2, adjust: 1.2, area: 4, alpha: 1.5 });
  for (let i = 1; i < 100; i++) assert.ok(r.cdf[i] >= r.cdf[i - 1] - 1e-15, `cdf dips at ${i}`);
  assert.ok(r.cdf[99] <= 1 + 1e-9);
  assert.ok(r.cdf[0] > 0);
});

test("yield: repairs = 1.5 x first index whose cdf exceeds 99.9%", () => {
  const r = computeYield({ d0: 5, complexity: 2, adjust: 1.2, area: 4, alpha: 1.5 });
  let j = 1;
  while (j < 100 && !(r.cdf[j] > 0.999)) j++;
  assert.equal(r.repairs, j < 100 ? j * 1.5 : 0);
  assert.equal(r.repairs % 1.5, 0);
});

test("yield: a defect-free process needs no repairs", () => {
  // m -> ~0 => cdf[1] already above 99.9% => repairs = 1.5 (the first qualifying index)
  const r = computeYield({ d0: 1e-6, complexity: 1, adjust: 1, area: 0.01, alpha: 2 });
  assert.equal(r.repairs, 1.5);
});

test("lgamma is accurate enough: alpha=1 makes the model geometric", () => {
  // alpha = 1 => pmf[x] = m^x / (1+m)^(1+x); cdf[n] = 1 - (m/(1+m))^(n+1)
  const alpha = 1, area = 10, d0 = 100, complexity = 1, adjust = 1;
  const r = computeYield({ d0, complexity, adjust, area, alpha });
  const m = r.m;
  for (const n of [0, 1, 5, 20]) {
    const want = 1 - Math.pow(m / (1 + m), n + 1);
    assert.ok(Math.abs(r.cdf[n] - want) < 1e-9, `cdf[${n}] ${r.cdf[n]} != ${want}`);
  }
});

test("fuses: both formulas match the C++ expressions", () => {
  const f = { buffer: 8, zeroCnt: 3, groups: 4, maxSess: 2, boxAddr: 5 };
  const repairs = 6;
  const fps = repairs * 8 + (repairs + 1) * 4 + 3 * (5 + 4);      // 48 + 28 + 27
  const single = 2 * fps + ((2 - 1) * (5 + 1) + 1);               // 2*fps + 7
  assert.deepEqual(computeFuses(repairs, f),
    { fusesPerSession: fps, singleBitsNumberOfFuses: single });
  assert.equal(fps, 103);
  assert.equal(single, 213);
});

test("fuses: fractional repair counts are allowed (repairs = j * 1.5)", () => {
  const f = { buffer: 2, zeroCnt: 1, groups: 1, maxSess: 1, boxAddr: 1 };
  const r = computeFuses(4.5, f);
  assert.equal(r.fusesPerSession, 4.5 * 2 + 5.5 * 2 + 0);   // 9 + 11
  assert.equal(r.singleBitsNumberOfFuses, 20 + 1);
});

test("storage units: parse K/M/G and scientific, format back through K/M/G/T", () => {
  assert.equal(parseStorageUnits("96K"), 96 * 1024);
  assert.equal(parseStorageUnits("1M"), 1024 * 1024);
  assert.equal(parseStorageUnits("0.5G"), 0.5 * 1024 * 1024 * 1024);
  assert.equal(parseStorageUnits("1.5E3"), 1500);
  assert.equal(parseStorageUnits(""), 0);
  assert.equal(parseStorageUnits("garbage"), 0);
  assert.equal(formatStorageUnits(500), "500.00");
  assert.equal(formatStorageUnits(2048), "2.00K");
  assert.equal(tierBound(Infinity), "∞");
  assert.equal(tierBound(2048), "2K");
  assert.equal(tierBound(500), "500");
});

test("methodColor maps by name substring regardless of exact casing/renaming", () => {
  assert.equal(methodColor("Column + Row"), "rgb(255,205,170)");
  assert.equal(methodColor("column only"), "rgb(200,255,200)");
  assert.equal(methodColor("No Redundancy"), "rgb(224,236,224)");
  assert.equal(methodColor("Something Else"), "rgb(255,235,150)");
});

test("tiers: ties break toward the LATER method (C++ uses >=, not >)", () => {
  // Per-band winners under >=, later-wins: band0/1 (0-64K) = [0,100,0] -> Column Only outright.
  // band2 (64-128K) = [0,50,50] -> a genuine tie between Column Only and Column + Row; the C++
  // source picks the LAST (Column + Row) — a `>` tie-break would wrongly keep "Column Only" here
  // and merge bands 0-2 into one 128K-wide tier instead of splitting at 64K.
  const t = tiersFromGuideline(defaultGuideline());
  assert.deepEqual(t.map((x) => x.repair), ["Column Only", "Column + Row"]);
  assert.equal(t[0].min, 0);
  assert.equal(t[0].max, 64 * 1024);       // NOT 128K — that would be the pre-fix (`>`) boundary
  assert.equal(t[1].max, Infinity);
});

test("repairFor: a memory's size picks its redundancy", () => {
  const tiers = tiersFromGuideline(defaultGuideline());
  assert.equal(repairFor(8 * 1024, tiers), "Column Only");
  assert.equal(repairFor(96 * 1024, tiers), "Column + Row");   // in the tie-break band (64K-128K)
  assert.equal(repairFor(200 * 1024, tiers), "Column + Row");
});

test("bandLabel formats a guideline column as 'lo → hi'", () => {
  const g = defaultGuideline();
  assert.equal(bandLabel(g, 0), "0.00 → 32.00K");
  assert.equal(bandLabel(g, g.edges.length - 2), "512.00K → 1.00M");
});

test("lookupGuideline: finds the band, dominant method, and full mix", () => {
  const g = defaultGuideline();
  const r = lookupGuideline(96 * 1024, g);
  assert.ok(r);
  assert.equal(r!.bandLabel, "64.00K → 128.00K");
  // Lookup uses STRICT `>` (first method wins a tie) — deliberately DIFFERENT from
  // tiersFromGuideline's `>=` (last wins), matching the same inconsistency in the C++ source
  // (doLookup vs tiersFromGuideline). This band's tie (50/50) resolves to "Column Only" here,
  // even though the merged Repair Strategy panel reports "Column + Row" for the same band.
  assert.equal(r!.dominant, "Column Only");
  assert.match(r!.mix, /Column Only 50%/);
  assert.match(r!.mix, /Column \+ Row 50%/);
  assert.equal(lookupGuideline(0, g), null);
  assert.equal(lookupGuideline(-5, g), null);
});

test("lookupGuideline: the top band catches everything at/above its lower edge", () => {
  const g = defaultGuideline();
  const r = lookupGuideline(50 * 1024 * 1024, g);   // way above the top edge (1M) -> top band [0,0,100]
  assert.ok(r);
  assert.equal(r!.dominant, "Column + Row");
});

test("foundry: sorted order is ascending by normalized size (stable)", () => {
  const mems = [{ normalized: 300, generateNum: 1 }, { normalized: 100, generateNum: 1 },
                { normalized: 200, generateNum: 1 }];
  assert.deepEqual(foundrySortedOrder(mems), [1, 2, 0]);
});

test("foundry: calculate sums generateNum for every memory above the cumulative threshold", () => {
  const mems = [{ normalized: 100, generateNum: 1 }, { normalized: 100, generateNum: 2 },
                { normalized: 100, generateNum: 3 }];
  // cumulative: 100 (<=150, no spare), 200 (>150, +2), 300 (>150, +3) -> needRedundancy=5
  const r = foundryCalculate(mems, 150, 0.5);
  assert.equal(r.needRedundancy, 5);
  assert.equal(r.repairs, Math.ceil(5 * 0.5));
});

test("foundry: applySpareScheme marks below-threshold memories 'No spare needed', "
   + "the rest get their OWN size's guideline tier", () => {
  const mems = [{ normalized: 8 * 1024, generateNum: 1 }, { normalized: 200 * 1024, generateNum: 1 }];
  const tiers = tiersFromGuideline(defaultGuideline());
  const rows = applySpareScheme(mems, 16 * 1024, tiers);
  assert.equal(rows[0].spareScheme, "No spare needed");
  assert.equal(rows[0].tier, -1);
  assert.equal(rows[1].tier >= 0, true);
  assert.equal(rows[1].spareScheme, repairFor(200 * 1024, tiers));
});

test("foundry: distribution counts/percentages sum to the total row count", () => {
  const mems = [{ normalized: 8 * 1024, generateNum: 1 }, { normalized: 8 * 1024, generateNum: 1 },
                { normalized: 200 * 1024, generateNum: 1 }];
  const tiers = tiersFromGuideline(defaultGuideline());
  const rows = applySpareScheme(mems, 16 * 1024, tiers);
  const dist = foundryDistribution(rows, tiers);
  const totalCount = dist.reduce((s, d) => s + d.count, 0);
  assert.equal(totalCount, mems.length);
  const totalPct = dist.reduce((s, d) => s + d.pct, 0);
  assert.ok(Math.abs(totalPct - 100) < 1e-9);
});
