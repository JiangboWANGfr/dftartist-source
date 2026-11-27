# B37 pointerdown across rebind subset

Oracle: DESIGN §6.18.3/5 and §6.17, not implementation or A/C probe output.
The corrected six cases explicitly observe removal of the original row during an ordinary pending reload, suppress the old primary synthetic mouse/pen/touch paired click after a value-equal new row appears, accept a new independent AT-shaped click, and retain the original captured action across same-chain append.
The host withholds the normal wire reply until pending plus an actual empty DOM list has been observed. It never fakes NavigationState or candidate UI. The same-Reply SDK adapter is used only in real L6 premises, not to claim uninterrupted DOM-row presence.
Initial 08b53c2 incorrectly assumed same Reply implies continuous row presence and required failure-field enumerability; the normative facility correction and its separately frozen two-case red/green are documented in M5-b37-oracle-preconditions.md. Original source/receipts are preserved, not accepted as final oracle.
Only host transition Promises are host-consumed; no new then/catch/engine observation and no Q1 closure.

Rows are identified by original page/itemIndex, not React keys/private event props or physical DOM node identity.
The append case permits retaining or reissuing existing-row bindings: it constrains the paired click's original captured action, not an unspecified temporal signing order.
Synthetic PointerEvents run in a real browser but are not trusted OS/device input or mobile/pen platform E2E. The separate plain-button trusted mouse premise is not candidate UI.
No saved React handler extraction or abandoned-render/notification-stack claim. The continuously retained-row/new-generation stale_action DOM branch remains uncovered; only the explicitly removed-row suppression branch is frozen here.

```sh
HIER_B_PRODUCT_ROOT=<fixed> node --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-rebind/facility.test.mjs
node --test --test-reporter=tap web/tests/independent-source-candidates-view/pointer-rebind/contract-facility.test.mjs
HIER_B_PRODUCT_ROOT=<fixed> HIER_B_BROWSER_TOOLS=<fixed>/web node web/tests/independent-source-candidates-view/pointer-rebind/run.mjs --controls
HIER_B_PRODUCT_ROOT=<fixed> HIER_B_BROWSER_TOOLS=<fixed>/web node web/tests/independent-source-candidates-view/pointer-rebind/run.mjs
```

Absent component/CSS is one explicit nonzero capability gate: planned6/executed0/passed0/blocked6/skip0, never six passes.
Old78 DOM/30 historical types/helper/archives/pins remain unchanged; cumulative84 planned DOM remains partial.
Q1 actual original-Promise consumption, other closure/render/read-order/lifecycle/focus/scroll/package/Core UI/Electron gaps remain open.
No production/API/ABI/IPC/Schema/protocol2/schema7/dependency/config/file-format change; no persistence/migration.
