# B36 multipage original action subset

Oracle: DESIGN §6.18.1–4 and §6.17 original page/itemIndex actions, not A implementation/probes/selftests.
Six cases in cases.mjs define inputs, expected results and basis. Two legal complete pages contain four value-equal hits before mount.
No deduplication, flat-index substitution, cloned page or equal-ref action may replace a displayed occurrence's original tuple/action.
Display follows page/item order; signing call temporal order is deliberately unspecified.

```sh
HIER_B_PRODUCT_ROOT=<fixed> node --test --test-reporter=tap web/tests/independent-source-candidates-view/multipage/facility.test.mjs
HIER_B_PRODUCT_ROOT=<fixed> HIER_B_BROWSER_TOOLS=<fixed>/web node web/tests/independent-source-candidates-view/multipage/run.mjs --controls
HIER_B_PRODUCT_ROOT=<fixed> HIER_B_BROWSER_TOOLS=<fixed>/web node web/tests/independent-source-candidates-view/multipage/run.mjs
```

Real SDK/Navigation/Selection and old B legal Transport/call observer only, no substitute candidate component or state DTO.
Host-owned preloading Promises are consumed by host fixture, never counted as UI consumption. Observer does not consume/replace returned Promise.
Missing component/CSS is one nonzero capability gate: planned6, executed/passed0, blocked6, skip0, not six semantic failures/passes.
Node/pure negatives and browser model/native controls are facilities, not candidate UI or Core/Electron E2E.
Keyboard checks run after down dispatch before up and then check no extra activation after up; DOM watchdog is fixture-only, not product timeout.
Old72 DOM/30 types/helper/archives remain byte-for-byte. New six make 78 planned DOM, still partial, not full implementation release.
Q1 actual original-Promise consumption, stale pointer/closure/rebind/same-Reply generations, notification/abandoned-render timing,
complete lifecycle/scroll/tarball/native platforms/real Core UI remain separate gaps. No persistence or production ABI/API/IPC/Schema/dependency change.
