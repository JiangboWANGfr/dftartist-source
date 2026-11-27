export const cases = Object.freeze(
  [
    {
      id: "B35-A01",
      input: { event: "none", target: 0 },
      expected: { confirm: 0 },
      detail:
        "two displayed items each bind once to their original page/index; issuance call order is unspecified; mount performs no query or confirmation",
    },
    {
      id: "B35-A02",
      input: { event: "rerender-focus", target: 0 },
      expected: { confirm: 0 },
      detail:
        "same-state className rerender and ArrowDown change no bindings, query, or selection",
    },
    {
      id: "B35-A03",
      input: { event: "trusted-click", target: 1 },
      expected: { confirm: 1 },
      detail:
        "one primary click passes the previously issued original action and original Selection exactly once, never reissues",
    },
    {
      id: "B35-A04",
      input: { event: "assistive-click", target: 0 },
      expected: { confirm: 1 },
      detail:
        "click without pointerdown uses committed original action, never issues in event handler",
    },
    {
      id: "B35-A05",
      input: { event: "trusted-enter", target: 1 },
      expected: { confirm: 1 },
      detail:
        "Enter keydown confirms original action once and suppresses native extra activation",
    },
    {
      id: "B35-A06",
      input: { event: "trusted-space", target: 1 },
      expected: { confirm: 1 },
      detail:
        "Space keydown confirms original action once and suppresses native extra activation/scroll",
    },
    {
      id: "B35-A07",
      input: { event: "synthetic-unavailable-down", target: 0 },
      expected: { confirm: 0 },
      detail:
        "pointerdown before binding captures unavailable; after preparation its matching click cannot use newly issued action",
    },
    {
      id: "B35-A08",
      input: { event: "synthetic-cancel-then-AT", target: 0 },
      expected: { confirm: 1 },
      detail:
        "pointercancel discards unavailable capture; later click without paired pointerdown uses committed original action",
    },
  ].map((c) =>
    Object.freeze({
      ...c,
      input: Object.freeze(c.input),
      expected: Object.freeze({ ...c.expected, bindings: 2, extraQueries: 0 }),
      basis:
        "DESIGN §6.18.1/3/4; C32 accepted public call/return passthrough only",
    }),
  ),
);
