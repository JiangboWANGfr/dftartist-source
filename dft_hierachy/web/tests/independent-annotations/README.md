# B90 finite annotation freeze

Oracle: C89-accepted DESIGN §6.31, handwritten `cases.mjs`, public signatures and old B inputs.
Not A implementation/consumer/self-test. See `docs/plans/B-M6-annotation-validation.md` for scope.

22 model cases, 10 actual React tree/graph cases and 20 strict negative type witnesses, plus one
old-model native-ELK input control. `HIER_B_PRODUCT_ROOT` must name the fixed product tree with
built package declarations/runtime; `HIER_B_BROWSER_TOOLS` optionally selects its web tools.
Run `runtime.test.mjs` with `node --test`, and `types.mjs`/`run.mjs` with Node24.
`types.mjs --proposal` checks only the accepted isolated declaration; production never falls back.
`run.mjs --controls` omits annotation use and verifies the original TreeModel/GraphSession/Layout
and real components/Worker with these inputs. Browser finally releases roots/models/client/Worker.

Missing exports are capability failures, not executed semantic failures; missing UI blocks 10,
does not skip them. No mock annotation runtime, new dependencies, selectors tied to new CSS classes,
generic observation/heap facility, trusted-device, full Core/IPC/Electron E2E or cross-platform claim.
Finite public API tests cannot reach MAX_SAFE_INTEGER from revision0; its declared error is typed,
but runtime exhaustion remains unexecuted without an accepted private entry. Old regressions and
history remain unchanged. First commit freezes; subsequent plan append records actual baseline.
