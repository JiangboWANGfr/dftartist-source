// Minimal production-triggered regression in the existing B47 gesture category.
// DESIGN 6.18.3, independent activation must use the current committed binding.
export const cases = Object.freeze(
  ["pair", "selection"].map((mode, index) =>
    Object.freeze({
      id: "B50-C100-0" + (index + 1),
      mode,
      outsideRelease: true,
      input:
        "old ready row primary down; same-position " +
        mode +
        " switch; original pointer up outside list without a paired click; current row independent no-down click",
      expected:
        "outside release confirms neither Selection; first independent activation confirms current original action to current Selection exactly once",
      basis: "DESIGN §6.18.1/3; production C-100",
    }),
  ),
);
