export const cases = [
  {
    id: "U01",
    input:
      "real ready primary renders before a trailing host Suspense gate; only fallback commits; unmount before gate release",
    expected:
      "zero uncommitted signing/commands/feedback/selection/query; release host gate after unmount cannot resurrect work; subscribe-call count diagnostic only",
    basis: "DESIGN §6.18.1/3/5",
  },
  {
    id: "U02",
    input:
      "two real model pairs ready before rendering; suspended uncommitted old primary replaced by committed new pair; release old gate afterward",
    expected:
      "old pair stays untouched; only committed new original page/index tuples bind once; no old feedback or borrowed resource disposal",
    basis: "DESIGN §6.18.1/3/5",
  },
  {
    id: "U03",
    input:
      "same original ready model/state/page in uncommitted primary; open gate and explicitly flushSync-retry first commit in the SAME host stack",
    expected:
      "zero operations before or inside first commit stack; only one original binding batch after stack; no query/confirmation/selection",
    basis: "DESIGN §6.18.1/3",
  },
];
