# B independent tree UI collection

Approved oracle: DESIGN §6.7 at b753daa6222ba942d900d38368dde67730dbde26.
This extends the unchanged C-76 24-case freeze with **114 general cases and 2 real-Core UI cases**:
140 executable cases total. These counts are input partitions, not production passes.
All case inputs, expected outcomes and basis are emitted by `--list`.

Current production lacks HierarchyTree: the default run must fail the export capability gate
with **0 semantic cases executed / 0 skipped**. Neither self-check renders a fake tree.
No prototype, A self-test, C probe or private product hook is imported.

## Commands

Run at this test checkout's root, with Node 24 and B's own fixed product:

```sh
export HIER_B_PRODUCT_ROOT=/absolute/path/to/B/fixed/source
export HIER_BIN="$HIER_B_PRODUCT_ROOT/core/build/hier"
export HIER_B_REACT_TYPES="$PWD/web/tests/independent-tree-view/c76/browser/node_modules/@types/react/index.d.ts"

# Existing isolated C76 toolchain, unchanged lock; use an already installed matching Chromium.
npm --prefix web/tests/independent-tree-view/c76/browser ci --offline --ignore-scripts --no-audit --no-fund --workspaces=false
node web/tests/independent-tree-view/ui/run.mjs --list
node web/tests/independent-tree-view/ui/run.mjs --self-check
node web/tests/independent-tree-view/ui/run.mjs --core-self-check
node web/tests/independent-tree-view/ui/verify-coverage.mjs
node --unhandled-rejections=throw --test --test-reporter=tap web/tests/independent-tree-view/ui/c77-observation-boundaries.test.mjs
node web/tests/independent-tree-view/ui/run.mjs

# On actual component delivery, B supplies a pure locator module based on observed DOM:
HIER_B_EXPANSION_ADAPTER=/absolute/B/observed-expansion-locator.mjs node web/tests/independent-tree-view/ui/run.mjs

node web/tests/independent-tree-view/c76/verify-revised-types.mjs
node web/tests/independent-tree-view/verify-tree-view-types.mjs production
node web/tests/independent-tree-view/production-capability.mjs
node --unhandled-rejections=throw --test --test-reporter=tap web/tests/independent-tree-view/public-model-boundaries.test.mjs
```

The old C76 runner/fixture/consumer/report stay byte-identical. The new runner concatenates
that B-owned fixture, read-only, with fixture-overlay.jsx into an ephemeral in-memory bundle.
The overlay only extends B's host controls and public Transport; it never edits product source,
private fields, internal scheduling or a model's committed state.
Public methods delegate and preserve the original return/throw identity. Subscription wrappers
delegate original registration/unsubscribe, recording live consumer counts and notification depth.
Host exception listeners do not preventDefault or suppress unhandled rejections.

Props, model-binding, selection and keyboard tests use real React, TreeModel, SelectionModel
and HierClient. Fixtures supply lawful public protocol replies (except explicit error/partial/
inconsistent-page tests). Row expectations come from published rows/order/depth, not a guessed
DOM naming scheme. Small fixtures fit the viewport; wide/deep cases assert a derived window bound
and use published role/label/geometry. Browser and frame watchdogs are not performance budgets;
settlement uses public state/microtask/animation-frame observations, not fixed sleeps.

The host derives scroll containers from observed DOM layout/overflow, without freezing CSS class
names. C-79 removes the unapproved button/role=button shape/count requirement. B's explicit
locator module exports `locateExpansionTarget({page,row,rowId})` returning `{target,clickOptions?}`.
It only locates the actual expansion click region: no model commands, private hooks or substitute
component. Targets are unique and within their source row (the row itself with a pointer position
is allowed). No product tag/role/class/data attribute is prescribed. Missing configuration is a
test prerequisite failure, not a semantic product failure or skip; the production export gate
runs first. No keyboard action substitutes for the explicit-click test. Configuration is cleared
on cleanup. Locator contrasts do not prove production UI/ARIA compliance.

## Scope and evidence boundaries

- `--self-check`: real React StrictMode/native click; lawful mixed/5001-root/depth120/empty/
  long-prefix model fixtures, pagination/retry/reveal, original observer poison, subscriber controls,
  independent SDK waiter cancellation, empty reload and cleanup. **No production tree mounted.**
- `--core-self-check`: browser real SDK/L6 through B-only loopback HTTP bridge to the actual NDJSON
  Core, original hand-written SV KAT, deep port owner reveal, two fresh snapshots and clean process
  exits. **No production tree mounted, not Electron IPC.**
- Default: only real production @hier/views. On delivery, runs all 140 cases, including two genuine
  UI/Core cases and Chromium CDP accessibility-tree assertions. Missing HIER_BIN is an error,
  never an automatic skip. Browser/Core/server cleanup runs even on failure.
- The HTTP bridge is a test fixture, not an application IPC adapter or production proposal. It
  serializes safe KAT frames; it does not test raw numeric evidence surviving structured clone,
  Electron origin isolation, production transport backpressure or M7 memory/performance.
- AX checks are separate from DOM checks. Actual assistive technology steps are frozen in
  [assistive-technology.md](assistive-technology.md), not executed or claimed compliant.
- [coverage.json](coverage.json) maps all 95 acceptance conditions: 89 have browser-case associations,
  6 are type/regression/manual/future-Electron gates. Mapping is not a coverage-percentage claim.
  L02's direct primitive/Proxy rejection is **not** represented by a nested AggregateError;
  [command-error-adapter.md](command-error-adapter.md) records the unapproved fault-adapter gap.
- C-77: [independent negative controls](c77-observation.md) confirm global zero-unhandled does not
  prove view-owned rejection handling. C76-13 still covers late-feedback suppression; registration/
  consumption remains unverified. This is not a complete 95-condition sign-off.
- During this turn C approved §6.8 Electron; its independent freeze is a separate next unit,
  not delivered here. No persistence/migration or plan-edit undo/redo is invented.
  Selection navigation history is tested. No old B oracle is weakened to make the baseline green.

See [new matrix](../../../../docs/M5_B_TREE_VIEW_ACCEPTANCE_FULL.md),
[plan](../../../../docs/plans/B-M5-tree-view-full.md) and the later independent result report.
