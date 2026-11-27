export const cases = Object.freeze(
  [
    {
      id: "B47-G01",
      mode: "pair",
      input:
        "primary down on original ready row; same View position commits another prepared real Navigation/Selection pair; matching up/click; then independent AT click",
      expected:
        "paired click confirms neither pair; independent AT click confirms current original action to new Selection once",
      basis: "DESIGN §6.18.1/3/5",
    },
    {
      id: "B47-G02",
      mode: "selection",
      input:
        "same Navigation/state/page; primary down then only matching-snapshot real Selection identity replaced and committed; matching up/click; then independent AT click",
      expected:
        "paired click confirms neither Selection even though old action remains L6-valid; independent AT uses current binding to new Selection once",
      basis: "DESIGN §6.18.1/3; §6.17.2/3",
    },
  ].map(Object.freeze),
);
