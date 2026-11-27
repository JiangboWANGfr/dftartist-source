# M5 tree UI comparison

Bounded research prototype for M5-A-02b-01. This package is outside the production
workspaces. It imports the real SDK and viewmodels through the parent workspace;
its public controlled Transport supplies deterministic fixtures. It is not an
Electron demo, Core simulator, production view, or independent B acceptance.

From the repository root, with the supported Node version:

```sh
npm --prefix web ci
npm --prefix web/experiments/m5-tree-ui ci
cd web/experiments/m5-tree-ui
npx --no-install playwright install chromium
npm test
npm run serve
```

Open `http://127.0.0.1:4173/?mode=virtual` or `?mode=arborist`. `npm test` builds
and runs twelve browser scenarios, closes its ephemeral HTTP server/browser,
and writes `dist/evidence/results.json` and screenshots. The manual server serves
the last build. Set `UI_EVIDENCE_DIR` to retain evidence outside ignored `dist`.

Both routes instantiate the same production `HierClient`, `TreeModel` and
`SelectionModel` classes with fresh identical fixtures. No B test is modified.
The only difference is the renderer. The host owns external selection → reveal,
fixture controls and session disposal. Views borrow the models; a view unmount
does not cancel host tasks. `window.lab` is an experiment-only browser driver.

- Small fixture: six children in three pages, two generate levels, a child branch,
  external port selection, failure/cancel/late replies and model replacement.
- Wide fixture: 5,000 children in five pages; inspect first/second/final page and End.
- Deep fixture: 120 child levels, then collapse. No unbounded-depth claim.
- Metrics count observed committed instance IDs (this experiment never reloads an
  existing model), visible model rows, actual row DOM, projection input visits,
  ARIA metadata input visits, and Arborist public accessor invocations. These are
  partial work counters, not total instructions, memory use, or M7 timing budgets.

React 18.3.1 is a fixed compatible baseline. Arborist 3.16.0 matches D's exact
reference commit; this experiment does not evaluate later Arborist 4.x. Reference
reuse and limitations are recorded in [the report](../../../docs/M5_TREE_UI_COMPARISON.md).
The normative next-step proposal is DESIGN §6.7. The experiment does not implement
all of that proposal (StrictMode, generic props, error callbacks, full focus/ARIA
semantics and accessibility testing remain production acceptance work).

Compile the proposed interface and its nine expected type errors separately:

```sh
cd ../..
node node_modules/typescript/bin/tsc -p contracts/tsconfig.tree-view.json
```
