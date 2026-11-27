# B87 finite schematic freeze

Independent inputs and expected behavior: DESIGN §6.30.1–.5, accepted by C86.
No A consumer, renderer, self-test or six comparison cases are the oracle.

Run from B's tree with Node24; `HIER_B_PRODUCT_ROOT` is an absolute fixed product
worktree whose web dependencies and declarations were built independently:

```sh
node --test web/tests/independent-schematic-view/runtime.test.mjs
node web/tests/independent-schematic-view/types.mjs --proposal
node web/tests/independent-schematic-view/types.mjs
node web/tests/independent-schematic-view/run.mjs --controls
node web/tests/independent-schematic-view/run.mjs
```

`HIER_B_BROWSER_TOOLS` optionally names that product's web directory. Existing
esbuild/React/Playwright/context helpers are reused without modifying old tests.
M01–M12 are public model assertions; T01–T20 strict negative type diagnostics plus
a positive consumer; U01–U16 use the real component and existing public models.
`cases.mjs` and test bodies give inputs, expected values and normative sections.
Missing capabilities are real failures/blocked semantics, never skipped or filled
by proposal runtime, fake view or alternate model. Proposal typing is separate.

The browser control only proves legal handwritten DTO → actual GraphSession /
SelectionModel / LayoutService → native ELK input and cleanup. It does not call
or replace missing projection/view functions and is not component acceptance.
Node M12 reuses B83's message gate (not an ELK algorithm); browser command cases
use native Worker URLs, actual crash/stall and host cancellation/retry.

The original context owns one unused existing InstancePropertiesModel solely to
reuse its accepted ready-client/SelectionModel cleanup scope; it issues no query.
New graph/layout resources are registered immediately and released before that
scope. Only normal public methods/subscriptions and native Worker factories are
observed. No private hooks, general heap/Q1 observers or new evidence platform.

No Core query, Electron, package-external tarball distribution, collapsed boundary
rerouting, annotation, pan/zoom, screen-reader or cross-platform result is claimed.
Those remain later M6 work; original source/layout/M5 freezes and failures remain.
Unspecified implementation details (exact UI wording, CSS class names, ELK pixel
ordering, global performance) are not normative. Native command wording accepts
layout/布局, retry/重试, cancel/取消, not an exact sentence. A different accessible
name construction should be accommodated without changing the required full ID.
