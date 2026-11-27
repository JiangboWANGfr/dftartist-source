// Same normative local-viewport guarantee, no product/C output-derived constants.
export const cases = [0.5, 1, 1.5].flatMap((scale) =>
  ["first", "new-data", "same-data"].map((phase) => ({
    id: "B-SV-scale-" + scale + "-" + phase,
    input: { scale, phase },
    expected:
      phase === "same-data"
        ? "keep user-owned local scroll with identical data; raw text/focus/Selection/ancestors unchanged"
        : "exact start enters the actual transformed source viewport in both axes; raw text/focus/Selection/ancestors unchanged",
    basis:
      "DESIGN §6.14.2/.4: measurable source viewport; initial/new-data vs identical-data rules",
  })),
);
