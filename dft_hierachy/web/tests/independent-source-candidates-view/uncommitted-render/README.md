# B44 uncommitted-render partial freeze

U01–03 use real public SDK/Nav/Selection, an explicit host-owned Suspense gate,
and actual React DOM commits. Expected behavior comes from DESIGN §6.18.1/3/5.
The actual candidate element precedes a post-candidate render/layout witness and
the throwing gate inside the SAME primary subtree. Suspended primary must have
rendered past that candidate, yet never have a primary layout commit. Fallback
alone or an outer wrapper render would not establish this experiment.

U01 unmounts before opening gate; U02 prepares both pairs before any render and
commits only the new pair, then opens the abandoned gate; U03 opens before resolving and explicitly flushSync-retries in the SAME host
stack with the SAME original state/page. Each flushSync return is checked before
the host stack yields, including synchronous passive effects; the layout witness
alone is not a whole-stack proof. A real ordinary passive-effect negative control
must be rejected. This is not all automatic/concurrent retries. No render/retry count
is a product assertion. Scope is only these Suspense interleavings, not all
uncommitted/concurrent render paths.
B44-SCOPE-01: transient Navigation subscribe-call counts before commit are not
specified. They are diagnostic only; no zero-count oracle or no-leak conclusion
is invented. Selection subscription is explicitly forbidden and still checked.

Only original public call/receiver/args/return/throw are observed. Gate Promise is
host-owned, not an original command Promise; no new Q1 observation/closure.
No original Promise handler/getter replacement, fake state, fake candidate UI,
product timers or trusted-device/Electron claims.

Explicit HIER_B_PRODUCT_ROOT and HIER_B_BROWSER_TOOLS are required; use node
facility.test.mjs via --test --test-reporter=tap, run.mjs --list, --controls or no
argument. Controls are real SDK premise plus three ordinary React experiments;
plus a passive-effect negative (five total); they are candidateUI=false and do not pass the three target tests.
Missing public SourceCandidatesView/CSS must exit1, executed0/blocked3/skip0.

Cleanup unmounts before resolving host gates, cancels host DOM waits, restores
original method taps, releases owned models/SDK/wire, waits two checkpoints and
removes native error/rejection observers. Global errors are retained, no
preventDefault. UI's full unsubscribe ownership paths are not claimed proven by
host model disposal. Existing historical artifacts and inputs are never rewritten.

B44-SCOPE-01：未提交阶段瞬时Navigation.subscribe调用次数未明定，标为诊断/未覆盖，不以实现选择0次；不把host最终dispose当UI无遗留订阅证明。52ae45c/7cc75a6的过强首稿/原结果保留，规范范围校正单独提交。
