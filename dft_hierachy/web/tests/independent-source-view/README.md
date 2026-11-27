# B SourceView independent freeze

Normative DESIGN§6.14, fixed df14ae6b931bf1f9f27345a5df86723bb8a0546d.
No A consumer examples/negative tests/implementation/selftests used to generate expectations.
See docs/plans/B-source-view-freeze.md. The two B-SOURCEVIEW-Q1/Q2 branches remain unresolved and outside the runtime oracle.
The compile-time explicit-undefined rejection follows exactOptionalPropertyTypes only; it does not decide Q1 runtime behavior.

`cases.mjs` gives every DOM case input/expected/basis. 89 planned browser cases; 28 independent type negatives;
package.mjs has6 actual outside-tarball checks. Inventory/fixture controls count separately.
No component surrogate; --self-check mounts only the explicitly named B native React/DOM probe, never SourceView.
Before production exists, browser/type/package capability failures are red with semantic executed0/blocked counts, not N fake failures/skips.
The state is a legal public L6 union, not a new source DTO; raw text/byte positions come from literal B inputs, never observed UI.
No arbitrary bad-state validation, exact getter counts, CSS class selectors, private IDs, message punctuation or scroll algorithm expectations.

## Commands

N is supported Node24; B is this test checkout, P is an independent fixed product checkout.
T is the readonly installed tool package `web/tests/independent-tree-view/c76/browser`.
It must have React/ReactDOM18.3.1, types18.3.26, Playwright1.64.1, esbuild0.25.11 and its browser installed.
Reuse of test tools is not reuse of another agent's product binaries; P packages are freshly built.

```sh
npm --prefix "$P/web" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$P/web" run check
export HIER_B_PRODUCT_ROOT="$P" HIER_B_BROWSER_TOOLS="$T"
node web/tests/independent-source-view/run.mjs --list
node --test web/tests/independent-source-view/inventory.test.mjs
node web/tests/independent-source-view/verify-types.mjs proposal
node web/tests/independent-source-view/verify-types.mjs production
node web/tests/independent-source-view/run.mjs --self-check
node web/tests/independent-source-view/run.mjs
node web/tests/independent-source-view/package.mjs
```

Use actual absolute N, P, T argv/PATH in evidence. Browser automation fallback is the repo's existing Playwright toolchain:
the available browser skill was read, but four discovery searches exposed no node_repl js tool.
These are real Chromium tests; not Electron/main/preload/Core IPC or a full-browser assistive-technology certification.

The browser host only imports P's production exports and public state types; visual CSS uses the advertised CSS export.
One extra no-CSS case verifies built-in text/layout, not complete visual styling.
Keyboard scroll waits for real DOM changes, not sleeps or a product timing SLA.
Observer/timer probes are limited to a synchronous component commit after React root creation; no global Promise instrumentation.
Package consumer uses actual tarballs/install/strict declarations/CSS/browser, not monorepo aliases.
Its filesystem/npm/browser/server writes are only owned temporary test artifacts and are removed in finally.
Node npm pack/install has a30-second facility timeout, not a product latency budget.
Expected TypeErrors may produce React development error events; they are bounded to invalid-props cases, not globally suppressed.
Failures retain primary errors and separately record cleanup errors. Resource callbacks run on failed cases too.
Two pending Q branches require normative clarification and B follow-up before claiming the entire contract frozen.
