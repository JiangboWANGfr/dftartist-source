export const cases = [
  {
    id: "S01",
    input:
      "AT-shaped click; real Selection listener throws after commit; onCommandError throws original X",
    expected:
      "one original confirm error E; shallow-frozen failure identities; boundary AggregateError.errors exactly [E,X]; committed selection preserved, no retry/query",
    basis: "DESIGN §6.18.3/5; §6.5.4",
  },
  {
    id: "S02",
    input:
      "same DOM click stack throws E; immediate flushSync onCommandError replacement, no await",
    expected:
      "old late feedback goes to neither callback; callback identity change preserves focus/actions/model/committed selection; no re-sign/retry/query",
    basis: "DESIGN §6.18.1/3/5",
  },
];
