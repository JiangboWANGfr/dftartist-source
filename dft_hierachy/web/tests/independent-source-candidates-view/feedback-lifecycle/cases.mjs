export const cases = [
  {
    id: "T01",
    input:
      "original confirmation error E after real Selection commit; callback unmounts then throws X",
    expected:
      "one original frozen failure; committed selection retained; borrowed models alive; no boundary/global error/unhandled rejection/query/retry",
    basis: "DESIGN §6.18.1/3/5",
  },
  {
    id: "T02",
    input:
      "two prepared real model pairs; original callback synchronously swaps pair then throws X",
    expected:
      "old original failure once, old selection preserved; new pair gets no old failure/selection/boundary error; no global error/query/disposal",
    basis: "DESIGN §6.18.1/3/5",
  },
  {
    id: "T03",
    input:
      "same-stack auxiliary click action0 then action1, each throws after actual Selection commit",
    expected:
      "two original confirmations, only latest action1/error feedback once; final selection is second original commit; no re-sign/retry/query/global error",
    basis: "DESIGN §6.18.3/5; §6.5.4",
  },
];
