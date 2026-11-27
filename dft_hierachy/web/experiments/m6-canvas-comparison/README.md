# M6 canvas comparison

Isolated M6-A-03 experiment. Two real browser entries consume the **same production**
GraphSession, SelectionModel and LayoutService, with the original native ELK Worker.
Input is a handwritten DTO (five nodes, five edges), **not a Core query**. This is
A's comparison, not B's frozen oracle or a published SchematicView API.

## Run

Use the repository's supported Node version (recorded run: 24.21.0).
From `web`, first `npm ci && npm run typecheck` to build the public workspace packages.
Then in this directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run serve
# http://127.0.0.1:4176/react.html
# http://127.0.0.1:4176/sprotty.html
UI_EVIDENCE_DIR=/absolute/new/evidence-directory npm test
```

Playwright Chromium must already be installed (`npx playwright install chromium`
when needed). The local server serves only fixed experiment assets, with same-origin
script/Worker CSP. No API request or external application is accessed.
`results/` and `dist/` are ignored. Reports contain browser/machine/viewport,
versions, input/lock/bundle hashes, DOM counts, command settlements, timings,
owned Worker/subscription counts, errors and every repeated result.

## What the two implementations actually reuse

- `controller.mjs`: ready public HierClient over a controlled Transport; real
  GraphSession sources A, B, trace; one shared SelectionModel/history; real
  LayoutService with fresh native Workers. Owns all subscriptions and disposal.
- `projection.mjs`: common geometry input and display-only reverse mapping. Each
  bit-segment parallel edge gets a distinct display port. No Core inference.
- `react.jsx`: ReactDOM root/flushSync and SVG; project writes views, hit handlers,
  focusable SVG controls and Enter/Space activation.
- `sprotty.mjs`: real SGraphImpl/SNodeImpl/SEdgeImpl, LocalModelSource, ModelViewer,
  snabbdom rendering, DOM/model mouse hit lookup, ActionDispatcher and KeyTool.
  Project writes geometry/model conversion, views and selection action bridge.
  Built-in mutable selection/move/edit features are disabled; undoHistoryLimit=0.
  No Sprotty selection command can bypass the shared authority. Built-in viewport,
  routing and editing features are not evaluated as user capabilities here.
- `shell.mjs`: identical buttons/inspector/status/viewport and remount host.
- `browser-test.mjs`: same sequence, two routes, three fresh browser contexts each;
  actual pointer/keyboard input, screenshots, structural assertions. Each case is
  an A experiment, not a new independent test category. Browser/server close in
  finally, including failures.

## Recorded limitations — keep these visible

The comparison **exits 1** when any route fails lifecycle checks. In the recorded
run, both routes pass the six functional scenario groups on all three repeats;
React also passes the finite lifecycle check. Sprotty 1.4.0 retains four anonymous
window resize listeners after initial mount plus three remounts. Container unbinding
and emptying the model do not remove these listeners. The native resize event after
close produced no additional page error in that run; retained registrations still
fail the lifecycle check. The instrumentation observes only window resize registrations
and project-owned resources, not general heap reachability. Page/context close
reclaims the isolated experiment. Do not present this as whole-view cleanup success.

Waiting for the framework's canvas-bounds animation frames before container unbinding
fixes the initial late-command teardown error. Vendor code is not patched; the global
resize gap remains. Choosing Sprotty for production needs an explicit lifecycle design
(or a verified upstream change), not a silent window-method interception workaround.

Folding is an experiment projection over the flat production layout: bus paths retain
all fact/bit records; the explicit stage group retains both nodes and its internal edge.
Expanding restores exact geometry and the shared selection. It does **not** lay out
collapsed boundary ports or reroute incident edges. The enclosing stage box can overlap
unrelated geometry. This is evidence for the next projection contract, not production
hierarchy/bus folding acceptance.

L1 uses a real stalled Worker and is invalidated/terminated when the graph revision
changes; L2 uses real ELK. A withdrawn source's delayed loader is actually resolved
and cannot resurrect members. This run does not inject a layout message after native
Worker termination or prove every adversarial late-message schedule. Existing B service
coverage remains separate. No source navigation, package-external distribution,
Electron, screen-reader, cross-platform or large-design result is claimed.

Labels, focusable roles and Enter/Space are project code in both routes. Full graph
keyboard navigation, focus restoration across removed groups, pan/zoom interaction,
selection rectangles, label placement, edge routing after collapse, and accessible
reading order remain implementation work. DOM/package bytes and tiny-graph timings
are descriptive, not a general performance or maintenance ranking.

## Versions, references and licensing

Actual package pins and transitive integrities are in `package-lock.json`.
Sprotty/sprotty-protocol 1.4.0 declare
`(EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0)` and gitHead
`10f2a54cd3021aafa26926639b876af35e2da09c`; published source files carry the SPDX
and copyright headers. React/ReactDOM 18.3.1, Inversify 6.2.2 and snabbdom 3.5.1:
MIT; reflect-metadata 0.2.2 and Playwright 1.64.1: Apache-2.0; esbuild 0.25.11: MIT.
The unchanged production elkjs 0.12.0 Worker and its complete LICENSE.md are copied
by build. `dist/build.json` records actual installed package declarations and output
hashes. Registry mirror origins are retained in the lock, not described as a new
verification against the official registry. This local experiment does not establish
legal clearance for commercial redistribution.

Read-only reference: `ref/sprotty` at
`21b80fc2c852411261a692c834d2a4390ba7f2df`. Relevant code:
`examples/circlegraph/src/di.config.ts`, `packages/sprotty/src/model-source/local-model-source.ts`,
`src/base/views/{viewer.tsx,mouse-tool.ts,key-tool.ts}` and `src/features/select/select.ts`.
The reference checkout is not the installed release: its package uses Inversify ~8.2,
while the published 1.4.0 uses ^6.1.3. This experiment pins compatible 6.2.2 and uses
that release's ContainerModule callback convention. No reference/vendor file was edited
or copied wholesale. The adapter depends on public rendering/model APIs, and the next
upgrade must verify model schema, view attrs, event order and teardown semantics.

Results and comparative maintenance responsibilities:
[execution plan](../../../docs/plans/M6-canvas-comparison.md).
The current React/SVG route is retained; this experiment does not independently decide
to replace the product stack or close D-03.
