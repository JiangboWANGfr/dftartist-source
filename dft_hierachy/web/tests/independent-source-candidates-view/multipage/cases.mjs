export const cases = Object.freeze(
  [
    {
      id: "B36-M01",
      input: { event: "none", row: 0 },
      expected: { confirm: 0 },
      detail:
        "two pages of two value-equal hits remain four displayed rows; bind each original page/item index once, no query or selection",
    },
    {
      id: "B36-M02",
      input: { event: "trusted-click", row: 2 },
      expected: { confirm: 1 },
      detail:
        "third visible row confirms original second-page index0 action, not flattened index2 or first-page duplicate",
    },
    {
      id: "B36-M03",
      input: { event: "assistive-click", row: 3 },
      expected: { confirm: 1 },
      detail:
        "fourth visible row AT-shaped click confirms original second-page index1 action, not flattened index3 or ref-based replacement",
    },
    {
      id: "B36-M04",
      input: { event: "trusted-enter", row: 0 },
      expected: { confirm: 1 },
      detail:
        "first duplicate row Enter confirms its own original first-page index0 action at keydown, once after keyup",
    },
    {
      id: "B36-M05",
      input: { event: "trusted-space", row: 1 },
      expected: { confirm: 1 },
      detail:
        "second duplicate row Space confirms its own original first-page index1 action at keydown, prevents native extra activation/scroll",
    },
    {
      id: "B36-M06",
      input: { event: "rerender-cross-page-focus", row: 1 },
      expected: { confirm: 0 },
      detail:
        "same-state rerender and ArrowDown from first-page last row to second-page first row preserve bindings and semantic selection",
    },
  ].map((c) =>
    Object.freeze({
      ...c,
      input: Object.freeze({
        ...c.input,
        pages: 2,
        itemsPerPage: 2,
        allHitValuesEqual: true,
      }),
      expected: Object.freeze({
        ...c.expected,
        rows: 4,
        bindings: 4,
        extraQueries: 0,
      }),
      basis:
        "DESIGN §6.18.1/2/3/4, §6.17 original action page/itemIndex; accepted public-call passthrough only",
    }),
  ),
);
