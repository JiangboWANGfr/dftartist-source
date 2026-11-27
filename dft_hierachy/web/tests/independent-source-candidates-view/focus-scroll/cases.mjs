export const cases = [
  {
    id: "F01",
    input: "native Tab/End/out/reentry with legacy last row",
    expected:
      "first list entry first row; legacy focusable; reentry remembers logical last row; no selection",
    basis: "DESIGN §6.18.4",
  },
  {
    id: "F02",
    input:
      "nonzero scroll and original focused tuple through host append and ordinary rerender",
    expected:
      "logical focus and unclipped user scroll preserved; no extra operation",
    basis: "DESIGN §6.18.3/4",
  },
  {
    id: "F03",
    input:
      "focused original row removed by reload; pending zero rows then one new item",
    expected:
      "current list container keeps focus, not new item; ArrowDown enters unique current row",
    basis: "DESIGN §6.18.4",
  },
  {
    id: "F04",
    input:
      "external sentinel focus through append and prepared model pair switch",
    expected:
      "no focus steal/selection; fresh session first entry uses first logical row",
    basis: "DESIGN §6.18.1/4",
  },
  {
    id: "F05",
    input:
      "forty legal hits, clipped distant row, trusted repeated ArrowDown with nested scroll margins",
    expected:
      "target visible and only candidate list scrolls; SourceView/parent/page unchanged; no confirm",
    basis: "DESIGN §6.18.4",
  },
  {
    id: "F06",
    input:
      "two instances with legacy rows and independent focus/scroll memories",
    expected:
      "first instance navigation leaves second scroll/roving unchanged; DOM IDs/IDREF stay local; nonempty explanation",
    basis: "DESIGN §6.18.4",
  },
];
