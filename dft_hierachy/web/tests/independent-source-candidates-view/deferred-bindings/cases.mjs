export const cases = [
  {
    id: "D01",
    input: "ordinary ready commit before microtasks",
    expected:
      "commit stack zero public operations; original two tuples bound once after stack",
    basis: "DESIGN §6.18.1/3",
  },
  {
    id: "D02",
    input: "StrictMode ready commit before microtasks",
    expected:
      "replay leaves exactly one binding for each original tuple and no query/selection",
    basis: "DESIGN §6.18.1/3",
  },
  {
    id: "D03",
    input: "ready commit and immediate same-stack unmount",
    expected:
      "queued work invalidated; zero signing/commands/feedback and borrowed models live",
    basis: "DESIGN §6.18.3/5",
  },
  {
    id: "D04",
    input: "same-stack commits of two original model pairs",
    expected:
      "old pair zero signing; new pair original tuples once; neither pair disposed",
    basis: "DESIGN §6.18.1/3",
  },
  {
    id: "D05",
    input:
      "ready commit then host reload and pending commit before wire answer",
    expected:
      "old work discarded; pending zero rows; only new original page tuples signed after answer",
    basis: "DESIGN §6.18.3",
  },
  {
    id: "D06",
    input: "flushSync commit inside actual navigation notification",
    expected:
      "zero operations inside callback commit; new original page signed only after notification stack",
    basis: "DESIGN §6.18.1/3",
  },
];
