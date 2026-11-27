const basis =
  "B standard-gate fail-closed/input-preflight/caller-root contract; DESIGN §6.15.4 preserves frozen controls";
const row = (id, input, expected) => ({ id, input, expected, basis });
export const prefix = "web/tests/independent-source-view/",
  position = "web/tests/independent-source-position-interaction/";
export const commands = [
  ["--test", prefix + "inventory.test.mjs", prefix + "q1q2/inventory.test.mjs"],
  [prefix + "q1q2/verify-fixtures.mjs"],
  [prefix + "run.mjs", "--self-check"],
  [prefix + "q1q2/run.mjs", "--self-check"],
  ["--test", position + "inventory.test.mjs"],
  [position + "run.mjs", "--controls"],
  [position + "verify-observation.mjs"],
];
export const entries = commands.flatMap((c) =>
  c[0] === "--test" ? c.slice(1) : c.slice(0, 1),
);
const newest = entries.at(-1),
  earlier = prefix + "q1q2/verify-fixtures.mjs";
export const cases = [
  row(
    "B-OBS-GATE-happy",
    { fault: "none", args: ["controls"] },
    {
      status: 0,
      rows: 8,
      newObservation: 1,
      root: "wrapper root",
      tools: "root/web",
      npm: "not needed",
    },
  ),
  row(
    "B-OBS-GATE-repeat",
    { fault: "none", args: ["controls"], repeat: 2 },
    { status: 0, rowsPerRun: 8, isolated: true },
  ),
  ...["missing", "directory", "exit23", "signal", "throw"].map((fault) =>
    row(
      "B-OBS-GATE-new-" + fault,
      { fault, target: newest, args: ["controls"] },
      fault === "missing" || fault === "directory"
        ? { status: 1, rows: 0, preflight: true }
        : { status: fault === "exit23" ? 23 : 1, rows: 8, nonzero: true },
    ),
  ),
  ...["exit23", "signal"].map((fault) =>
    row(
      "B-OBS-GATE-earlier-" + fault,
      { fault, target: earlier, args: ["controls"] },
      { status: fault === "exit23" ? 23 : 1, rows: 3, noLater: true },
    ),
  ),
  row(
    "B-OBS-GATE-first-inventory-missing",
    { fault: "missing", target: entries[0], args: ["controls"] },
    { status: 1, rows: 0, preflight: true },
  ),
  row(
    "B-OBS-GATE-second-inventory-missing",
    { fault: "missing", target: entries[1], args: ["controls"] },
    { status: 1, rows: 0, preflight: true },
  ),
  row(
    "B-OBS-GATE-second-inventory-directory",
    { fault: "directory", target: entries[1], args: ["controls"] },
    { status: 1, rows: 0, preflight: true },
  ),
  row(
    "B-OBS-GATE-late-legacy-missing",
    { fault: "missing", target: position + "run.mjs", args: ["controls"] },
    { status: 1, rows: 0, preflight: true },
  ),
  ...[[], ["bad-mode"], ["controls", "extra"]].map((args, i) =>
    row(
      "B-OBS-GATE-invalid-" + i,
      { fault: "invalid", args },
      { status: 1, rows: 0 },
    ),
  ),
];
