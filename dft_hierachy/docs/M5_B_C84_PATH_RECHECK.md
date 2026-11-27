# B7 C-84 path adaptation and bounded portability recheck

Date: 2026-10-17. Fixed product **fd08ae787ba9f3c85ef83408a5d7fcb96b6af082**,
DESIGN SHA256 **75e20f5b0637515f103c1cfdf508db227c155570c58baded3ec0de17011788a5**.
Three-path inputs frozen **e65a0329b190ab3228d40f6ef1aa7adca6df0689** before baseline execution.
Path-only correction **82b753148173b39cd4097832f5924575b5f880a8** before corrected executions.
[Input/acceptance plan](plans/C84-path-adaptation-independent.md),
[raw evidence](m5_b_c84_path_recheck.json).

**C-84/S02 independently reproduced and corrected:** original ASCII path10/10,
space and Chinese each9/10; identical three-path driver after native-path
correction3×10/10. Actual combined-space/Chinese checkout compatibility10/10
and M4 **294/294**, zero skip. C alone can close C-84 after reviewing the fixed
correction; B does not close C's finding.

**No full portable-checkout approval:** the combined-path complete command exits1,
**810 executed /767 pass /43 facility-startup failures**, zero skip. S02 passes;
three older B tree worker entry paths remain URL-encoded and fail before their
inner semantic scenarios start. Later chained runtime groups do not execute.
This is **B-PATH-02**, separate from C-84/S02 and from product functionality.

## Change and oracle protection

Only `web/tests/independent-transport-sharing/compatibility.test.mjs` gains
the Node URL conversion import and wraps the existing verify-types URL in
fileURLToPath. No expectation/count/input/hash is changed. S01 export assertions,
S02 old/new public consumers, positive prerequisite, seven genuine semantic
type negatives and node587-byte/SHA pin are retained; S03–S09 byte-identical.
Historical pre-identity source, realm controls, old reports and red evidence
are untouched. No A implementation/diff/selftests used to form the oracle.
Shared delivery summaries and C's finding were read; this is not strictly blind.

No production TS/Core source, API/ABI/IPC/protocol/schema/config/dependency/lock
or project format changes. This necessary B test-execution adaptation does not
reopen Source/property/renderer behavior or BD-SOURCE-01.

## Actual contexts and commands

Ordinary pure product P=`/tmp/hier-b-orch7-gates.WmVvAE3d/source`.
Combined-path S=`/tmp/hier-b-orch7-gates.WmVvAE3d/checkout with space 中文`.
B=`/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree`. Node24.21.0/macOS arm64.

The three-path driver copies only six B input files into distinct temporary
ASCII/space/Chinese roots, launches the actual original compatibility suite
and uses P's explicit public packages. It is not three full product checkouts.
Separately S is a fresh full detached product checkout, independently installed
and built, then explicitly overlaid with exactly the one corrected B file.

| Actual command / context                                                                                                      | Exit and result                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `HIER_B_PRODUCT_ROOT=P HIER_B_COMPAT_INPUT_ROOT=P node web/tests/independent-source-gates/c84-paths.mjs` / B                  | **1**; ASCII10pass, space9pass1fail, Chinese9pass1fail; all3 fixtures executed, zero skip; original encoded MODULE_NOT_FOUND preserved |
| Same driver without input override after frozen correction / B                                                                | **0**; three paths each10pass; no changed assertion                                                                                    |
| `git worktree add --detach S fd08ae7`; `npm --prefix web ci --offline --no-audit --no-fund`; `npm --prefix web run check` / S | 0; fresh71 packages and generated/TS/layer gates including seven rejection probes                                                      |
| Pure S `node --test web/tests/independent-transport-sharing/compatibility.test.mjs`                                           | **1**;10executed/9pass1fail, S02 percent-encoded consumer path                                                                         |
| Same S command with explicit one-file B correction overlay                                                                    | **0**;10/10, zero skip; S02 actually runs public positive/seven negatives and original node declaration pin                            |
| Revalidated six third-party source SHAs/clean; CMake configure then fresh `--target hier -j 4` / S                            | 0; own **78.78sec** RelWithDebInfo, zero build warnings; M3/FUTURE ON, observer/sanitize/experiments OFF                               |
| `HIER_BIN=S/core/build-b-review/hier npm --prefix web run test:independent:m4` / S                                            | **0;294=268TAP+26**, 3.08sec, zero skip; real own Core used                                                                            |
| `HIER_BIN=S/core/build-b-review/hier npm --prefix web run test:independent` / S                                               | **1;810TAP/767pass43fail**, 3.35sec; no later JSON runtime group reached; not1628 executed                                             |
| `c84-audit.mjs` / B with explicit P/S/main/old-prefix                                                                         | 0; exact approved two syntactic edits/one-file overlay, remaining bytes and old history protected                                      |
| Existing B7 `verify-evidence.mjs` / B explicitly bound to original pure P                                                     | 0; original31 captures/77pins/294/1628 historical result remains intact; verifier executes zero product semantics                      |
| Relevant Prettier / whitespace / archive verification                                                                         | Final0; no product expectation modified                                                                                                |

