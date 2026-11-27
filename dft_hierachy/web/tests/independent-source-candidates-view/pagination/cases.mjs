const rows = [
  [
    "complete-next",
    "complete",
    true,
    "more",
    "complete+next enables one loadMore; original cursor and head retained.",
  ],
  [
    "complete-end",
    "complete",
    false,
    "blocked",
    "complete without next cannot call loadMore.",
  ],
  [
    "partial-next",
    "partial",
    true,
    "blocked",
    "partial with next cannot call loadMore; original next/reasons retained.",
  ],
  [
    "partial-end",
    "partial",
    false,
    "blocked",
    "partial without next cannot call loadMore, without false complete.",
  ],
  [
    "partial-next-reload",
    "partial",
    true,
    "reload",
    "partial+next allows one reloadCandidates from head; old partial page unchanged.",
  ],
  [
    "partial-end-reload",
    "partial",
    false,
    "reload",
    "partial without next allows one reloadCandidates from head.",
  ],
  [
    "complete-to-partial-next",
    "complete",
    true,
    "tail-next",
    "complete head appends partial+next once then disables more and preserves both pages.",
  ],
  [
    "complete-to-partial-end",
    "complete",
    true,
    "tail-end",
    "complete head appends partial without next then stops, preserving partial warning.",
  ],
];
export const cases = Object.freeze(
  rows.map(([id, status, next, action, expected]) => ({
    id: "B33-" + id,
    input: { status, next, action },
    expected,
    basis: "DESIGN §6.18.2/C-95 and §6.11.2",
  })),
);
