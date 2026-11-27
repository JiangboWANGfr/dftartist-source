// Independent oracle: DESIGN 6.18.3 and 6.17 generation semantics, never implementation-derived.
export const cases = Object.freeze(
  [
    {
      id: "B37-P01",
      input: {
        pointerType: "mouse",
        transition: "reload-removed",
        activation: "paired-click",
      },
      expected: { confirm: 0, stale: false, action: "none" },
      detail:
        "primary synthetic mouse down; old row is observed removed during reload; paired click cannot confirm a value-equal new row",
      basis: "DESIGN §6.18.3/5; §6.17.2/3",
    },
    {
      id: "B37-P02",
      input: {
        pointerType: "pen",
        transition: "reload-removed",
        activation: "paired-click",
      },
      expected: { confirm: 0, stale: false, action: "none" },
      detail:
        "primary synthetic pen paired click is suppressed after observed old-row removal; not pen-device E2E",
      basis: "DESIGN §6.18.3/5; §6.17.2/3",
    },
    {
      id: "B37-P03",
      input: {
        pointerType: "touch",
        transition: "reload-removed",
        activation: "paired-click",
      },
      expected: { confirm: 0, stale: false, action: "none" },
      detail:
        "primary synthetic touch paired click is suppressed after observed old-row removal; not touch-device E2E",
      basis: "DESIGN §6.18.3/5; §6.17.2/3",
    },
    {
      id: "B37-P04",
      input: {
        pointerType: "mouse",
        transition: "reload-removed",
        activation: "cancel-then-AT",
      },
      expected: { confirm: 1, stale: false, action: "current" },
      detail:
        "pointercancel discards old capture; independent AT-shaped click uses current committed action",
      basis: "DESIGN §6.18.3",
    },
    {
      id: "B37-P05",
      input: {
        pointerType: "mouse",
        transition: "reload-removed",
        activation: "AT-only",
      },
      expected: { confirm: 1, stale: false, action: "current" },
      detail:
        "no paired down: independent AT-shaped click after ordinary reload uses the new original action",
      basis: "DESIGN §6.18.3; §6.17.2",
    },
    {
      id: "B37-P06",
      input: {
        pointerType: "mouse",
        transition: "append",
        activation: "paired-click",
      },
      expected: { confirm: 1, stale: false, action: "captured-old" },
      detail:
        "same-chain append retains the old captured action; new binding must not replace it",
      basis: "DESIGN §6.18.3; §6.17.2",
    },
  ].map((c) =>
    Object.freeze({
      ...c,
      input: Object.freeze(c.input),
      expected: Object.freeze(c.expected),
    }),
  ),
);
