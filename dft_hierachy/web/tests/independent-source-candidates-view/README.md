# B32 partial independent candidate-view freeze

Normative input: fixed e254689 DESIGN §6.18 (SHA in evidence). No A implementation or A type test is an oracle.
Run with explicit HIER_B_PRODUCT_ROOT and HIER_B_BROWSER_TOOLS, both fixed and independently writable/read-only as appropriate.

```sh
node web/tests/independent-source-candidates-view/run.mjs --list
node web/tests/independent-source-candidates-view/verify-types.mjs --proposal
node web/tests/independent-source-candidates-view/verify-types.mjs
node web/tests/independent-source-candidates-view/run.mjs --controls
node web/tests/independent-source-candidates-view/run.mjs
node --test web/tests/independent-source-candidates-view/facility.test.mjs
```

Every list item has input, expected result and normative basis. A missing component produces a nonzero capability gate,
executed=0/passed=0/blocked=planned/skip=0. It is not every semantic assertion failing or passing.
Controls do not mount a substitute candidate component. Production React/SDK/models and the old SourceView are real.

This is deliberately **not all of §6.18**. Full pending items and C observation question are in
docs/plans/M5-source-candidates-view-b32-freeze.md. No strong original-Promise claim, internal exact-call-count claim,
tarball/peer compatibility claim, real Core/Electron IPC or native platform/resource claim follows from this freeze.
Old fixtures and baselines remain unchanged. Fixture watchdogs are not product timeouts.
