export const cases = Object.freeze(
  [
    {
      id: "B34-R01",
      input: "inherited go, configurable observer wrapper",
      expected:
        "dispose removes added own wrapper and exposes original inherited function without error",
    },
    {
      id: "B34-R02",
      input: "own go with writable=false and enumerable=true",
      expected:
        "dispose restores original complete own descriptor without error",
    },
    {
      id: "B34-R03",
      input:
        "inherited go wrapper locked configurable=false,writable=false; later restore follows",
      expected:
        "one diagnostic failure, inherited wrapper cannot be silently reported restored; later method still restored",
    },
    {
      id: "B34-R04",
      input:
        "inherited go wrapper locked configurable=false,writable=true; later restore follows",
      expected:
        "one diagnostic failure despite writable value; original inherited ownership cannot be restored; later restored",
    },
    {
      id: "B34-R05",
      input: "two inherited observed methods made non-configurable",
      expected: "both restoration failures reported, neither silently ignored",
    },
    {
      id: "B34-R06",
      input: "own go wrapper locked, other own method restoration follows",
      expected:
        "own definition restoration failure reported and subsequent restoration attempted",
    },
    {
      id: "B34-R07",
      input:
        "inherited go delete trap throws arbitrary original token, later method follows",
      expected:
        "original restoration throw retained by identity, later method still restored",
    },
    {
      id: "B34-R08",
      input:
        "inherited configurable wrapper then Object.preventExtensions(target)",
      expected:
        "deletion remains legal; original inherited function/ownership restored without error",
    },
    {
      id: "B34-R09",
      input:
        "later getter throws original token after two configurable inherited wrappers were installed",
      expected:
        "setup rethrows original token by identity and restores both inherited methods",
    },
    {
      id: "B34-R10",
      input:
        "later getter locks go then throws original Symbol; another restoration must follow go",
      expected:
        "setup aggregates original token first and one restoration failure; other inherited method restored",
    },
    {
      id: "B34-R11",
      input: "later getter locks two inherited wrappers then throws null",
      expected:
        "setup aggregates original null first and both restoration failures; neither silently ignored",
    },
  ].map((c) =>
    Object.freeze({
      ...c,
      basis:
        "B33 README/plan: original descriptor/ownership restoration; report failure and continue cleanup",
    }),
  ),
);
