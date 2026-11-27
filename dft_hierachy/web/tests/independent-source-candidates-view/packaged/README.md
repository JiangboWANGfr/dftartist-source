# B45 real outside-tarball capability freeze

Normative input: DESIGN §6.18.1/6 and §6.14.5, not A implementation or isolated proposal.
Run with absolute HIER_B_PRODUCT_ROOT, HIER_B_BROWSER_TOOLS and HIER_B_NPM_BIN.
Optional HIER_B_PACKAGE_EVIDENCE_ROOT is an existing owned absolute temp parent.
Use node run.mjs --list, node --test --test-reporter=tap facility.test.mjs, then node run.mjs.

Four products and the complete original local React/runtime/types dependency closure
are actually npm-packed/installed outside the workspace, with empty private cache,
offline/ignore-scripts/strict-peer-deps and no force/legacy-peer workaround.
Every command keeps full compressed stdout/stderr and every tarball keeps original
bytes/hash. The owned tarballs/install/cache remain for evidence, not a running job.

Four probes independently check root runtime exports, published strict types, CSS
resolution/read/parser and peer metadata/actual single React resolution/npm tree.
The positive type/source guard MUST pass before six isolated negatives run; otherwise
they are executed0/blocked6, not passes from missing-export/module errors.
All declarations (including React) must physically resolve inside consumer; only
TypeScript standard libraries may come from readonly tools. No paths/proposal/alias.

Root module import does not call/mount a candidate component. CSS availability and
parsing do not validate layout/focus/AX. Peer install/resolution is not proof of
candidate hooks or compatibility on untested React versions. No Core/Electron/Q1
execution or full M5 claim; existing DOM/type freeze counts stay separately scoped.
A setup failure blocks all four probes; missing named export/types/CSS after a
successful real install are independently executed capability failures. No skip.