S binary **9328216 bytes**, SHA256
**6ee7e65ae97aab02d086934564941016e05ad8a93899fe1dd88a95140377a0f0**.
No A/C binaries/objects or ordinary-P Core binary was reused in S.
Own Core processes observed after tests: zero; temporary driver input trees
removed in finally. Neither observation proves universal leak freedom.

Ordinary P's complete **1628/1628** and M4 **294/294** belong to earlier
[fixed B report](M5_B_SOURCE_GATES_RECHECK.md), commit **d63a16361d620410ba46af18c4d23c9bfc9bd005**.
Those executions are not rerun or relabeled as combined-path post-correction green.

## B-PATH-02: remaining test-facility followup

The same combined checkout fails only the first Node segment at these three
older B runner URL.pathname uses:

| B file                                                            | Observed failed outer tests |
| ----------------------------------------------------------------- | --------------------------- |
| `web/tests/independent-tree/diagnostic-callable.probe.mjs`        | F75:30                      |
| `web/tests/independent-tree/diagnostic-read-followups.test.mjs`   | R10/R11:4                   |
| `web/tests/independent-tree/diagnostic-task-boundaries.probe.mjs` | Q01–Q03:9                   |

All43 are encoded worker-path MODULE_NOT_FOUND startup errors, not43 failed
inner product semantic assertions. Normal-path original810 remains green.
No skip, failure suppression, expected-red-as-pass or bulk frozen-file rewrite
was used. Keep this red, not an unconditional portable full-gate conclusion.

Separate next B task: preserve those original sources/43 red outputs, freeze
same behavior under plain/space/Unicode directories and perform only necessary
native-path execution adaptations before rerunning full combined-path gate.
Also inspect the three static pathname uses in independent-properties core,
core-runtime and cases; **they were not reached here**, so no runtime failure
or success is claimed for them. This is beyond C-84's S02-only correction;
the fix commit82b7531 is independently importable.

## Evidence and protected state

Machine archive **190879 bytes**, SHA256
**de92c463bc1fab20b29e44a671a41ad873b1e91e0db427e9dbd5395f3986d99e**:
**40 captures** (including8 ordinary-closeout receipts),5 B source pins,
1 full original S02 source material; **54 checked gzip blocks /351173 raw /
81018 gzip bytes** including nested driver outputs and native cache.
Exactly three nonzero captures are preserved: original3-path baseline,
pure combined-path compatibility, and combined-path full gate.
Subprocess stdout/stderr, actual argv/cwd/UTC/exit/time/signal and byte hashes
are retained. A failed apply_patch context attempt before editing the uncommitted
evidence verifier was a tool context mismatch; no file change or product red.

`node web/tests/independent-source-gates/c84-verify-evidence.mjs` checks exact
historical red/green records, source pins/binary and counts, **zero current
product semantics**. Post-generation formatter/verifier/report/commit checks
are separate actual receipts, not recursively stored in this archive.

P826 tracked files stay pure, S825 non-target tracked files unchanged,
B574 original non-target files unchanged, shared825 non-log files and18 old
untracked files protected. Both B7 original log prefix1623185/e917af... and
C-84 prefix **1637064 bytes /
0cbcbf1dccd641facc670161b3cd0621e0e47b3250e6959fc3dde5713575bf8a** retained.
Shared log only appended, not committed; original M3-coordination/research intact.

## Handoff and limits

**A:** import path-only82b7531 and driver freezee65a032 unchanged, plus this report
as desired. Ordinary wiring accepted; combined-path M4 accepted with explicit
B test overlay. Do not report full portable gate green; B-PATH-02 is open.
**C:** C-84 fixed input/red-green evidence ready for your closure decision;
B does not close it or add a contract approval. The remaining43 are older B
execution-facility paths, not a product regression or reason to reopen Source.
**B followup:** B-PATH-02 needs its own bounded path-only correction; no A/C/D
takeover. This cycle ends with exact evidence and remaining scope, not a claim
that all portable checkout tests are done.

No native CTest trio/Debug/ASan/fullcheck.sh/TS Schema655 repeated. No real
Electron/UI/AX/SourceView/reverse navigation, L06/L09–11, M7, Linux/remoteCI or
generic leak/SLA approval. Current first edition excludes persistence/migration.
D-03 remains M6-only. No new sessions, timers, A/C/D messages or old monitor ack.
